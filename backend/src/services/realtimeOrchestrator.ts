import type { Server as IOServer } from "socket.io";
import { logger } from "../utils/logger";
import {
  clearGame,
  gameStateSnapshot,
  getSessionId,
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

export function clearAdvanceTimer(roomCode: string): void {
  const t = advanceTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    advanceTimers.delete(roomCode);
  }
}

export function scheduleForcedAdvance(io: IOServer, roomCode: string, revealedRound: number): void {
  clearAdvanceTimer(roomCode);
  if (finishedRooms.has(roomCode)) return;
  const timer = setTimeout(() => {
    advanceTimers.delete(roomCode);
    if (finishedRooms.has(roomCode)) return;
    const current = gameStateSnapshot(roomCode);
    // N'avance que si on est TOUJOURS sur le reveal de la meme manche
    // (sinon le chemin "tous prets" est deja passe par la).
    if (!current || current.phase !== "REVEAL" || current.currentRound !== revealedRound) return;
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
    track: state.currentTrack,
    timing: state.timing,
  });
}

async function emitRoundReveal(io: IOServer, state: GameState) {
  const room = io.sockets.adapter.rooms.get(state.roomCode);
  const socketCount = room ? room.size : 0;
  const socketIds = room ? Array.from(room) : [];
  logger.debug(`emitting game:round:reveal to room ${state.roomCode}, sockets in room: ${socketCount}, ids: ${socketIds.join(", ")}`);
  io.to(state.roomCode).emit("game:round:reveal", {
    roomCode: state.roomCode,
    round: state.currentRound,
    timing: state.timing,
    players: state.players,
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

export function scheduleReveal(io: IOServer, roomCode: string, revealAt: number) {
  const existing = revealTimers.get(roomCode);
  if (existing) clearTimeout(existing);
  // Don't schedule if game is already finished or cleaned up
  if (finishedRooms.has(roomCode)) return;
  const delay = Math.max(0, revealAt - Date.now());
  logger.debug(`scheduling reveal for ${roomCode} in ${delay}ms`);
  const timer = setTimeout(() => {
    revealTimers.delete(roomCode);
    if (finishedRooms.has(roomCode)) return;
    logger.debug(`reveal timer fired for ${roomCode}`);
    const updated = revealRound(roomCode);
    logger.debug(`revealRound result: phase=${updated?.phase}, players=${updated ? Object.keys(updated.players).length : 0}`);
    if (updated) {
      emitRoundReveal(io, updated);
      emitState(io, roomCode);
      // Persist this round's answers (fire-and-forget; never blocks the game).
      void persistRoundResponses(updated, getSessionId(roomCode));
      if (updated.phase === "FINISHED") {
        broadcastGameOver(io, roomCode);
      } else if (updated.phase === "REVEAL") {
        scheduleForcedAdvance(io, roomCode, updated.currentRound);
      }
    }
  }, delay);
  revealTimers.set(roomCode, timer);
}

export function startRoundAndBroadcast(
  io: IOServer,
  roomCode: string,
  opts?: { forceRound?: number; startAt?: number }
): GameState | undefined {
  // Une nouvelle manche demarre : le filet anti-AFK de la precedente est obsolete.
  clearAdvanceTimer(roomCode);
  // Pre-roll entre les manches : le bras de lecture se pose sur le vinyle AVANT
  // que la musique parte (les clients sequencent l'animation sur startAt).
  const state = startNextRound(roomCode, { ...opts, startAt: opts?.startAt ?? Date.now() + 1_600 });
  logger.debug(`startRoundAndBroadcast ${roomCode}: round=${state?.currentRound}, phase=${state?.phase}, revealAt=${state?.timing?.revealAt}`);
  if (!state) return undefined;
  if (state.phase === "FINISHED") {
    emitGameOver(io, state);
    return state;
  }
  // Emit complete state FIRST so clients have everything before processing
  // the round-start trigger event. This eliminates the need for the frontend
  // to reconstruct a minimal state from the round-start payload alone.
  emitState(io, roomCode);
  emitRoundStart(io, state);
  if (state.timing.revealAt) {
    scheduleReveal(io, roomCode, state.timing.revealAt);
  }
  return state;
}

export function broadcastState(io: IOServer, roomCode: string): GameState | undefined {
  return emitState(io, roomCode);
}

const finishedRooms = new Set<string>();

export function broadcastGameOver(io: IOServer, roomCode: string) {
  // Guard against double emission
  if (finishedRooms.has(roomCode)) return;
  const snapshot = gameStateSnapshot(roomCode);
  if (!snapshot) return;
  finishedRooms.add(roomCode);
  emitGameOver(io, snapshot);
  // Persist final scores/stats before the in-memory state is dropped.
  void persistGameResults(snapshot, getSessionId(roomCode));
  revealTimers.delete(roomCode);
  clearAdvanceTimer(roomCode);
  clearGame(roomCode);
  // Clean up the guard after a short delay to avoid memory leak.
  // unref so this housekeeping timer never keeps the process alive.
  setTimeout(() => finishedRooms.delete(roomCode), 10_000).unref?.();
}

export function clearRevealTimer(roomCode: string) {
  const existing = revealTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    revealTimers.delete(roomCode);
  }
}
