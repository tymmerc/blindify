import crypto from "crypto";

export interface RoomGameState {
  sessionId: number;
  roomCode: string;
  round: number;
  totalRounds: number;
  stateHash: string;
  lastUpdate: number;
}

const roomStates = new Map<string, RoomGameState>();

export function generateStateHash(sessionId: number, roomCode: string, round: number, totalRounds: number): string {
  const data = JSON.stringify({ sessionId, roomCode, round, totalRounds });
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 12);
}

export function createRoomState(params: { sessionId: number; roomCode: string; totalRounds: number; round?: number }): RoomGameState {
  const round = Math.max(1, params.round ?? 1);
  const state: RoomGameState = {
    sessionId: params.sessionId,
    roomCode: params.roomCode,
    round,
    totalRounds: params.totalRounds,
    stateHash: generateStateHash(params.sessionId, params.roomCode, round, params.totalRounds),
    lastUpdate: Date.now(),
  };
  roomStates.set(params.roomCode, state);
  return state;
}

export function getRoomState(roomCode: string): RoomGameState | undefined {
  return roomStates.get(roomCode);
}

export function updateRoomRound(roomCode: string, nextRound: number): RoomGameState | undefined {
  const state = roomStates.get(roomCode);
  if (!state) return undefined;
  state.round = nextRound;
  state.stateHash = generateStateHash(state.sessionId, state.roomCode, nextRound, state.totalRounds);
  state.lastUpdate = Date.now();
  return state;
}

export function touchRoomState(roomCode: string): void {
  const state = roomStates.get(roomCode);
  if (state) {
    state.lastUpdate = Date.now();
  }
}

export function clearRoomState(roomCode: string): void {
  roomStates.delete(roomCode);
}
