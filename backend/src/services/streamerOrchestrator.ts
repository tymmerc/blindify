import type { Server as IOServer } from "socket.io";
import {
  armStreamerIdle,
  bootstrapStreamerGame,
  clearStreamerGame,
  getStreamerState,
  recordStreamerGuess,
  startNextStreamerRound,
} from "./streamerGame";
import { emitStreamerState } from "./streamerChannels";
import type { StreamerRound, StreamerSubMode } from "../types/streamer";
import type { StreamerTimings } from "./streamerGame";
import { GameMode } from "../types/game";

export function initStreamerGame(io: IOServer, params: {
  roomCode: string;
  hostUserId: number;
  rounds: StreamerRound[];
  subMode: StreamerSubMode;
  requestedRounds?: number;
  shortReason?: "library" | "lookup" | null;
  sessionId?: number | null;
  timings?: Partial<StreamerTimings>;
}) {
  const state = bootstrapStreamerGame(params);
  emitStreamerState(io, params.roomCode, "state:sync", state);
  armStreamerIdle(io, params.roomCode);
  return state;
}

/** Seul l'hote repond par ce chemin : les viewers passent par live:guess. */
export function handleStreamerGuess(
  io: IOServer,
  roomCode: string,
  userId: number,
  guess: { title?: string; artist?: string },
  mode: GameMode,
) {
  if (mode !== GameMode.STREAMER) return;
  const state = getStreamerState(roomCode);
  if (!state || state.hostUserId !== userId) return;
  recordStreamerGuess(io, roomCode, userId, guess);
}

export function advanceStreamerRound(io: IOServer, roomCode: string) {
  startNextStreamerRound(io, roomCode);
}

export function getStreamerSnapshot(roomCode: string) {
  return getStreamerState(roomCode);
}

export function cleanupStreamer(roomCode: string) {
  clearStreamerGame(roomCode);
}
