import {
  bootstrapGameState,
  getGameState,
  startNextRound,
  recordAnswer,
  revealRound,
  markReady,
  allAnswerablePlayers,
  clearGame,
  upsertPlayer,
  removePlayer,
  type RoundTrack,
} from "../../src/services/realtimeGame";

const ROOM = "TEST_ROOM";

function makeTracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

function setupGame(opts?: {
  mode?: string;
  tracks?: RoundTrack[];
  participants?: Array<{ userId: number; username: string | null }>;
  roundDurationMs?: number;
}) {
  clearGame(ROOM);
  return bootstrapGameState({
    roomCode: ROOM,
    hostUserId: 1,
    tracks: opts?.tracks ?? makeTracks(3),
    participants: opts?.participants ?? [
      { userId: 1, username: "Host" },
      { userId: 2, username: "Player2" },
      { userId: 3, username: "Player3" },
    ],
    mode: opts?.mode ?? "friends",
    config: { roundDurationMs: opts?.roundDurationMs ?? 20000 },
  });
}

afterEach(() => {
  clearGame(ROOM);
});

describe("bootstrapGameState", () => {
  it("creates a game in LOBBY phase", () => {
    const state = setupGame();
    expect(state.phase).toBe("LOBBY");
    expect(state.roomCode).toBe(ROOM);
    expect(state.currentRound).toBe(0);
    expect(state.totalRounds).toBe(3);
    expect(state.currentTrack).toBeNull();
  });

  it("initializes players with zero scores", () => {
    const state = setupGame();
    expect(Object.keys(state.players)).toHaveLength(3);
    expect(state.players[1].score).toBe(0);
    expect(state.players[1].streak).toBe(0);
    expect(state.players[1].hasAnswered).toBe(false);
  });

  it("stores mode and config", () => {
    const state = setupGame({ mode: "event", roundDurationMs: 15000 });
    expect(state.mode).toBe("event");
    expect(state.config.roundDurationMs).toBe(15000);
  });

  it("defaults to friends mode with 20s rounds", () => {
    clearGame(ROOM);
    const state = bootstrapGameState({
      roomCode: ROOM,
      hostUserId: 1,
      tracks: makeTracks(1),
      participants: [{ userId: 1, username: "Host" }],
    });
    expect(state.mode).toBe("friends");
    expect(state.config.roundDurationMs).toBe(20000);
  });
});

describe("startNextRound", () => {
  it("transitions from LOBBY to GUESSING", () => {
    setupGame();
    const state = startNextRound(ROOM);
    expect(state?.phase).toBe("GUESSING");
    expect(state?.currentRound).toBe(1);
    expect(state?.currentTrack?.title).toBe("Song 1");
    expect(state?.timing.startAt).toBeDefined();
    expect(state?.timing.revealAt).toBeDefined();
  });

  it("resets player states between rounds", () => {
    setupGame();
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "wrong guess");
    const revealed = revealRound(ROOM);
    expect(revealed?.players[2].hasAnswered).toBe(true);

    const next = startNextRound(ROOM);
    expect(next?.players[2].hasAnswered).toBe(false);
    expect(next?.players[2].isReady).toBe(false);
    expect(next?.players[2].lastGuess).toBeUndefined();
  });

  it("transitions to FINISHED after last round", () => {
    setupGame({ tracks: makeTracks(1) });
    startNextRound(ROOM); // round 1
    revealRound(ROOM);
    const state = startNextRound(ROOM); // no round 2
    expect(state?.phase).toBe("FINISHED");
    expect(state?.currentTrack).toBeNull();
  });

  it("sets revealAt = startAt + roundDurationMs", () => {
    setupGame({ roundDurationMs: 15000 });
    const state = startNextRound(ROOM);
    const diff = (state?.timing.revealAt ?? 0) - (state?.timing.startAt ?? 0);
    expect(diff).toBe(15000);
  });

  it("returns undefined for non-existent room", () => {
    expect(startNextRound("FAKE_ROOM")).toBeUndefined();
  });
});

describe("recordAnswer", () => {
  beforeEach(() => {
    setupGame();
    startNextRound(ROOM);
  });

  it("marks player as answered", () => {
    recordAnswer(ROOM, 2, "My Guess");
    const state = getGameState(ROOM);
    expect(state?.players[2].hasAnswered).toBe(true);
    expect(state?.players[2].lastGuess).toBe("My Guess");
  });

  it("stores structured title/artist separately", () => {
    recordAnswer(ROOM, 2, "combined", null, "Song Title", "Some Artist");
    const state = getGameState(ROOM);
    expect(state?.players[2].lastGuessTitle).toBe("Song Title");
    expect(state?.players[2].lastGuessArtist).toBe("Some Artist");
  });

  it("stores source guess", () => {
    recordAnswer(ROOM, 2, "guess", 3);
    const state = getGameState(ROOM);
    expect(state?.players[2].lastSourceGuess).toBe(3);
  });

  it("does not allow answering in REVEAL phase", () => {
    revealRound(ROOM);
    const before = getGameState(ROOM)!.players[2].lastGuess;
    recordAnswer(ROOM, 2, "late answer");
    expect(getGameState(ROOM)?.players[2].lastGuess).toBe(before);
  });

  it("records answerAt timestamp", () => {
    const before = Date.now();
    recordAnswer(ROOM, 2, "guess");
    const after = Date.now();
    const answerAt = getGameState(ROOM)?.players[2].answerAt ?? 0;
    expect(answerAt).toBeGreaterThanOrEqual(before);
    expect(answerAt).toBeLessThanOrEqual(after);
  });
});

describe("revealRound - scoring", () => {
  const tracks: RoundTrack[] = [{
    round: 1,
    trackId: "t1",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    previewUrl: null,
  }];

  beforeEach(() => {
    setupGame({ tracks });
    startNextRound(ROOM);
  });

  it("awards full points for correct title + artist", () => {
    recordAnswer(ROOM, 2, "", null, "Bohemian Rhapsody", "Queen");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("correct");
    // title(40) + artist(30) + speed(<=30) + source(0) - penalty(0)
    expect(state?.players[2].score).toBeGreaterThanOrEqual(70);
    expect(state?.players[2].score).toBeLessThanOrEqual(100);
  });

  it("awards partial for title only", () => {
    recordAnswer(ROOM, 2, "", null, "Bohemian Rhapsody", "Wrong Artist");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("close");
    expect(state?.players[2].score).toBeGreaterThanOrEqual(40);
  });

  it("awards partial for artist only", () => {
    recordAnswer(ROOM, 2, "", null, "Wrong Title", "Queen");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("close");
    expect(state?.players[2].score).toBeGreaterThanOrEqual(30);
  });

  it("awards zero for completely wrong answer", () => {
    recordAnswer(ROOM, 2, "", null, "Wrong", "Wrong");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("wrong");
    expect(state?.players[2].score).toBe(0);
  });

  it("awards zero for empty answer (no penalty)", () => {
    recordAnswer(ROOM, 2, "");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("wrong");
    expect(state?.players[2].score).toBe(0);
  });

  it("handles case-insensitive matching", () => {
    recordAnswer(ROOM, 2, "", null, "bohemian rhapsody", "queen");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("correct");
  });

  it("handles accented characters", () => {
    clearGame(ROOM);
    const accentTracks: RoundTrack[] = [{
      round: 1, trackId: "t1", title: "Déjà Vu", artist: "Beyoncé", previewUrl: null,
    }];
    setupGame({ tracks: accentTracks });
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "", null, "deja vu", "beyonce");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("correct");
  });

  it("transitions phase to REVEAL", () => {
    recordAnswer(ROOM, 2, "guess");
    const state = revealRound(ROOM);
    expect(state?.phase).toBe("REVEAL");
  });

  it("updates accuracy correctly", () => {
    recordAnswer(ROOM, 2, "", null, "Bohemian Rhapsody", "Queen");
    const state = revealRound(ROOM);
    expect(state?.players[2].accuracy).toBe(100);
    expect(state?.players[2].correct).toBe(1);
    expect(state?.players[2].rounds).toBe(1);
  });

  it("applies penalty for wrong guess (not empty)", () => {
    recordAnswer(ROOM, 2, "", null, "Totally Wrong", "Also Wrong");
    const state = revealRound(ROOM);
    // penalty of 10 applied, but clamped to 0 minimum
    expect(state?.players[2].score).toBe(0);
  });

  it("awards source bonus when guessing track owner correctly", () => {
    const tracksWithOwner: RoundTrack[] = [{
      round: 1, trackId: "t1", title: "Song 1", artist: "Artist 1", previewUrl: null,
      metadata: { owner_user_id: 3 },
    }];
    clearGame(ROOM);
    setupGame({ tracks: tracksWithOwner });
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "", 3, "Song 1", "Artist 1");
    const state = revealRound(ROOM);
    // title(40) + artist(30) + speed + source(10)
    expect(state?.players[2].score).toBeGreaterThanOrEqual(80);
  });
});

describe("revealRound - streak tracking", () => {
  beforeEach(() => {
    setupGame({ tracks: makeTracks(3) });
  });

  it("builds streak on consecutive correct answers", () => {
    // Round 1
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "", null, "Song 1", "Artist 1");
    revealRound(ROOM);
    expect(getGameState(ROOM)?.players[2].streak).toBe(1);

    // Round 2
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "", null, "Song 2", "Artist 2");
    revealRound(ROOM);
    expect(getGameState(ROOM)?.players[2].streak).toBe(2);
    expect(getGameState(ROOM)?.players[2].bestStreak).toBe(2);
  });

  it("resets streak on wrong answer", () => {
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "", null, "Song 1", "Artist 1");
    revealRound(ROOM);

    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "", null, "Wrong", "Wrong");
    revealRound(ROOM);
    expect(getGameState(ROOM)?.players[2].streak).toBe(0);
    expect(getGameState(ROOM)?.players[2].bestStreak).toBe(1);
  });
});

describe("markReady", () => {
  beforeEach(() => {
    setupGame();
    startNextRound(ROOM);
    revealRound(ROOM);
  });

  it("marks player as ready", () => {
    markReady(ROOM, 2);
    expect(getGameState(ROOM)?.players[2].isReady).toBe(true);
  });

  it("auto-advances when all players ready", () => {
    markReady(ROOM, 1);
    markReady(ROOM, 2);
    const state = markReady(ROOM, 3);
    // Should have advanced to next round (GUESSING) or FINISHED
    expect(state?.phase === "GUESSING" || state?.phase === "FINISHED").toBe(true);
    expect(state?.currentRound).toBeGreaterThanOrEqual(2);
  });

  it("does not advance with partial readiness", () => {
    markReady(ROOM, 1);
    markReady(ROOM, 2);
    const state = getGameState(ROOM);
    expect(state?.phase).toBe("REVEAL");
  });
});

describe("allAnswerablePlayers - event mode", () => {
  it("excludes host in event mode", () => {
    setupGame({ mode: "event" });
    startNextRound(ROOM);
    const answerable = allAnswerablePlayers(ROOM);
    expect(answerable.map(p => p.userId)).toEqual([2, 3]);
  });

  it("includes everyone in friends mode", () => {
    setupGame({ mode: "friends" });
    startNextRound(ROOM);
    const answerable = allAnswerablePlayers(ROOM);
    expect(answerable.map(p => p.userId)).toEqual([1, 2, 3]);
  });

  it("event mode markReady ignores host for auto-advance", () => {
    setupGame({ mode: "event" });
    startNextRound(ROOM);
    revealRound(ROOM);

    // Only participants (2,3) need to be ready
    markReady(ROOM, 2);
    const state = markReady(ROOM, 3);
    expect(state?.phase === "GUESSING" || state?.phase === "FINISHED").toBe(true);
  });
});

describe("upsertPlayer / removePlayer", () => {
  beforeEach(() => setupGame());

  it("adds a new player mid-game", () => {
    upsertPlayer(ROOM, { userId: 99, username: "Latecomer" });
    expect(getGameState(ROOM)?.players[99]).toBeDefined();
    expect(getGameState(ROOM)?.players[99].score).toBe(0);
  });

  it("updates existing player username", () => {
    upsertPlayer(ROOM, { userId: 2, username: "NewName" });
    expect(getGameState(ROOM)?.players[2].username).toBe("NewName");
  });

  it("removes a player", () => {
    removePlayer(ROOM, 3);
    expect(getGameState(ROOM)?.players[3]).toBeUndefined();
  });

  it("clears game when last player removed", () => {
    removePlayer(ROOM, 1);
    removePlayer(ROOM, 2);
    removePlayer(ROOM, 3);
    expect(getGameState(ROOM)).toBeUndefined();
  });
});

describe("full game flow", () => {
  it("plays through a complete 2-round game", () => {
    setupGame({ tracks: makeTracks(2) });

    // Round 1
    let state = startNextRound(ROOM)!;
    expect(state.phase).toBe("GUESSING");
    expect(state.currentRound).toBe(1);

    recordAnswer(ROOM, 1, "", null, "Song 1", "Artist 1");
    recordAnswer(ROOM, 2, "", null, "Song 1", "Wrong");
    recordAnswer(ROOM, 3, "", null, "Wrong", "Wrong");

    state = revealRound(ROOM)!;
    expect(state.phase).toBe("REVEAL");
    expect(state.players[1].lastVerdict).toBe("correct");
    expect(state.players[2].lastVerdict).toBe("close");
    expect(state.players[3].lastVerdict).toBe("wrong");

    markReady(ROOM, 1);
    markReady(ROOM, 2);
    state = markReady(ROOM, 3)!;
    expect(state.phase).toBe("GUESSING");
    expect(state.currentRound).toBe(2);

    // Round 2
    recordAnswer(ROOM, 1, "", null, "Song 2", "Artist 2");
    recordAnswer(ROOM, 2, "", null, "Song 2", "Artist 2");
    recordAnswer(ROOM, 3, "", null, "Song 2", "Artist 2");

    state = revealRound(ROOM)!;
    expect(state.players[1].streak).toBe(2);
    expect(state.players[2].streak).toBe(1);
    expect(state.players[3].streak).toBe(1);

    markReady(ROOM, 1);
    markReady(ROOM, 2);
    state = markReady(ROOM, 3)!;
    expect(state.phase).toBe("FINISHED");

    // Player 1 should have highest score (2 correct, with streak)
    expect(state.players[1].score).toBeGreaterThan(state.players[3].score);
  });
});
