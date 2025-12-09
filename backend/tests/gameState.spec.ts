import {
  clearRoomState,
  createRoomState,
  generateStateHash,
  getRoomState,
  touchRoomState,
  updateRoomRound,
} from "../src/services/gameState";

describe("game state hashing", () => {
  it("produces stable hashes for same inputs and changes when round changes", () => {
    const base = generateStateHash(1, "ROOMA", 1, 10);
    expect(base).toEqual(generateStateHash(1, "ROOMA", 1, 10));
    expect(base).not.toEqual(generateStateHash(1, "ROOMA", 2, 10));
    expect(base).not.toEqual(generateStateHash(1, "ROOMB", 1, 10));
  });
});

describe("room state store", () => {
  const code = "ROOM_TEST";

  afterEach(() => {
    clearRoomState(code);
  });

  it("creates and stores a room state with defaults", () => {
    const state = createRoomState({ sessionId: 42, roomCode: code, totalRounds: 7 });
    expect(state.round).toBe(1);
    expect(state.totalRounds).toBe(7);
    expect(typeof state.lastUpdate).toBe("number");
    expect(state.stateHash).toBeTruthy();
    expect(getRoomState(code)).toBe(state);
  });

  it("updates round and state hash when advancing", () => {
    const state = createRoomState({ sessionId: 99, roomCode: code, totalRounds: 3 });
    const initialHash = state.stateHash;
    const updated = updateRoomRound(code, 2);
    expect(updated?.round).toBe(2);
    expect(updated?.stateHash).toBeDefined();
    expect(updated?.stateHash).not.toBe(initialHash);
  });

  it("touches lastUpdate without mutating the hash", () => {
    jest.useFakeTimers();
    const state = createRoomState({ sessionId: 5, roomCode: code, totalRounds: 4 });
    const initialHash = state.stateHash;
    const firstTimestamp = state.lastUpdate;
    jest.advanceTimersByTime(1500);
    touchRoomState(code);
    const refreshed = getRoomState(code)!;
    expect(refreshed.lastUpdate).toBeGreaterThan(firstTimestamp);
    expect(refreshed.stateHash).toBe(initialHash);
    jest.useRealTimers();
  });

  it("clears a room state", () => {
    createRoomState({ sessionId: 7, roomCode: code, totalRounds: 2 });
    clearRoomState(code);
    expect(getRoomState(code)).toBeUndefined();
  });
});
