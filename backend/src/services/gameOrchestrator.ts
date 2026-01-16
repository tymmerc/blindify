import type { Server as IOServer } from "socket.io";
import { GamePhase, GameMode, type RoomState } from "../types/game";
import * as gameService from "./realtimeGame";

const revealTimers = new Map<string, NodeJS.Timeout>();
const advanceTimers = new Map<string, NodeJS.Timeout>();

const REVEAL_DURATION_MS = 5000; // Default duration for reveal before auto-advancing if enabled

/**
 * Broadcasts the current state to all players in the room.
 * The frontend should be a passive mirror of this state.
 */
export function broadcastState(io: IOServer, roomCode: string): RoomState | undefined {
  const state = gameService.getGameState(roomCode);
  if (state) {
    io.to(roomCode).emit("game:state", state);
  }
  return state;
}

/**
 * Starts the first or next round.
 */
export function startNextRound(io: IOServer, roomCode: string): RoomState | undefined {
  const state = gameService.startNextRound(roomCode);
  if (!state) return undefined;

  clearAdvanceTimer(roomCode);
  clearRevealTimer(roomCode);

  if (state.phase === GamePhase.FINISHED) {
    io.to(roomCode).emit("game:over", state);
    // Maintain compatibility with legacy event name expected by some clients
    io.to(roomCode).emit("game:game:over", { roomCode, players: state.players });
  } else {
    // Inform clients that a new round has started (mirrors legacy events)
    io.to(roomCode).emit("game:round:start", {
      roomCode,
      round: state.currentRound,
      track: state.currentTrack,
      timing: state.timing,
    });

    // Automatically schedule reveal after GUESSING phase
    if (state.timing.revealAt) {
      scheduleReveal(io, roomCode, state.timing.revealAt);
    }
  }
  
  broadcastState(io, roomCode);
  return state;
}

/**
 * Records a guess from a player.
 */
export function handleGuess(io: IOServer, roomCode: string, userId: number, guess: any): void {
  const state = gameService.recordAnswer(roomCode, userId, guess);
  if (state) {
    // In Friends mode, we might want to broadcast "X has answered"
    // We send a specific event but also update the full state
    io.to(roomCode).emit("game:player_answered", { userId });

    if (state.mode === GameMode.FRIENDS && gameService.areAllPlayersAnswered(roomCode)) {
      revealRound(io, roomCode);
      return;
    }

    broadcastState(io, roomCode);
  }
}

/**
 * Transitions the game to REVEAL phase.
 */
export function revealRound(io: IOServer, roomCode: string): void {
  const state = gameService.revealRound(roomCode);
  if (state) {
    clearRevealTimer(roomCode);
    // Notify clients of the reveal (mirrors legacy events)
    io.to(roomCode).emit("game:round:reveal", {
      roomCode,
      round: state.currentRound,
      players: state.players,
      timing: state.timing,
    });
    broadcastState(io, roomCode);

    // If autoAdvance is enabled (common in EVENT mode), schedule next round
    if (state.config.autoAdvance) {
      scheduleAdvance(io, roomCode, Date.now() + REVEAL_DURATION_MS);
    }
  }
}

/**
 * Marks a player as ready for the next round.
 * If all players are ready, advances to the next round.
 */
export function handlePlayerReady(io: IOServer, roomCode: string, userId: number): void {
  const state = gameService.markPlayerReady(roomCode, userId);
  if (!state || state.phase !== GamePhase.REVEAL) return;

  broadcastState(io, roomCode);

  // In Friends mode, we wait for everyone to be ready
  if (state.mode === GameMode.FRIENDS) {
    if (gameService.areAllPlayersReady(roomCode)) {
      startNextRound(io, roomCode);
    }
  }
}

/**
 * Schedules the transition to REVEAL phase.
 */
function scheduleReveal(io: IOServer, roomCode: string, revealAt: number): void {
  clearRevealTimer(roomCode);
  const delay = Math.max(0, revealAt - Date.now());
  const timer = setTimeout(() => {
    revealRound(io, roomCode);
  }, delay);
  revealTimers.set(roomCode, timer);
}

/**
 * Schedules the transition to the next round.
 */
function scheduleAdvance(io: IOServer, roomCode: string, advanceAt: number): void {
  clearAdvanceTimer(roomCode);
  const delay = Math.max(0, advanceAt - Date.now());
  const timer = setTimeout(() => {
    startNextRound(io, roomCode);
  }, delay);
  advanceTimers.set(roomCode, timer);
}

export function clearRevealTimer(roomCode: string): void {
  const existing = revealTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    revealTimers.delete(roomCode);
  }
}

export function clearAdvanceTimer(roomCode: string): void {
  const existing = advanceTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    advanceTimers.delete(roomCode);
  }
}
