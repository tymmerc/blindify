import { isOwnerGuess, ownerChoices, ownerQuestionOpen } from "./roundOwners";
import { evaluateGuessDetail, type GuessDetail } from "./guessMatching";
import {
  promoteWaiting,
  publicWaiting,
  withWaiting,
  withWaitingConnection,
  withoutWaiting,
  type PublicWaitingPlayer,
  type WaitingPlayer,
} from "./lateJoiners";
import { answerStep, stepAfter, type RoundPacing } from "./roundPacing";
import { roundPoints, type RoundPoints } from "./roundScoring";
import { createBackupWriter, serializeGame, type RestoredGame } from "./gameBackup";
import { onRedisReady } from "../config/redis";

export type Verdict = "correct" | "close" | "wrong";

export type RoundTrack = {
  round: number;
  trackId: string;
  audioSourceId?: string | number;
  title: string;
  artist: string;
  previewUrl: string | null;
  albumCover?: string | null;
  metadata?: Record<string, unknown> | null;
  ownerChoices?: number[];
  /** false : pas de « qui a ajoute ? » cette manche (moins de 3 joueurs, T7). */
  ownerQuestion?: boolean;
  // Source du morceau : jamais copiee par redactedGuessingTrack (reveal seulement).
  provider?: string | null;
};

export type PlayerState = {
  userId: number;
  username: string | null;
  avatar?: string | null;
  score: number;
  accuracy: number;
  rounds: number;
  correct: number;
  streak: number;
  bestStreak: number;
  hasAnswered: boolean;
  isReady: boolean;
  disconnected?: boolean;
  lastGuess?: string;
  lastGuessTitle?: string | null;
  lastGuessArtist?: string | null;
  lastSourceGuess?: number | null;
  lastVerdict?: Verdict;
  /** Au reveal (T38) : le titre, l'artiste, le « de qui » de sa reponse etaient-ils justes ? */
  lastTitleOk?: boolean;
  lastArtistOk?: boolean;
  lastOwnerOk?: boolean;
  answerAt?: number | null;
  lastGained?: number;
  /** Detail des points de la manche (T43), au reveal seulement. */
  lastPoints?: RoundPoints;
  /** Cumul des temps de réponse (ms) — sert UNIQUEMENT au départage d'égalité. */
  totalReactionMs?: number;
  /**
   * Absent (T22) : aucune reponse depuis ABSENT_AFTER_MISSED_ROUNDS manches,
   * connecte ou non. Il reste au classement, marque, sans retenir la manche.
   * Il revient des qu'il repond ou touche « Je suis là ».
   */
  absent?: boolean;
  /** Manches ou il a vraiment repondu (« Je sais pas » compris). */
  answeredRounds?: number;
};

/**
 * Partie en veille (T22) : plus aucun joueur connecte, ou personne n'a repondu
 * depuis SILENT_ROUNDS_BEFORE_PAUSE manches. Elle est en pause et s'arrete
 * d'elle-meme a `stopAt` (heure serveur, ms) si personne ne revient.
 */
export type IdlePause = { reason: "empty" | "silent"; stopAt: number };

export type GameState = {
  roomCode: string;
  hostUserId: number | null;
  hostPlays?: boolean;
  /**
   * L'hote est-il toujours connecte ? En mode event il diffuse la musique pour
   * toute la table, et quand il presente seulement il n'apparait PAS dans
   * `players` : sa presence ne peut donc pas se deduire de cette liste.
   */
  hostConnected?: boolean;
  singleContributor?: boolean;
  mode: string;
  phase: "LOBBY" | "GUESSING" | "REVEAL" | "FINISHED";
  currentRound: number;
  totalRounds: number;
  /**
   * Manches demandees par l'hote. Plus grand que totalRounds quand les
   * bibliotheques n'avaient pas assez de titres jouables : l'ecran le dit.
   */
  requestedRounds?: number;
  /** Pourquoi moins de manches : "library" (playlists trop courtes) ou "lookup" (recherches d'extraits limitees). */
  shortReason?: "library" | "lookup" | null;
  currentTrack: RoundTrack | null;
  timing: {
    startAt: number | null;
    revealAt: number | null;
  };
  players: Record<number, PlayerState>;
  /**
   * Arrives en cours de partie (T19) : ils regardent et jouent a partir de la
   * manche suivante. Jamais dans `players` tant qu'ils attendent.
   */
  waiting?: PublicWaitingPlayer[];
  /** Partie mise en pause par l'hote (timers geles cote serveur). */
  paused?: boolean;
  /** Pause de veille (T22), posee par le serveur ; null sinon. */
  idle?: IdlePause | null;
  /**
   * Absents de la partie d'avant (T22), pas repris dans celle-ci. Ils
   * regardent et reviennent en touchant « Je reviens ».
   */
  absentees?: PublicWaitingPlayer[];
  /**
   * Ecran en cours pendant la phase REVEAL (T38) : la reponse puis le
   * classement, chacun jusqu'a `endsAt`. null hors REVEAL.
   */
  pacing?: RoundPacing | null;
  config: { autoAdvance: boolean; roundDurationMs: number };
};

type GameContext = {
  state: GameState;
  /** Id de la salle en base : la copie de secours reconnait ainsi sa salle. */
  roomId?: number;
  tracks: RoundTrack[];
  mode: string;
  roundDurationMs: number;
  sessionId?: number;
  /** Duree de la grace de reconnexion (DISCONNECT_GRACE_MS, sauf tests). */
  reconnectGraceMs: number;
  /** Fin de grace (ms) des joueurs coupes pendant la manche en cours, par userId. */
  graceUntil: Readonly<Record<number, number>>;
  /** Retardataires en attente de la manche suivante (voir lateJoiners.ts). */
  waiting: readonly WaitingPlayer[];
  /**
   * Joueurs du lancement : seuls candidats du « qui a mis ce morceau ? ». Un
   * retardataire n'a mis aucun morceau dans cette partie.
   */
  launchPlayerIds: ReadonlySet<number>;
  /** Manches de suite sans reponse, par joueur (T22). */
  missed: Record<number, number>;
  /** Manches de suite ou aucun joueur n'a repondu (T22). */
  silentRounds: number;
  /** Depuis quand (ms) plus aucun joueur n'est connecte ; null sinon (T22). */
  emptySince: number | null;
  /** La pause en cours vient-elle de la veille (T22) plutot que de l'hote ? */
  pausedByIdle: boolean;
  /**
   * Manche coupee par un redemarrage du serveur (reprise depuis Redis) : a sa
   * revelation, personne n'y est compte absent. null sinon.
   */
  restoredRound?: number | null;
};

/**
 * Temps pour repondre quand l'hote n'a rien regle (T42) : 30 s. A 20 s, la
 * soiree du 14/11 a 11 joueurs n'avait que 2 reponses sur 10 a la manche 1 ;
 * a 30 s, 5 a 8 joueurs sur 10 repondaient a chaque manche.
 */
export const DEFAULT_LISTENING_MS = 30_000;

/**
 * Grace de reconnexion, decidee par Tym le 02/10/2026 : un joueur coupe du
 * reseau en pleine manche (pas le bouton "Quitter") sans avoir repondu a 5 s
 * pour revenir avant que la manche soit revelee en avance. Avant, une coupure
 * d'une seconde (tunnel, wifi vers 4G, ecran verrouille) lui faisait perdre la
 * manche des que tous les autres avaient repondu. La fin normale de la manche
 * (son minuteur) ne l'attend jamais.
 */
export const DISCONNECT_GRACE_MS = 5_000;

/**
 * Seuils des parties fantomes (T22), justifies dans la PR :
 * - 3 manches sans reponse (pas meme « Je sais pas ») : le joueur est absent.
 *   Une erreur ne coute rien, il revient a sa premiere reponse.
 * - 3 manches ou personne ne repond : la partie se met en veille.
 * - plus aucun joueur connecte depuis 15 s (au-dela des 5 s de grace et d'un
 *   rechargement de page) : en veille aussi, sans bruler de manche.
 * - 2 min de veille sans retour : la partie s'arrete (chemin de T42).
 */
export const ABSENT_AFTER_MISSED_ROUNDS = 3;
export const SILENT_ROUNDS_BEFORE_PAUSE = 3;
export const EMPTY_PAUSE_MS = 15_000;
export const IDLE_STOP_MS = 120_000;

/**
 * Reprise apres un redemarrage du serveur : le chrono de la partie repart
 * 5 s apres la reprise. C'est le temps que met le client socket.io pour
 * revenir (il retente toutes les 5 s au plus, a +/- 50 %), et la meme duree
 * que la grace de reconnexion (DISCONNECT_GRACE_MS).
 */
export const RESTART_GRACE_MS = 5_000;

/**
 * Absents par salle (T22), au-dela d'une partie : Rejouer ne les reprend pas.
 * En memoire seulement, comme les parties : un redemarrage les oublie.
 */
const roomAbsent = new Map<string, Map<number, { username: string | null; avatar: string | null; since: number }>>();
/** Oubli des absences d'une salle restee sans nouvelles (salle fermee, soiree finie). */
const ROOM_ABSENT_TTL_MS = 6 * 60 * 60_000;

function setRoomAbsent(roomCode: string, player: { userId: number; username: string | null; avatar?: string | null }, now = Date.now()): void {
  touchIfLive(roomCode);
  let users = roomAbsent.get(roomCode);
  if (!users) {
    users = new Map();
    roomAbsent.set(roomCode, users);
  }
  users.set(player.userId, { username: player.username, avatar: player.avatar ?? null, since: now });
}

function clearRoomAbsent(roomCode: string, userId: number): void {
  const users = roomAbsent.get(roomCode);
  if (!users?.has(userId)) return;
  touchIfLive(roomCode);
  users.delete(userId);
  if (users.size === 0) roomAbsent.delete(roomCode);
}

/** Joueurs notes absents dans cette salle (Rejouer les laisse de cote). */
export function roomAbsentUserIds(roomCode: string): number[] {
  return Array.from(roomAbsent.get(roomCode)?.keys() ?? []);
}

/** Rejouer reprend quand meme ces absents (pas assez de joueurs sans eux). */
export function forgetRoomAbsence(roomCode: string, userIds: readonly number[]): void {
  for (const id of userIds) clearRoomAbsent(roomCode, id);
}

/** Menage des absences trop vieilles (appele par le filet de veille). */
export function pruneRoomAbsences(now = Date.now()): void {
  for (const [roomCode, users] of roomAbsent) {
    for (const [id, entry] of users) {
      if (now - entry.since <= ROOM_ABSENT_TTL_MS) continue;
      users.delete(id);
      touchIfLive(roomCode);
    }
    if (users.size === 0) roomAbsent.delete(roomCode);
  }
}

function isRoomAbsent(roomCode: string, userId: number): boolean {
  return roomAbsent.get(roomCode)?.has(userId) ?? false;
}

/** Les absents qui ne jouent pas cette partie : ni joueurs, ni en attente. */
function syncAbsentees(ctx: GameContext): void {
  const users = roomAbsent.get(ctx.state.roomCode);
  ctx.state.absentees = Array.from(users?.entries() ?? [])
    .filter(([id]) => !ctx.state.players[id] && !ctx.waiting.some(w => w.userId === id))
    .map(([userId, entry]) => ({ userId, username: entry.username }));
}

function graceMsOrDefault(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : DISCONNECT_GRACE_MS;
}

/** Une partie en memoire, telle que la copie de secours la garde. */
export type LiveGame = GameContext & { pausedAt?: number | null };

const games = new Map<string, LiveGame>();

// Copie de secours dans Redis (services/gameBackup.ts). Une partie finie n'a
// plus de copie : rien a reprendre apres un redemarrage.
const backup = createBackupWriter(roomCode => backupSnapshot(roomCode));

/** La copie de secours d'une salle telle qu'elle partirait maintenant (null : rien a garder). */
export function backupSnapshot(roomCode: string, now = Date.now()): string | null {
  const game = games.get(roomCode);
  return game && game.state.phase !== "FINISHED" ? serializeGame(game, roomAbsent.get(roomCode), now) : null;
}

/** La partie a modifier : sa copie partira, groupee, au prochain tour de boucle. */
function edit(roomCode: string): LiveGame | undefined {
  const game = games.get(roomCode);
  if (game) backup.markDirty(roomCode);
  return game;
}

/** Les absences de la salle changent : elles sont dans la copie de sa partie. */
function touchIfLive(roomCode: string): void {
  if (games.has(roomCode)) backup.markDirty(roomCode);
}

/**
 * Remet toutes les parties dans la file des copies : au retour de Redis, et
 * toutes les 5 s par le filet de veille. Une copie identique n'est reecrite
 * qu'au bout de 10 min (services/gameBackup.ts), ce qui remet sa duree de vie
 * a zero meme pendant une longue pause sans aucun changement.
 */
export function refreshGameBackups(): void {
  for (const roomCode of games.keys()) backup.markDirty(roomCode);
}
onRedisReady(refreshGameBackups);

/** Attend que les copies de secours en cours soient parties (tests). */
export function gameBackupsSettled(): Promise<void> {
  return backup.settled();
}

export function bootstrapGameState(params: {
  roomCode: string;
  hostUserId: number;
  hostPlays?: boolean;
  singleContributor?: boolean;
  tracks: RoundTrack[];
  /** Manches demandees (question_count) ; par defaut, le nombre de pistes. */
  requestedRounds?: number;
  /** Pourquoi moins de manches : "library" (playlists trop courtes) ou "lookup" (recherches d'extraits limitees). */
  shortReason?: "library" | "lookup" | null;
  participants: Array<{ userId: number; username: string | null; avatar?: string | null }>;
  mode?: string;
  config?: { roundDurationMs?: number; autoAdvance?: boolean };
  sessionId?: number;
  /** Id de la salle en base (copie de secours). */
  roomId?: number;
  /** Reglable pour les tests d'integration ; la prod garde DISCONNECT_GRACE_MS. */
  reconnectGraceMs?: number;
}): GameState {
  const initialPlayers: Record<number, PlayerState> = {};
  for (const participant of params.participants) {
    initialPlayers[participant.userId] = {
      userId: participant.userId,
      username: participant.username ?? null,
      avatar: participant.avatar ?? null,
      score: 0,
      accuracy: 0,
      rounds: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      hasAnswered: false,
      isReady: false,
    };
  }

  const state: GameState = {
    roomCode: params.roomCode,
    hostUserId: params.hostUserId,
    hostPlays: params.hostPlays ?? false,
    hostConnected: true,
    singleContributor: params.singleContributor ?? false,
    mode: params.mode ?? "friends",
    phase: "LOBBY",
    currentRound: 0,
    totalRounds: params.tracks.length,
    requestedRounds: params.requestedRounds ?? params.tracks.length,
    shortReason: params.shortReason ?? null,
    currentTrack: null,
    timing: {
      startAt: null,
      revealAt: null,
    },
    players: initialPlayers,
    waiting: [],
    pacing: null,
    config: {
      autoAdvance: params.config?.autoAdvance ?? false,
      roundDurationMs: params.config?.roundDurationMs ?? DEFAULT_LISTENING_MS,
    },
  };

  const roundDurationMs = params.config?.roundDurationMs ?? DEFAULT_LISTENING_MS;
  games.set(params.roomCode, {
    state,
    tracks: params.tracks,
    mode: params.mode ?? "friends",
    roundDurationMs,
    sessionId: params.sessionId,
    roomId: params.roomId,
    pausedAt: null,
    reconnectGraceMs: graceMsOrDefault(params.reconnectGraceMs),
    graceUntil: {},
    waiting: [],
    launchPlayerIds: new Set(Object.keys(initialPlayers).map(Number)),
    missed: {},
    silentRounds: 0,
    emptySince: null,
    pausedByIdle: false,
    restoredRound: null,
  });
  syncAbsentees(games.get(params.roomCode)!);
  backup.markDirty(params.roomCode);
  return state;
}

/** Codes des salles qui ont une partie en memoire (filet anti-blocage). */
export function liveRoomCodes(): string[] {
  return Array.from(games.keys());
}

export function getGameState(roomCode: string): GameState | undefined {
  return games.get(roomCode)?.state;
}

/** DB session id backing this room's game, if it was started with persistence. */
export function getSessionId(roomCode: string): number | undefined {
  return games.get(roomCode)?.sessionId;
}

export function getGameMode(roomCode: string): string | undefined {
  return games.get(roomCode)?.mode;
}

/** Joueurs qui jouent les manches, connectes ou non. */
function playingPlayers(ctx: GameContext): PlayerState[] {
  const players = Object.values(ctx.state.players);
  // En event, l'hote presente (exclu) SAUF s'il a choisi "je joue aussi".
  if (ctx.mode === "event" && ctx.state.hostUserId && !ctx.state.hostPlays) {
    return players.filter(p => p.userId !== ctx.state.hostUserId);
  }
  return players;
}

export function allAnswerablePlayers(roomCode: string): PlayerState[] {
  const ctx = games.get(roomCode);
  if (!ctx) return [];
  // Exclude disconnected players so they don't block or prematurely trigger reveals
  return playingPlayers(ctx).filter(p => !p.disconnected);
}

export function pauseGame(roomCode: string, now = Date.now()): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.paused) return ctx.state;
  if (ctx.state.phase !== "GUESSING" && ctx.state.phase !== "REVEAL") return ctx.state;
  ctx.pausedAt = now;
  ctx.state.paused = true;
  return ctx.state;
}

export function resumeGame(roomCode: string, now = Date.now()): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  if (!ctx.state.paused) return ctx.state;
  // Decaler les horloges du temps passe en pause : le chrono reprend ou il en
  // etait, et l'audio se resynchronise tout seul (seek base sur startAt).
  const delta = now - (ctx.pausedAt ?? now);
  if (ctx.state.timing.startAt) ctx.state.timing.startAt += delta;
  if (ctx.state.timing.revealAt) ctx.state.timing.revealAt += delta;
  // Les reponses deja recues glissent avec : sans ca, une reponse donnee
  // avant la pause tombait avant le nouveau startAt et valait 1000 (T43).
  if (ctx.state.phase === "GUESSING") {
    for (const player of Object.values(ctx.state.players)) {
      if (player.answerAt != null) player.answerAt += delta;
    }
  }
  if (ctx.state.pacing) ctx.state.pacing = { ...ctx.state.pacing, endsAt: ctx.state.pacing.endsAt + delta };
  ctx.graceUntil = gracesAfterPause(ctx.graceUntil, delta, now + ctx.reconnectGraceMs);
  ctx.pausedAt = null;
  ctx.state.paused = false;
  // Reprise (hote, joueur revenu) : la veille repart de zero.
  ctx.state.idle = null;
  ctx.pausedByIdle = false;
  ctx.silentRounds = 0;
  ctx.emptySince = null;
  return ctx.state;
}

/**
 * Met la partie en veille (T22). Une pause de l'hote deja posee reste la
 * sienne : la veille n'y ajoute que l'heure d'arret.
 */
function idlePause(ctx: GameContext & { pausedAt?: number | null }, reason: IdlePause["reason"], now: number): void {
  if (!ctx.state.paused) {
    ctx.pausedAt = now;
    ctx.state.paused = true;
    ctx.pausedByIdle = true;
  }
  ctx.state.idle = { reason, stopAt: now + IDLE_STOP_MS };
}

export type IdleDecision = "none" | "pause" | "resume" | "clear" | "stop";

/** La pause en cours a-t-elle ete posee par la veille (T22), pas par l'hote ? */
export function isPausedByIdle(roomCode: string): boolean {
  return games.get(roomCode)?.pausedByIdle === true;
}

/**
 * Le filet des parties fantomes (T22), pour une salle. `isConnected` dit si un
 * joueur a encore un socket dans la salle. L'hote qui presente seulement n'est
 * pas un joueur : il ne garde pas a lui seul une partie en vie, et il ne la
 * fait jamais croire vide tant qu'un joueur est la.
 * - "pause" : plus aucun joueur depuis EMPTY_PAUSE_MS, la partie vient de se figer ;
 * - "resume" : un joueur est revenu dans une partie figee faute de joueurs ;
 * - "clear" : un joueur est revenu pendant une pause de l'hote, seule l'heure d'arret tombe ;
 * - "stop" : la veille a dure IDLE_STOP_MS, l'appelant arrete la partie.
 */
export function idleCheck(roomCode: string, isConnected: (userId: number) => boolean, now = Date.now()): IdleDecision {
  const ctx = games.get(roomCode);
  if (!ctx || (ctx.state.phase !== "GUESSING" && ctx.state.phase !== "REVEAL")) return "none";
  const someone = playingPlayers(ctx).some(p => !p.disconnected && isConnected(p.userId));
  // Passe toutes les 5 s : la copie ne part que si quelque chose change.
  if (someone) {
    if (ctx.emptySince !== null) {
      ctx.emptySince = null;
      backup.markDirty(roomCode);
    }
    if (ctx.state.idle?.reason === "empty") {
      if (ctx.pausedByIdle) {
        resumeGame(roomCode, now);
        return "resume";
      }
      // Pause de l'hote : elle reste, seule l'heure d'arret tombe.
      ctx.state.idle = null;
      backup.markDirty(roomCode);
      return "clear";
    }
  } else {
    if (ctx.emptySince === null) {
      ctx.emptySince = now;
      backup.markDirty(roomCode);
    }
    if (!ctx.state.idle && now - ctx.emptySince >= EMPTY_PAUSE_MS) {
      idlePause(ctx, "empty", now);
      backup.markDirty(roomCode);
      return "pause";
    }
  }
  if (ctx.state.idle && now >= ctx.state.idle.stopAt) return "stop";
  return "none";
}

/**
 * « Je suis là » (T22) : le joueur n'est plus absent, ni pour cette partie ni
 * pour la suivante. Une partie en veille repart. Rend :
 * - "player" : joueur de la partie (absence levee, veille levee) ;
 * - "back" : absent de la partie d'avant, il peut entrer (admitToGame) ;
 * - "none" : pas de partie ou rien a faire.
 */
export function markPresent(roomCode: string, userId: number, now = Date.now()): "player" | "back" | "none" {
  const wasRoomAbsent = isRoomAbsent(roomCode, userId);
  clearRoomAbsent(roomCode, userId);
  const ctx = edit(roomCode);
  if (!ctx) return "none";
  const player = ctx.state.players[userId];
  if (!player) {
    syncAbsentees(ctx);
    return wasRoomAbsent ? "back" : "none";
  }
  player.absent = false;
  ctx.missed = { ...ctx.missed, [userId]: 0 };
  if (ctx.state.idle && playingPlayers(ctx).some(p => p.userId === userId)) {
    if (ctx.pausedByIdle) resumeGame(roomCode, now);
    else ctx.state.idle = null;
  }
  return "player";
}

/**
 * Les graces de reconnexion sont gelees par la pause comme le chrono : les
 * reponses y sont refusees, un joueur coupe ne doit pas y perdre sa grace.
 * Celle qui courait reprend ou elle en etait, celle d'une coupure pendant la
 * pause part entiere de la reprise (`latest`), celle deja finie le reste.
 */
function gracesAfterPause(
  graceUntil: Readonly<Record<number, number>>,
  delta: number,
  latest: number,
): Readonly<Record<number, number>> {
  return Object.fromEntries(
    Object.entries(graceUntil).map(([userId, until]) => [userId, Math.min(until + delta, latest)]),
  );
}

export function setHostConnected(roomCode: string, connected: boolean): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  ctx.state.hostConnected = connected;
  return ctx.state;
}

/**
 * Nouvel hote apres un relais (salon Discord, hors partie en cours) : l'etat en
 * memoire suit la base, pour que Rejouer et la presence de l'hote designent le
 * bon joueur. Sans effet en pleine manche (le relais ne s'y fait jamais).
 */
export function setHostUser(roomCode: string, userId: number): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase === "GUESSING" || ctx.state.phase === "REVEAL") return ctx.state;
  ctx.state.hostUserId = userId;
  ctx.state.hostConnected = true;
  return ctx.state;
}

export function markDisconnected(roomCode: string, userId: number): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  const player = ctx.state.players[userId];
  if (!player) {
    if (ctx.waiting.some(w => w.userId === userId)) setWaiting(ctx, withWaitingConnection(ctx.waiting, userId, false));
    return ctx.state;
  }
  player.disconnected = true;
  return ctx.state;
}

export function markReconnected(roomCode: string, userId: number): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  const player = ctx.state.players[userId];
  if (!player) {
    if (ctx.waiting.some(w => w.userId === userId)) setWaiting(ctx, withWaitingConnection(ctx.waiting, userId, true));
    return ctx.state;
  }
  player.disconnected = false;
  // Revenu : sa grace est consommee. Une nouvelle coupure en ouvrira une neuve,
  // un depart par "Quitter" n'en aura pas.
  endReconnectGrace(roomCode, userId);
  return ctx.state;
}

/**
 * Leve la grace de reconnexion d'un joueur : il est revenu, ou il est parti
 * par "Quitter" (plus personne a attendre).
 */
export function endReconnectGrace(roomCode: string, userId: number): void {
  const ctx = edit(roomCode);
  if (!ctx || !(userId in ctx.graceUntil)) return;
  const { [userId]: _ended, ...others } = ctx.graceUntil;
  ctx.graceUntil = others;
}

/**
 * Ouvre la grace de reconnexion d'un joueur coupe du reseau pendant la manche
 * (voir DISCONNECT_GRACE_MS). Rend la fin de la grace, ou null quand il n'y a
 * personne a attendre : pas de manche en cours, joueur inconnu, ou reponse
 * deja donnee avant la coupure.
 */
export function startReconnectGrace(roomCode: string, userId: number, now = Date.now()): number | null {
  const ctx = edit(roomCode);
  if (!ctx || ctx.state.phase !== "GUESSING") return null;
  const player = ctx.state.players[userId];
  if (!player || player.hasAnswered) return null;
  const until = now + ctx.reconnectGraceMs;
  ctx.graceUntil = { ...ctx.graceUntil, [userId]: until };
  return until;
}

export type EarlyRevealDecision =
  | { kind: "none" }
  | { kind: "wait"; until: number }
  | { kind: "reveal" };

/**
 * Revelation anticipee : la manche peut-elle etre revelee avant son minuteur ?
 * - "reveal" : tous les joueurs connectes ont repondu, personne a attendre ;
 * - "wait" : eux aussi, mais un joueur coupe sans avoir repondu est encore
 *   dans sa grace de reconnexion ; `until` est la fin de la plus tardive ;
 * - "none" : la manche continue (un connecte n'a pas repondu, personne n'est
 *   connecte, pause de l'hote, ou pas de manche en cours).
 */
export function earlyRevealDecision(roomCode: string, now = Date.now()): EarlyRevealDecision {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase !== "GUESSING" || ctx.state.paused) return { kind: "none" };
  // Un absent (T22) ne retient pas la manche, connecte ou non : la table
  // n'attend plus quelqu'un qui ne joue plus.
  const players = playingPlayers(ctx).filter(p => !p.absent);
  const connected = players.filter(p => !p.disconnected);
  if (connected.length === 0 || !connected.every(p => p.hasAnswered)) return { kind: "none" };
  const pending = players
    .filter(p => p.disconnected && !p.hasAnswered)
    .map(p => ctx.graceUntil[p.userId] ?? 0)
    .filter(until => until > now);
  return pending.length > 0 ? { kind: "wait", until: Math.max(...pending) } : { kind: "reveal" };
}

export function clearGame(roomCode: string): void {
  games.delete(roomCode);
  backup.markDirty(roomCode);
}

/**
 * Reprend en memoire une partie relue dans Redis apres un redemarrage
 * (services/gameRestore.ts). Le temps perdu est rendu : toutes les heures
 * absolues de la partie glissent de la duree de l'arret, plus RESTART_GRACE_MS.
 * La manche, l'ecran du reveal, la pause et la veille reprennent donc ou ils en
 * etaient. Tout le monde est marque coupe jusqu'a son room:join ; ceux qui
 * n'avaient pas repondu ont une grace, pour qu'un retour plus lent qu'un autre
 * ne declenche pas la revelation anticipee sans eux. L'appelant relance les
 * minuteurs (rescheduleAfterResume).
 */
export function restoreGame(saved: Pick<RestoredGame, "game" | "roomAbsent" | "savedAt">, now = Date.now()): GameState {
  const game = saved.game;
  const state = game.state;
  const shift = Math.max(0, now - saved.savedAt) + RESTART_GRACE_MS;
  const later = (t: number | null) => (t == null ? null : t + shift);
  state.timing = { startAt: later(state.timing.startAt), revealAt: later(state.timing.revealAt) };
  if (state.pacing) state.pacing = { ...state.pacing, endsAt: state.pacing.endsAt + shift };
  if (state.idle) state.idle = { ...state.idle, stopAt: state.idle.stopAt + shift };
  if (game.emptySince != null) game.emptySince += shift;
  if (game.pausedAt != null) game.pausedAt += shift;
  const graces: Record<number, number> = {};
  for (const [userId, until] of Object.entries(game.graceUntil)) graces[Number(userId)] = until + shift;
  for (const player of Object.values(state.players)) {
    if (player.answerAt != null) player.answerAt += shift;
    player.disconnected = true;
    if (state.phase === "GUESSING" && !player.hasAnswered) {
      graces[player.userId] = Math.max(graces[player.userId] ?? 0, now + RESTART_GRACE_MS + game.reconnectGraceMs);
    }
  }
  game.graceUntil = graces;
  game.waiting = game.waiting.map(w => ({ ...w, disconnected: true }));
  state.hostConnected = false;
  if (state.phase === "GUESSING") game.restoredRound = state.currentRound;
  games.set(state.roomCode, game);
  if (saved.roomAbsent.size > 0) {
    const users = new Map<number, { username: string | null; avatar: string | null; since: number }>();
    for (const [userId, entry] of saved.roomAbsent) users.set(userId, { ...entry, since: entry.since + shift });
    roomAbsent.set(state.roomCode, users);
  }
  // La copie suit : heures decalees, joueurs coupes.
  backup.markDirty(state.roomCode);
  return state;
}

export function startNextRound(roomCode: string, opts?: { forceRound?: number; startAt?: number }): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  // Les graces de reconnexion valent pour une manche : la suivante repart a zero.
  ctx.graceUntil = {};
  const nextRound = opts?.forceRound ?? ctx.state.currentRound + 1;
  ctx.state.pacing = null;
  if (nextRound > ctx.state.totalRounds) {
    ctx.state.phase = "FINISHED";
    ctx.state.currentTrack = null;
    ctx.state.timing = { startAt: null, revealAt: null };
    return ctx.state;
  }

  const track = ctx.tracks.find(t => t.round === nextRound);
  if (!track) {
    ctx.state.phase = "FINISHED";
    ctx.state.currentTrack = null;
    ctx.state.timing = { startAt: null, revealAt: null };
    return ctx.state;
  }

  const startAt = opts?.startAt ?? Date.now();
  const revealAt = startAt + ctx.roundDurationMs;

  ctx.state.phase = "GUESSING";
  ctx.state.currentRound = nextRound;
  ctx.state.currentTrack = track;
  ctx.state.timing = { startAt, revealAt };

  // Les retardataires jouent a partir de cette manche (T19).
  promoteWaitingPlayers(ctx, nextRound - 1);

  // Picker "qui a ajoute ?" : on propose 3 candidats (le bon + 2 leurres) plutot
  // que tous les joueurs. Calcule une fois par round, identique pour tout le
  // monde. Seulement parmi les joueurs du lancement : un retardataire n'a mis
  // aucun morceau dans cette partie, il n'est jamais propose.
  const candidates = Object.keys(ctx.state.players).map(Number).filter(id => ctx.launchPlayerIds.has(id));
  track.ownerQuestion = ownerQuestionOpen(candidates.length, ctx.state.singleContributor === true);
  track.ownerChoices = track.ownerQuestion ? ownerChoices(track.metadata, candidates) : [];

  Object.values(ctx.state.players).forEach(player => {
    player.hasAnswered = false;
    player.isReady = false;
    // Keep disconnected state - only reconnection should clear it.
    // Resetting it here would make offline players block the reveal timer.
    player.lastGuess = undefined;
    player.lastGuessTitle = null;
    player.lastGuessArtist = null;
    player.lastSourceGuess = undefined;
    player.lastVerdict = undefined;
    player.lastTitleOk = undefined;
    player.lastArtistOk = undefined;
    player.lastOwnerOk = undefined;
    player.lastPoints = undefined;
    player.answerAt = null;
  });

  return ctx.state;
}

/**
 * Les pistes dont le lien va servir bientot (T35) : la manche en cours tant
 * qu'elle n'est pas revelee, puis les `lookahead` suivantes.
 */
export function upcomingTracks(roomCode: string, lookahead: number): RoundTrack[] {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase === "FINISHED") return [];
  const from = ctx.state.phase === "GUESSING" ? ctx.state.currentRound : ctx.state.currentRound + 1;
  const to = ctx.state.currentRound + lookahead;
  return ctx.tracks.filter(t => t.round >= from && t.round <= to);
}

/**
 * Pose un lien frais sur une piste de la partie en cours. Rien si la partie a
 * change entre-temps (revanche). Rend true si c'est la manche en cours : les
 * joueurs doivent recevoir l'etat a jour.
 */
export function replaceRoundPreview(roomCode: string, track: RoundTrack, previewUrl: string): boolean {
  const ctx = edit(roomCode);
  if (!ctx || !ctx.tracks.includes(track)) return false;
  track.previewUrl = previewUrl;
  return ctx.state.currentTrack === track;
}

export function recordAnswer(
  roomCode: string,
  userId: number,
  guess: string,
  sourceUserId?: number | null,
  guessTitle?: string,
  guessArtist?: string,
): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase !== "GUESSING") return ctx.state;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  // Prevent double submission — keep first answer
  if (player.hasAnswered) return ctx.state;
  player.hasAnswered = true;
  player.lastGuess = guess;
  player.lastGuessTitle = guessTitle ?? null;
  player.lastGuessArtist = guessArtist ?? null;
  player.lastSourceGuess = sourceUserId ?? null;
  player.answerAt = Date.now();
  // Il repond : il n'est plus absent (T22), ni ici ni a la partie suivante.
  if (player.absent || isRoomAbsent(roomCode, userId)) {
    player.absent = false;
    clearRoomAbsent(roomCode, userId);
  }
  ctx.missed = { ...ctx.missed, [userId]: 0 };
  return ctx.state;
}

/**
 * « Pret » d'un joueur pendant le reveal. Depuis T38 il ne fait plus avancer
 * la partie : le serveur enchaine les ecrans tout seul (roundPacing.ts). Garde
 * pour les onglets restes ouverts sur l'ancienne version.
 */
export function markReady(roomCode: string, userId: number): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase !== "REVEAL") return ctx.state;
  const player = ctx.state.players[userId];
  if (player) player.isReady = true;
  return ctx.state;
}

/**
 * Passe a l'ecran suivant du reveal (T38) : le classement apres la reponse,
 * puis "next" quand la manche suivante doit partir (l'appelant la lance).
 * Apres la derniere manche, "next" des la reponse : le podium suit.
 * null si rien a faire : pas de reveal en cours, ou partie en pause.
 */
export function nextRevealStep(roomCode: string, now = Date.now()): "scores" | "next" | null {
  const ctx = edit(roomCode);
  if (!ctx || ctx.state.phase !== "REVEAL" || ctx.state.paused) return null;
  const next = stepAfter(ctx.state.pacing, now, ctx.state.currentRound >= ctx.state.totalRounds);
  if (next === "next") return "next";
  ctx.state.pacing = next;
  return "scores";
}

function setWaiting(ctx: GameContext, waiting: readonly WaitingPlayer[]): void {
  ctx.waiting = waiting;
  ctx.state.waiting = publicWaiting(waiting);
}

function promoteWaitingPlayers(ctx: GameContext, missedRounds: number): void {
  if (ctx.waiting.length === 0) return;
  const { promoted, stillWaiting } = promoteWaiting(ctx.waiting, missedRounds, ctx.roundDurationMs);
  for (const player of promoted) ctx.state.players[player.userId] = player;
  setWaiting(ctx, stillWaiting);
  syncAbsentees(ctx);
}

export type Admission = "none" | "player" | "waiting" | "arrived" | "absent";

/**
 * Entree d'un membre de la salle dans la partie en memoire (room:join).
 * - deja joueur (reconnexion, rechargement) : il le reste, score garde ;
 * - pendant une manche ou un reveal : il attend la manche suivante
 *   ("arrived" a la premiere arrivee, "waiting" s'il recharge pendant l'attente) ;
 * - hors manche (lobby, fin de partie) : comme avant T19, il rejoint les joueurs.
 */
export function admitToGame(
  roomCode: string,
  payload: { userId: number; username: string | null; avatar?: string | null },
): Admission {
  const ctx = edit(roomCode);
  if (!ctx) return "none";
  const inRound = ctx.state.phase === "GUESSING" || ctx.state.phase === "REVEAL";
  // Absent de la partie d'avant (T22) : une reconnexion ne le remet pas en
  // jeu, seul son « Je reviens » le fait (markPresent).
  if (!ctx.state.players[payload.userId] && isRoomAbsent(roomCode, payload.userId)) {
    syncAbsentees(ctx);
    return "absent";
  }
  if (ctx.state.players[payload.userId] || !inRound) {
    upsertPlayer(roomCode, payload);
    // Resté en attente jusqu'a la fin puis revenu sur les resultats : il n'est
    // plus a la fois joueur et en attente.
    if (ctx.waiting.some(w => w.userId === payload.userId)) setWaiting(ctx, withoutWaiting(ctx.waiting, payload.userId));
    return "player";
  }
  const { waiting, added } = withWaiting(ctx.waiting, {
    userId: payload.userId,
    username: payload.username,
    avatar: payload.avatar ?? null,
  });
  setWaiting(ctx, waiting);
  return added ? "arrived" : "waiting";
}

/** Le retardataire repart (Quitter) : il ne sera pas promu. */
export function dropWaiting(roomCode: string, userId: number): void {
  const ctx = edit(roomCode);
  if (!ctx || !ctx.waiting.some(w => w.userId === userId)) return;
  setWaiting(ctx, withoutWaiting(ctx.waiting, userId));
}

export function isWaitingPlayer(roomCode: string, userId: number): boolean {
  return games.get(roomCode)?.waiting.some(w => w.userId === userId) ?? false;
}

export function upsertPlayer(
  roomCode: string,
  payload: { userId: number; username: string | null; avatar?: string | null }
): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  if (!ctx.state.players[payload.userId]) {
    ctx.state.players[payload.userId] = {
      userId: payload.userId,
      username: payload.username,
      avatar: (payload as any).avatar ?? null,
      score: 0,
      accuracy: 0,
      rounds: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      hasAnswered: false,
      isReady: false,
    };
  } else {
    ctx.state.players[payload.userId].username = payload.username;
    if (Object.prototype.hasOwnProperty.call(payload, "avatar")) {
      ctx.state.players[payload.userId].avatar = (payload as any).avatar ?? null;
    }
  }
  return ctx.state;
}

export function removePlayer(roomCode: string, userId: number): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  delete ctx.state.players[userId];
  const remaining = Object.keys(ctx.state.players).length;
  if (remaining === 0) {
    clearGame(roomCode);
  }
  return ctx.state;
}

export function revealRound(roomCode: string): GameState | undefined {
  const ctx = edit(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase !== "GUESSING") return ctx.state;
  const track = ctx.state.currentTrack;
  if (!track) return ctx.state;

  const startAt = ctx.state.timing.startAt;
  trackAbsences(ctx);
  const playing = new Set(playingPlayers(ctx).map(p => p.userId));

  Object.values(ctx.state.players).forEach(player => {
    const detail = evaluateGuessDetail(
      player.lastGuess ?? "",
      track,
      player.lastGuessTitle,
      player.lastGuessArtist,
    );
    const { next, gained } = computeScore({
      previous: player,
      detail,
      answerAt: player.answerAt,
      startAt: startAt,
      maxDuration: ctx.state.timing.revealAt && startAt ? ctx.state.timing.revealAt - startAt : ctx.roundDurationMs,
      // Question pas posee (moins de 3 joueurs) : un vieux client qui l'envoie quand meme ne marque rien.
      ownerGuessed: track.ownerQuestion !== false && isOwnerGuess(track.metadata, player.lastSourceGuess),
      presenter: !playing.has(player.userId),
    });
    ctx.state.players[player.userId] = {
      ...next,
      hasAnswered: true,
      lastGained: gained,
    };
  });

  ctx.state.phase = "REVEAL";
  ctx.state.pacing = answerStep(Date.now());
  ctx.state.timing = {
    startAt,
    revealAt: ctx.state.timing.revealAt,
  };
  // Personne n'a repondu depuis plusieurs manches : la partie se met en veille
  // sur cette revelation (T22). Pas a la derniere : le podium arrive de toute facon.
  if (ctx.silentRounds >= SILENT_ROUNDS_BEFORE_PAUSE && ctx.state.currentRound < ctx.state.totalRounds) {
    idlePause(ctx, "silent", Date.now());
  }
  return ctx.state;
}

/**
 * A chaque revelation (T22) : qui a repondu cette manche ? Un joueur qui n'a
 * rien envoye ABSENT_AFTER_MISSED_ROUNDS fois de suite passe absent, connecte
 * ou non (une longue coupure aussi). Le presentateur n'est pas un joueur.
 */
function trackAbsences(ctx: GameContext): void {
  let someoneAnswered = false;
  // Manche coupee par un redemarrage : ne pas repondre n'y vaut pas absence.
  const interrupted = ctx.restoredRound != null && ctx.restoredRound === ctx.state.currentRound;
  const missed = { ...ctx.missed };
  for (const player of playingPlayers(ctx)) {
    if (player.answerAt != null) {
      someoneAnswered = true;
      missed[player.userId] = 0;
      player.answeredRounds = (player.answeredRounds ?? 0) + 1;
      continue;
    }
    if (interrupted) continue;
    missed[player.userId] = (missed[player.userId] ?? 0) + 1;
    if (!player.absent && missed[player.userId] >= ABSENT_AFTER_MISSED_ROUNDS) {
      player.absent = true;
      setRoomAbsent(ctx.state.roomCode, player);
    }
  }
  ctx.missed = missed;
  if (someoneAnswered) ctx.silentRounds = 0;
  else if (!interrupted) ctx.silentRounds += 1;
}

/**
 * Piste caviardee pour la phase GUESSING. Le fil (socket comme REST) ne doit
 * JAMAIS porter la reponse avant le reveal : un joueur qui ouvre l'onglet
 * Reseau aurait le corrige. On ne garde que ce qu'il faut pour jouer la
 * manche : l'extrait audio et les candidats du "qui a ajoute ?" (le bon y est
 * noye parmi les leurres, c'est le principe du jeu). La pochette est retiree
 * aussi : meme floutee cote client, elle serait deblurable en CSS.
 */
export function redactedGuessingTrack(track: RoundTrack): RoundTrack {
  return {
    round: track.round,
    trackId: "hidden",
    title: "",
    artist: "",
    previewUrl: track.previewUrl,
    albumCover: null,
    metadata: null,
    ownerChoices: track.ownerChoices,
    ownerQuestion: track.ownerQuestion,
  };
}

/**
 * Vue PUBLIQUE de l'etat : c'est elle qui part sur le reseau. Pendant le
 * GUESSING, la piste courante est caviardee (voir redactedGuessingTrack).
 * L'etat interne complet reste accessible via getGameState pour la logique
 * serveur (scoring, persistance).
 */
export function gameStateSnapshot(roomCode: string): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  const state = ctx.state;
  if (state.phase === "GUESSING") {
    // Deux fuites a caviarder pendant la manche :
    // 1. la piste courante (titre/artiste/pochette) -> redactedGuessingTrack.
    // 2. le TEXTE tape par chaque joueur : broadcastState part apres chaque
    //    game:answer, donc sans ca tout le monde lisait en direct la reponse
    //    de celui qui a repondu en premier (typiquement le proprietaire du
    //    morceau, qui reconnait sa propre musique). On garde hasAnswered
    //    (utile a l'UI "X/Y ont repondu") mais on masque le contenu et le
    //    verdict jusqu'au reveal.
    const players: GameState["players"] = {};
    for (const [id, p] of Object.entries(state.players)) {
      players[Number(id)] = {
        ...p,
        lastGuess: undefined,
        lastGuessTitle: null,
        lastGuessArtist: null,
        lastSourceGuess: null,
        lastVerdict: undefined,
        lastGained: undefined,
        lastPoints: undefined,
        lastTitleOk: undefined,
        lastArtistOk: undefined,
        lastOwnerOk: undefined,
      };
    }
    return {
      ...state,
      currentTrack: state.currentTrack ? redactedGuessingTrack(state.currentTrack) : null,
      players,
    };
  }
  return state;
}

/**
 * Numero de la derniere manche dont la reponse a le droit de sortir du serveur.
 * Source unique de verite du caviardage cote REST (state, roundsSummary...).
 * - partie finie (room 'finished' ou phase FINISHED) : tout est revelable.
 * - pas d'etat memoire : rien (0).
 * - GUESSING : jusqu'a la manche PRECEDENTE (la courante est en jeu).
 * - REVEAL : jusqu'a la manche courante incluse.
 */
export function revealedRoundCeiling(roomCode: string, roomStatus?: string | null): number {
  const state = games.get(roomCode)?.state;
  if (roomStatus === "finished" || state?.phase === "FINISHED") return Number.MAX_SAFE_INTEGER;
  if (!state) return 0;
  return state.phase === "GUESSING" ? state.currentRound - 1 : state.currentRound;
}

/**
 * Libere la partie en memoire seulement si elle est bien terminee. Sert au
 * nettoyage differe apres le game over : on garde l'etat FINISHED une minute
 * pour que les clients recuperent l'ecran de resultats via /state, sans
 * risquer d'effacer une revanche deja relancee entre-temps.
 */
export function clearGameIfFinished(roomCode: string, only?: GameState): void {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase !== "FINISHED") return;
  // `only` : la partie visee par ce nettoyage. Une revanche (autre etat) reste.
  if (only && ctx.state !== only) return;
  games.delete(roomCode);
  backup.markDirty(roomCode);
}

function computeScore(params: {
  previous: PlayerState;
  detail: GuessDetail;
  answerAt: number | null | undefined;
  startAt: number | null;
  maxDuration?: number | null;
  // « Qui a mis quoi » juste : l'un des joueurs a qui revient le morceau (roundOwners.ts).
  ownerGuessed?: boolean;
  /** L'hote qui presente seulement : il ne marque rien (roundScoring.ts). */
  presenter?: boolean;
}): { next: PlayerState; gained: number; verdict: Verdict } {
  const { previous, detail, answerAt, startAt, maxDuration, ownerGuessed, presenter } = params;
  const verdict = detail.verdict;
  // Temps mesure par le serveur : startAt et answerAt sont deux heures serveur.
  const reactionMs = startAt && answerAt ? Math.max(0, answerAt - startAt) : null;
  const duration = maxDuration ?? DEFAULT_LISTENING_MS;
  const correctTitle = detail.matchedTitle;
  const correctArtist = detail.matchedArtist;
  const correctBoth = correctTitle && correctArtist;

  // Bareme Kahoot (T43) : rapidite, serie, « qui a ajoute ». Le cumul des
  // temps (totalReactionMs) reste le departage d'egalite.
  const { points, gained, streak } = roundPoints({
    titleOk: correctTitle,
    artistOk: correctArtist,
    ownerOk: ownerGuessed === true,
    reactionMs,
    durationMs: duration,
    previousStreak: previous.streak,
    presenter,
  });

  const rounds = previous.rounds + 1;
  const correctCount = previous.correct + (correctBoth ? 1 : 0);
  const next: PlayerState = {
    ...previous,
    rounds,
    correct: correctCount,
    streak,
    bestStreak: Math.max(previous.bestStreak, streak),
    score: previous.score + gained,
    accuracy: rounds > 0 ? Math.round((correctCount / rounds) * 100) : 0,
    lastVerdict: verdict,
    lastTitleOk: correctTitle,
    lastArtistOk: correctArtist,
    lastOwnerOk: ownerGuessed === true,
    lastPoints: points,
    // Pas de réponse = temps plein du round (ne pas avantager l'inactif au départage)
    totalReactionMs: (previous.totalReactionMs ?? 0) + (reactionMs ?? duration),
  };
  return { next, gained, verdict };
}
