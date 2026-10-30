import { isOwnerGuess, ownerChoices } from "./roundOwners";
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
  answerAt?: number | null;
  lastGained?: number;
  /** Cumul des temps de réponse (ms) — sert UNIQUEMENT au départage d'égalité. */
  totalReactionMs?: number;
};

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
  config: { autoAdvance: boolean; roundDurationMs: number };
};

type GameContext = {
  state: GameState;
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
};

const DEFAULT_LISTENING_MS = 20_000;

/**
 * Grace de reconnexion, decidee par Tym le 02/10/2026 : un joueur coupe du
 * reseau en pleine manche (pas le bouton "Quitter") sans avoir repondu a 5 s
 * pour revenir avant que la manche soit revelee en avance. Avant, une coupure
 * d'une seconde (tunnel, wifi vers 4G, ecran verrouille) lui faisait perdre la
 * manche des que tous les autres avaient repondu. La fin normale de la manche
 * (son minuteur) ne l'attend jamais.
 */
export const DISCONNECT_GRACE_MS = 5_000;

function graceMsOrDefault(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : DISCONNECT_GRACE_MS;
}

const games = new Map<string, GameContext & { pausedAt?: number | null }>();

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
    pausedAt: null,
    reconnectGraceMs: graceMsOrDefault(params.reconnectGraceMs),
    graceUntil: {},
    waiting: [],
    launchPlayerIds: new Set(Object.keys(initialPlayers).map(Number)),
  });
  return state;
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
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.paused) return ctx.state;
  if (ctx.state.phase !== "GUESSING" && ctx.state.phase !== "REVEAL") return ctx.state;
  ctx.pausedAt = now;
  ctx.state.paused = true;
  return ctx.state;
}

export function resumeGame(roomCode: string, now = Date.now()): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (!ctx.state.paused) return ctx.state;
  // Decaler les horloges du temps passe en pause : le chrono reprend ou il en
  // etait, et l'audio se resynchronise tout seul (seek base sur startAt).
  const delta = now - (ctx.pausedAt ?? now);
  if (ctx.state.timing.startAt) ctx.state.timing.startAt += delta;
  if (ctx.state.timing.revealAt) ctx.state.timing.revealAt += delta;
  ctx.graceUntil = gracesAfterPause(ctx.graceUntil, delta, now + ctx.reconnectGraceMs);
  ctx.pausedAt = null;
  ctx.state.paused = false;
  return ctx.state;
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
  const ctx = games.get(roomCode);
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
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase === "GUESSING" || ctx.state.phase === "REVEAL") return ctx.state;
  ctx.state.hostUserId = userId;
  ctx.state.hostConnected = true;
  return ctx.state;
}

export function markDisconnected(roomCode: string, userId: number): GameState | undefined {
  const ctx = games.get(roomCode);
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
  const ctx = games.get(roomCode);
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
  const ctx = games.get(roomCode);
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
  const ctx = games.get(roomCode);
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
  const players = playingPlayers(ctx);
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
}

export function startNextRound(roomCode: string, opts?: { forceRound?: number; startAt?: number }): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  // Les graces de reconnexion valent pour une manche : la suivante repart a zero.
  ctx.graceUntil = {};
  const nextRound = opts?.forceRound ?? ctx.state.currentRound + 1;
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
  track.ownerChoices = ownerChoices(track.metadata, candidates);

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
    player.answerAt = null;
  });

  return ctx.state;
}

export function recordAnswer(
  roomCode: string,
  userId: number,
  guess: string,
  sourceUserId?: number | null,
  guessTitle?: string,
  guessArtist?: string,
): GameState | undefined {
  const ctx = games.get(roomCode);
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
  return ctx.state;
}

export function markReady(roomCode: string, userId: number): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  // Only accept ready signals during REVEAL phase to prevent "ghost ready" bugs
  // where a premature ready from GUESSING phase causes instant advancement on reveal.
  if (ctx.state.phase !== "REVEAL") return ctx.state;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  player.isReady = true;

  const answerablePlayers = allAnswerablePlayers(roomCode);
  const everyoneReady =
    ctx.state.phase === "REVEAL" &&
    answerablePlayers.length > 0 &&
    answerablePlayers.every(p => p.isReady);

  if (everyoneReady) {
    const advanced = startNextRound(roomCode);
    return advanced;
  }
  return ctx.state;
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
}

export type Admission = "none" | "player" | "waiting" | "arrived";

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
  const ctx = games.get(roomCode);
  if (!ctx) return "none";
  const inRound = ctx.state.phase === "GUESSING" || ctx.state.phase === "REVEAL";
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
  const ctx = games.get(roomCode);
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
  const ctx = games.get(roomCode);
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
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  delete ctx.state.players[userId];
  const remaining = Object.keys(ctx.state.players).length;
  if (remaining === 0) {
    clearGame(roomCode);
  }
  return ctx.state;
}

export function revealRound(roomCode: string): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase !== "GUESSING") return ctx.state;
  const track = ctx.state.currentTrack;
  if (!track) return ctx.state;

  const startAt = ctx.state.timing.startAt;

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
      ownerGuessed: isOwnerGuess(track.metadata, player.lastSourceGuess),
    });
    ctx.state.players[player.userId] = {
      ...next,
      hasAnswered: true,
      lastGained: gained,
    };
  });

  ctx.state.phase = "REVEAL";
  ctx.state.timing = {
    startAt,
    revealAt: ctx.state.timing.revealAt,
  };
  return ctx.state;
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
export function clearGameIfFinished(roomCode: string): void {
  const ctx = games.get(roomCode);
  if (ctx && ctx.state.phase === "FINISHED") games.delete(roomCode);
}

function computeScore(params: {
  previous: PlayerState;
  detail: GuessDetail;
  answerAt: number | null | undefined;
  startAt: number | null;
  maxDuration?: number | null;
  // « Qui a mis quoi » juste : l'un des joueurs a qui revient le morceau (roundOwners.ts).
  ownerGuessed?: boolean;
}): { next: PlayerState; gained: number; verdict: Verdict } {
  const { previous, detail, answerAt, startAt, maxDuration, ownerGuessed } = params;
  const verdict = detail.verdict;
  const reactionMs = startAt && answerAt ? Math.max(0, answerAt - startAt) : null;
  const correctTitle = detail.matchedTitle;
  const correctArtist = detail.matchedArtist;
  const correctBoth = correctTitle && correctArtist;

  // Scoring lisible : 1 point par bonne réponse (titre, artiste, "qui a ajouté").
  // Pas de bonus vitesse ni de multiplicateur streak — le score se lit direct.
  // La vitesse (totalReactionMs cumulé) sert uniquement de départage d'égalité.
  const titlePoints = correctTitle ? 1 : 0;
  const artistPoints = correctArtist ? 1 : 0;
  const sourceBonus = ownerGuessed ? 1 : 0;

  const gainedPoints = titlePoints + artistPoints + sourceBonus;

  const rounds = previous.rounds + 1;
  const correctCount = previous.correct + (correctBoth ? 1 : 0);
  const streak = correctBoth ? previous.streak + 1 : 0;
  const next: PlayerState = {
    ...previous,
    rounds,
    correct: correctCount,
    streak,
    bestStreak: Math.max(previous.bestStreak, streak),
    score: previous.score + gainedPoints,
    accuracy: rounds > 0 ? Math.round((correctCount / rounds) * 100) : 0,
    lastVerdict: verdict,
    // Pas de réponse = temps plein du round (ne pas avantager l'inactif au départage)
    totalReactionMs: (previous.totalReactionMs ?? 0) + (reactionMs ?? maxDuration ?? DEFAULT_LISTENING_MS),
  };
  return { next, gained: gainedPoints, verdict };
}
