import type { Server as IOServer } from "socket.io";
import {
  bootstrapStreamerGame,
  clearStreamerGame,
  getStreamerState,
  recordChatGuess,
  recordStreamerGuess,
  startNextStreamerRound,
} from "./streamerGame";
import type { StreamerRound, StreamerSubMode } from "../types/streamer";
import { GameMode } from "../types/game";

export function initStreamerGame(io: IOServer, params: {
  roomCode: string;
  hostUserId: number;
  rounds: StreamerRound[];
  subMode: StreamerSubMode;
}) {
  const state = bootstrapStreamerGame(params);
  io.to(params.roomCode).emit("state:sync", state);
  return state;
}

export function handleStreamerGuess(io: IOServer, roomCode: string, userId: number, guess: string, mode: GameMode) {
  if (mode !== GameMode.STREAMER) return;
  const state = getStreamerState(roomCode);
  if (!state) return;
  if (state.hostUserId === userId) {
    recordStreamerGuess(io, roomCode, userId, guess);
  } else {
    recordChatGuess(io, roomCode, userId, guess);
  }
}

export function handleStreamerHostGuess(io: IOServer, roomCode: string, userId: number, guess: string) {
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
