import type { Server as IOServer } from "socket.io";
import { logger } from "../utils/logger";
import {
  clearGameIfFinished,
  earlyRevealDecision,
  gameStateSnapshot,
  getGameState,
  getSessionId,
  liveRoomCodes,
  redactedGuessingTrack,
  revealRound,
  startNextRound,
  type GameState,
} from "./realtimeGame";
import { persistGameResults, persistRoundResponses } from "./gamePersistence";

const revealTimers = new Map<string, NodeJS.Timeout>();
// Filet anti-blocage : la manche suivante part meme si un joueur AFK n'envoie
// jamais son "ready" (tel verrouille, onglet en fond...). Sans ca, toute la
// table reste coincee sur l'ecran de reveal.
const advanceTimers = new Map<string, NodeJS.Timeout>();
const READY_GRACE_MS = 10_000;
// Grace de reconnexion (DISCONNECT_GRACE_MS, realtimeGame) : un minuteur par
// salle, cale sur la fin de la derniere grace en cours de la manche.
const graceTimers = new Map<string, NodeJS.Timeout>();

export function clearAdvanceTimer(roomCode: string): void {
  const t = advanceTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    advanceTimers.delete(roomCode);
  }
}

export function scheduleForcedAdvance(io: IOServer, roomCode: string, revealedRound: number): void {
  clearAdvanceTimer(roomCode);
  if (isGameOver(roomCode)) return;
  const timer = setTimeout(() => {
    advanceTimers.delete(roomCode);
    if (isGameOver(roomCode)) return;
    const current = gameStateSnapshot(roomCode);
    // N'avance que si on est TOUJOURS sur le reveal de la meme manche
    // (sinon le chemin "tous prets" est deja passe par la).
    if (!current || current.phase !== "REVEAL" || current.currentRound !== revealedRound) return;
    // Jamais pendant une pause de l'hote (la reprise repose ce minuteur).
    if (current.paused) return;
    logger.debug(`forced advance for ${roomCode} after ready grace (round ${revealedRound})`);
    startRoundAndBroadcast(io, roomCode);
  }, READY_GRACE_MS);
  advanceTimers.set(roomCode, timer);
}

function emitState(io: IOServer, roomCode: string): GameState | undefined {
  const snapshot = gameStateSnapshot(roomCode);
  if (snapshot) {
    io.to(roomCode).emit("game:state", snapshot);
  }
  return snapshot;
}

function emitRoundStart(io: IOServer, state: GameState) {
  if (!state.currentTrack) return;
  const room = io.sockets.adapter.rooms.get(state.roomCode);
  const socketCount = room ? room.size : 0;
  const socketIds = room ? Array.from(room) : [];
  logger.debug(`emitting game:round:start to room ${state.roomCode}, sockets in room: ${socketCount}, ids: ${socketIds.join(", ")}`);
  io.to(state.roomCode).emit("game:round:start", {
    roomCode: state.roomCode,
    round: state.currentRound,
    // Caviarde : la reponse ne part sur le fil qu'au reveal.
    track: state.phase === "GUESSING" ? redactedGuessingTrack(state.currentTrack) : state.currentTrack,
    timing: state.timing,
  });
}

function emitGameOver(io: IOServer, state: GameState) {
  io.to(state.roomCode).emit("game:over", {
    roomCode: state.roomCode,
    players: state.players,
  });
  // Keep a second event name for compatibility with the prompt wording
  io.to(state.roomCode).emit("game:game:over", {
    roomCode: state.roomCode,
    players: state.players,
  });
}

export function scheduleReveal(io: IOServer, roomCode: string, revealAt: number, round: number) {
  const existing = revealTimers.get(roomCode);
  if (existing) clearTimeout(existing);
  // Don't schedule if game is already finished or cleaned up
  if (isGameOver(roomCode)) return;
  const delay = Math.max(0, revealAt - Date.now());
  logger.debug(`scheduling reveal for ${roomCode} (round ${round}) in ${delay}ms`);
  const timer = setTimeout(() => {
    revealTimers.delete(roomCode);
    if (isGameOver(roomCode)) return;
    const current = getGameState(roomCode);
    // Manche deja revelee, ou une autre manche que la sienne : jamais deux
    // revelations. Jamais pendant une pause de l'hote non plus (la reprise
    // repose ce minuteur).
    if (!current || current.phase !== "GUESSING" || current.currentRound !== round || current.paused) return;
    logger.debug(`reveal timer fired for ${roomCode} (round ${round})`);
    // Meme suite que les revelations anticipees (grace annulee, reponses
    // ecrites, filet anti-AFK, fin de partie), puis l'etat pour tous.
    if (revealRoundNow(io, roomCode)) emitState(io, roomCode);
  }, delay);
  revealTimers.set(roomCode, timer);
}

export function startRoundAndBroadcast(
  io: IOServer,
  roomCode: string,
  opts?: { forceRound?: number; startAt?: number }
): GameState | undefined {
  // Une nouvelle manche demarre : le filet anti-AFK et la grace de la precedente
  // sont obsoletes.
  clearAdvanceTimer(roomCode);
  clearGraceTimer(roomCode);
  // Pre-roll entre les manches : le bras de lecture se pose sur le vinyle AVANT
  // que la musique parte (les clients sequencent l'animation sur startAt).
  const state = startNextRound(roomCode, { ...opts, startAt: opts?.startAt ?? Date.now() + 1_600 });
  logger.debug(`startRoundAndBroadcast ${roomCode}: round=${state?.currentRound}, phase=${state?.phase}, revealAt=${state?.timing?.revealAt}`);
  if (!state) return undefined;
  if (state.phase === "FINISHED") {
    // Fin de partie par le filet anti-AFK (personne n'a clique "pret" apres la
    // derniere manche) : meme chemin que game:ready, sinon les resultats
    // n'etaient jamais ecrits en base (trouve le 05/10/2026).
    emitState(io, roomCode);
    broadcastGameOver(io, roomCode);
    return state;
  }
  // Emit complete state FIRST so clients have everything before processing
  // the round-start trigger event. This eliminates the need for the frontend
  // to reconstruct a minimal state from the round-start payload alone.
  emitState(io, roomCode);
  emitRoundStart(io, state);
  if (state.timing.revealAt) {
    scheduleReveal(io, roomCode, state.timing.revealAt, state.currentRound);
  }
  return state;
}

export function broadcastState(io: IOServer, roomCode: string): GameState | undefined {
  return emitState(io, roomCode);
}

// Parties deja passees par le game over. Le garde vise la PARTIE (son etat en
// memoire), pas la salle : avant le 07/11, c'etait un Set de codes de salle
// vide 10 s apres la fin, et une revanche lancee dans ces 10 s n'avait ni
// minuteur de reveal ni filet anti-AFK. Sa manche 1 ne se revelait jamais
// (salle 9SXZ6U, partie 777, le 06/11). Une revanche a un etat neuf, donc
// elle n'est pas concernee ; WeakSet : rien a nettoyer.
const finishedGames = new WeakSet<GameState>();

/** La partie EN COURS dans cette salle est-elle deja finie (game over passe) ? */
function isGameOver(roomCode: string): boolean {
  const state = getGameState(roomCode);
  return state !== undefined && finishedGames.has(state);
}

export function broadcastGameOver(io: IOServer, roomCode: string) {
  // Guard against double emission
  if (isGameOver(roomCode)) return;
  const live = getGameState(roomCode);
  const snapshot = gameStateSnapshot(roomCode);
  if (!live || !snapshot) return;
  finishedGames.add(live);
  emitGameOver(io, snapshot);
  // Persist final scores/stats before the in-memory state is dropped.
  void persistGameResults(snapshot, getSessionId(roomCode));
  clearRevealTimer(roomCode);
  clearAdvanceTimer(roomCode);
  clearGraceTimer(roomCode);
  // L'etat FINISHED reste en memoire une minute : les clients recuperent
  // l'ecran de resultats via /state (playlist complete) pendant cette fenetre.
  // clearGameIfFinished ne touche que CETTE partie : ni une revanche en cours,
  // ni l'ecran de resultats d'une revanche deja finie.
  setTimeout(() => clearGameIfFinished(roomCode, live), 60_000).unref?.();
}

export function clearRevealTimer(roomCode: string) {
  const existing = revealTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    revealTimers.delete(roomCode);
  }
}

export function clearGraceTimer(roomCode: string): void {
  const existing = graceTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    graceTimers.delete(roomCode);
  }
}

function scheduleGraceCheck(io: IOServer, roomCode: string, round: number, until: number): void {
  clearGraceTimer(roomCode);
  if (isGameOver(roomCode)) return;
  const timer = setTimeout(() => {
    graceTimers.delete(roomCode);
    // Grace d'une manche deja passee (revelee par son minuteur) : rien a faire.
    if (getGameState(roomCode)?.currentRound !== round) return;
    logger.debug(`reconnect grace over for ${roomCode} (round ${round})`);
    if (tryEarlyReveal(io, roomCode)) emitState(io, roomCode);
  }, Math.max(0, until - Date.now()));
  // Ce minuteur ne garde jamais le processus en vie a lui seul.
  timer.unref?.();
  graceTimers.set(roomCode, timer);
}

/**
 * Point d'entree unique des revelations anticipees, rappele a chaque evenement
 * qui peut changer la donne : une reponse, une coupure, un depart, la reprise
 * apres une pause, la fin d'une grace. Revele tout de suite si tous les
 * joueurs connectes ont repondu et que personne n'est a attendre ; attend la
 * fin d'une grace de reconnexion en cours (minuteur) ; sinon ne fait rien.
 * Rend true si la manche vient d'etre revelee ; l'appelant diffuse l'etat.
 */
export function tryEarlyReveal(io: IOServer, roomCode: string): boolean {
  const decision = earlyRevealDecision(roomCode);
  logger.debug(`early reveal check for ${roomCode}: ${decision.kind}`);
  if (decision.kind === "wait") {
    scheduleGraceCheck(io, roomCode, getGameState(roomCode)?.currentRound ?? 0, decision.until);
    return false;
  }
  // Plus personne a attendre (revenu, pause, manche qui continue) : le minuteur
  // de grace n'a plus d'objet. Le prochain evenement rappellera cette fonction.
  clearGraceTimer(roomCode);
  return decision.kind === "reveal" ? revealRoundNow(io, roomCode) : false;
}

/**
 * Revele la manche maintenant : minuteur de manche, revelation anticipee, ou
 * resynchro d'un client apres l'heure (game:sync). Annule les minuteurs de la
 * manche puis fait la suite commune. Une seule fois : rien si la manche n'est
 * plus en jeu. Rend true si la manche vient d'etre revelee.
 */
export function revealRoundNow(io: IOServer, roomCode: string): boolean {
  if (getGameState(roomCode)?.phase !== "GUESSING") return false;
  clearRevealTimer(roomCode);
  clearGraceTimer(roomCode);
  const revealed = revealRound(roomCode);
  if (!revealed) return false;
  finishReveal(io, roomCode, revealed);
  return true;
}

/**
 * Suite commune de toutes les revelations. Avant elle, le chemin de la
 * deconnexion n'ecrivait pas les reponses de la manche et ne posait pas le
 * filet anti-AFK (trouve le 02/10/2026) ; celui de game:sync non plus, et le
 * minuteur de manche avait sa propre copie (alignes le 05/10/2026).
 */
function finishReveal(io: IOServer, roomCode: string, revealed: GameState): void {
  io.to(roomCode).emit("game:round:reveal", {
    roomCode,
    round: revealed.currentRound,
    timing: revealed.timing,
    players: revealed.players,
    // La reponse complete n'arrive qu'avec le reveal (piste caviardee pendant
    // la manche).
    track: revealed.currentTrack,
  });
  void persistRoundResponses(revealed, getSessionId(roomCode));
  if (revealed.phase === "FINISHED") {
    broadcastGameOver(io, roomCode);
  } else if (revealed.phase === "REVEAL" && !revealed.paused) {
    // Filet anti-AFK : la manche suivante part seule si personne ne clique "pret".
    // Pas pendant une pause : game:resume le pose a la reprise.
    scheduleForcedAdvance(io, roomCode, revealed.currentRound);
  }
}

// Filet anti-blocage (T27). Une manche avance par deux minuteurs : le reveal
// (fin du chrono) puis le filet anti-AFK (manche suivante). Si l'un manque,
// la partie reste « en cours » sans bouger, comme la 777 du 06/11. Toutes les
// STALL_CHECK_MS, on repose ce qui manque, sans jamais doubler un minuteur
// present ni toucher une partie en pause ou finie.
const STALL_CHECK_MS = 5_000;
// Marge apres l'heure du reveal : le minuteur normal passe toujours avant.
const STALL_MARGIN_MS = 5_000;

/** Un passage du filet ; rend les salles debloquees (pour les tests). */
export function unstickGames(io: IOServer, now = Date.now()): string[] {
  const nudged: string[] = [];
  for (const roomCode of liveRoomCodes()) {
    const state = getGameState(roomCode);
    if (!state || state.paused || isGameOver(roomCode)) continue;
    if (state.phase === "GUESSING" && !revealTimers.has(roomCode)) {
      const revealAt = state.timing.revealAt;
      if (!revealAt || now < revealAt + STALL_MARGIN_MS) continue;
      logger.warn("partie_debloquee", { roomCode, round: state.currentRound, phase: "GUESSING" });
      if (revealRoundNow(io, roomCode)) emitState(io, roomCode);
      nudged.push(roomCode);
    } else if (state.phase === "REVEAL" && !advanceTimers.has(roomCode)) {
      logger.warn("partie_debloquee", { roomCode, round: state.currentRound, phase: "REVEAL" });
      scheduleForcedAdvance(io, roomCode, state.currentRound);
      nudged.push(roomCode);
    }
  }
  return nudged;
}

let stallWatchdog: NodeJS.Timeout | null = null;

export function startStallWatchdog(io: IOServer): void {
  if (stallWatchdog) return;
  stallWatchdog = setInterval(() => {
    try {
      unstickGames(io);
    } catch (err) {
      logger.error("stall_watchdog_failed", { error: err });
    }
  }, STALL_CHECK_MS);
  stallWatchdog.unref?.();
}
