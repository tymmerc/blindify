/**
 * Autour d'une table, l'explication avant la 1re manche (24/11) : la manche 1
 * part toute seule apres l'explication et le 3-2-1, et son chrono reste entier.
 *
 * Horloge factice et faux serveur socket.io, comme realtimeOrchestrator-relance.
 */
import type { Server } from "socket.io";

jest.mock("../../src/services/gamePersistence", () => ({
  persistGameResults: jest.fn(async () => undefined),
  persistRoundResponses: jest.fn(async () => undefined),
}));

import { bootstrapGameState, clearGame, getGameState, type RoundTrack } from "../../src/services/realtimeGame";
import { clearGraceTimer, clearPacingTimer, clearRevealTimer, startRoundAndBroadcast } from "../../src/services/realtimeOrchestrator";
import { ROUND_PACING, firstRoundPrerollMs } from "../../src/services/roundPacing";

const ROOM = "TABLE_INTRO";
const ROUND_MS = 30_000;

function fakeIo(): Server {
  return {
    to: () => ({ emit: () => undefined }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
  } as unknown as Server;
}

function makeTracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
});

afterEach(() => {
  clearRevealTimer(ROOM);
  clearPacingTimer(ROOM);
  clearGraceTimer(ROOM);
  clearGame(ROOM);
  jest.useRealTimers();
});

describe("firstRoundPrerollMs", () => {
  it("ajoute l'explication au 3-2-1 seulement autour d'une table", () => {
    expect(firstRoundPrerollMs("event")).toBe(ROUND_PACING.countdownMs + ROUND_PACING.tableIntroMs);
    expect(firstRoundPrerollMs("friends")).toBe(ROUND_PACING.countdownMs);
  });

  it("reste entre 5 et 10 s autour d'une table (choix de Tym)", () => {
    expect(ROUND_PACING.tableIntroMs).toBeGreaterThanOrEqual(5_000);
    expect(firstRoundPrerollMs("event")).toBeLessThanOrEqual(10_000);
  });
});

describe("1re manche autour d'une table", () => {
  it("part seule apres l'explication, avec son chrono entier", () => {
    const io = fakeIo();
    bootstrapGameState({
      roomCode: ROOM,
      hostUserId: 1,
      tracks: makeTracks(3),
      participants: [1, 2, 3].map(id => ({ userId: id, username: `P${id}` })),
      mode: "event",
      config: { roundDurationMs: ROUND_MS },
    });
    const launchedAt = Date.now();
    const preroll = firstRoundPrerollMs("event");
    startRoundAndBroadcast(io, ROOM, { startAt: launchedAt + preroll });

    const state = getGameState(ROOM)!;
    expect(state.phase).toBe("GUESSING");
    expect(state.currentRound).toBe(1);
    expect(state.timing.startAt).toBe(launchedAt + preroll);
    expect(state.timing.revealAt! - state.timing.startAt!).toBe(ROUND_MS);

    // Personne ne touche a rien : l'explication passe, la manche joue ses 30 s entieres.
    jest.advanceTimersByTime(preroll + ROUND_MS - 1);
    expect(getGameState(ROOM)?.phase).toBe("GUESSING");
    jest.advanceTimersByTime(1);
    expect(getGameState(ROOM)?.phase).toBe("REVEAL");
  });
});
