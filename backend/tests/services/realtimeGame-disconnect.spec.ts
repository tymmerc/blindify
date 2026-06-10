/**
 * Tests for disconnect/reconnect handling in the multiplayer game flow.
 *
 * These tests cover bugs that previously caused games to get stuck:
 * - A player marked `disconnected` should NOT block the reveal timer
 * - The `disconnected` flag must persist across rounds (not reset by startNextRound)
 * - markReconnected clears the flag and re-includes the player
 * - markReady auto-advance only requires non-disconnected players to be ready
 */
import {
  bootstrapGameState,
  getGameState,
  startNextRound,
  recordAnswer,
  revealRound,
  markReady,
  markDisconnected,
  markReconnected,
  allAnswerablePlayers,
  clearGame,
  type RoundTrack,
} from "../../src/services/realtimeGame";

const ROOM = "TEST_DISCONNECT_ROOM";

function makeTracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

function setupGame(playerCount = 3): void {
  clearGame(ROOM);
  bootstrapGameState({
    roomCode: ROOM,
    hostUserId: 1,
    tracks: makeTracks(3),
    participants: Array.from({ length: playerCount }, (_, i) => ({
      userId: i + 1,
      username: `Player${i + 1}`,
    })),
    mode: "friends",
    config: { roundDurationMs: 20000 },
  });
}

afterEach(() => {
  clearGame(ROOM);
});

describe("markDisconnected / markReconnected", () => {
  it("markDisconnected sets disconnected=true on the player", () => {
    setupGame();
    markDisconnected(ROOM, 2);
    expect(getGameState(ROOM)?.players[2].disconnected).toBe(true);
    expect(getGameState(ROOM)?.players[1].disconnected).toBeFalsy();
  });

  it("markReconnected clears the disconnected flag", () => {
    setupGame();
    markDisconnected(ROOM, 2);
    markReconnected(ROOM, 2);
    expect(getGameState(ROOM)?.players[2].disconnected).toBe(false);
  });

  it("markReconnected on a non-disconnected player is a no-op", () => {
    setupGame();
    markReconnected(ROOM, 2);
    expect(getGameState(ROOM)?.players[2].disconnected).toBe(false);
  });

  it("returns undefined for non-existent room", () => {
    expect(markDisconnected("NOPE", 1)).toBeUndefined();
    expect(markReconnected("NOPE", 1)).toBeUndefined();
  });

  it("ignores unknown user without crashing", () => {
    setupGame();
    expect(() => markDisconnected(ROOM, 999)).not.toThrow();
    expect(() => markReconnected(ROOM, 999)).not.toThrow();
  });
});

describe("allAnswerablePlayers excludes disconnected", () => {
  it("returns only connected players", () => {
    setupGame();
    startNextRound(ROOM);
    markDisconnected(ROOM, 2);
    const answerable = allAnswerablePlayers(ROOM);
    expect(answerable.map(p => p.userId).sort()).toEqual([1, 3]);
  });

  it("re-includes player after markReconnected", () => {
    setupGame();
    startNextRound(ROOM);
    markDisconnected(ROOM, 2);
    expect(allAnswerablePlayers(ROOM).map(p => p.userId).sort()).toEqual([1, 3]);
    markReconnected(ROOM, 2);
    expect(allAnswerablePlayers(ROOM).map(p => p.userId).sort()).toEqual([1, 2, 3]);
  });
});

describe("disconnected flag persists across rounds", () => {
  // Regression test: startNextRound used to reset disconnected=false for all
  // players. This caused games to get stuck because an offline player would
  // be re-marked "answerable" at each round and block the reveal.
  it("startNextRound does NOT reset disconnected flag", () => {
    setupGame();
    startNextRound(ROOM);
    markDisconnected(ROOM, 2);

    // Reveal round 1
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 3, "Song 1 Artist 1");
    revealRound(ROOM);

    // Advance to round 2
    markReady(ROOM, 1);
    markReady(ROOM, 3);

    // Player 2 must STILL be disconnected after the round transition.
    expect(getGameState(ROOM)?.players[2].disconnected).toBe(true);
  });

  it("disconnected player does not block multi-round game", () => {
    setupGame();

    // Round 1: player 2 disconnects before answering
    startNextRound(ROOM);
    markDisconnected(ROOM, 2);
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 3, "Song 1 Artist 1");

    let state = revealRound(ROOM);
    expect(state?.phase).toBe("REVEAL");

    // Only the 2 connected players need to ready up
    markReady(ROOM, 1);
    state = markReady(ROOM, 3);
    expect(state?.phase).toBe("GUESSING");
    expect(state?.currentRound).toBe(2);

    // Round 2: same scenario, player 2 still disconnected
    recordAnswer(ROOM, 1, "Song 2 Artist 2");
    recordAnswer(ROOM, 3, "Song 2 Artist 2");

    state = revealRound(ROOM);
    expect(state?.phase).toBe("REVEAL");

    markReady(ROOM, 1);
    state = markReady(ROOM, 3);
    expect(state?.phase).toBe("GUESSING");
    expect(state?.currentRound).toBe(3);
  });
});

describe("markReady auto-advance with disconnected players", () => {
  beforeEach(() => {
    setupGame();
    startNextRound(ROOM);
    revealRound(ROOM);
  });

  it("auto-advances when all NON-DISCONNECTED players are ready", () => {
    markDisconnected(ROOM, 3);
    markReady(ROOM, 1);
    const state = markReady(ROOM, 2);
    // Player 3 is offline so we should advance with just 1+2 ready.
    expect(state?.phase === "GUESSING" || state?.phase === "FINISHED").toBe(true);
  });

  it("does NOT advance when a connected player has not readied", () => {
    markDisconnected(ROOM, 3);
    markReady(ROOM, 1);
    const state = getGameState(ROOM);
    expect(state?.phase).toBe("REVEAL");
  });

  it("re-blocks advance after markReconnected on a player", () => {
    markDisconnected(ROOM, 3);
    markReady(ROOM, 1);
    // Now player 3 reconnects mid-reveal
    markReconnected(ROOM, 3);
    // Even with player 1+2 ready, player 3 (now reconnected) must also be ready
    const state = markReady(ROOM, 2);
    expect(state?.phase).toBe("REVEAL");
    expect(getGameState(ROOM)?.players[3].isReady).toBe(false);
  });
});

describe("answer recording with disconnected players", () => {
  it("connected players answering = early reveal even if a player is offline", () => {
    setupGame();
    startNextRound(ROOM);
    markDisconnected(ROOM, 3);

    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");

    // The socketHandlers.ts caller checks allAnswerablePlayers; let's verify
    // every answerable player has answered.
    const answerable = allAnswerablePlayers(ROOM);
    expect(answerable.length).toBe(2);
    expect(answerable.every(p => p.hasAnswered)).toBe(true);
  });

  it("a disconnected player answering does not crash and does not change state", () => {
    setupGame();
    startNextRound(ROOM);
    markDisconnected(ROOM, 2);

    expect(() => recordAnswer(ROOM, 2, "anything")).not.toThrow();
    // Their answer is recorded but they remain disconnected
    expect(getGameState(ROOM)?.players[2].disconnected).toBe(true);
  });
});
