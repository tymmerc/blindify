import type { Server as IOServer } from "socket.io";
import {
  clearGame,
  gameStateSnapshot,
  revealRound,
  startNextRound,
  type GameState,
} from "./realtimeGame";

const revealTimers = new Map<string, NodeJS.Timeout>();

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
  console.log(`[start] emitting game:round:start to room ${state.roomCode}, sockets in room: ${socketCount}, ids: ${socketIds.join(", ")}`);
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
  console.log(`[reveal] emitting game:round:reveal to room ${state.roomCode}, sockets in room: ${socketCount}, ids: ${socketIds.join(", ")}`);
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
  const delay = Math.max(0, revealAt - Date.now());
  console.log(`[reveal] scheduling for ${roomCode} in ${delay}ms`);
  const timer = setTimeout(() => {
    revealTimers.delete(roomCode);
    console.log(`[reveal] timer fired for ${roomCode}`);
    const updated = revealRound(roomCode);
    console.log(`[reveal] revealRound result: phase=${updated?.phase}, players=${updated ? Object.keys(updated.players).length : 0}`);
    if (updated) {
      emitRoundReveal(io, updated);
      emitState(io, roomCode);
      if (updated.phase === "FINISHED") {
        emitGameOver(io, updated);
        revealTimers.delete(roomCode);
        clearGame(roomCode);
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
  const state = startNextRound(roomCode, opts);
  console.log(`[game] startRoundAndBroadcast ${roomCode}: round=${state?.currentRound}, phase=${state?.phase}, revealAt=${state?.timing?.revealAt}`);
  if (!state) return undefined;
  if (state.phase === "FINISHED") {
    emitGameOver(io, state);
    return state;
  }
  emitRoundStart(io, state);
  emitState(io, roomCode);
  if (state.timing.revealAt) {
    scheduleReveal(io, roomCode, state.timing.revealAt);
  }
  return state;
}

export function broadcastState(io: IOServer, roomCode: string): GameState | undefined {
  return emitState(io, roomCode);
}

export function broadcastGameOver(io: IOServer, roomCode: string) {
  const snapshot = gameStateSnapshot(roomCode);
  if (snapshot) {
    emitGameOver(io, snapshot);
  }
  revealTimers.delete(roomCode);
  clearGame(roomCode);
}

export function clearRevealTimer(roomCode: string) {
  const existing = revealTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    revealTimers.delete(roomCode);
  }
}
