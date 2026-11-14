/**
 * T35 : des manches muettes en fin de partie (soiree a 8 du 12/11).
 *
 * Les liens Deezer (`hdnea=exp=...`) vivent ~15 min. Les 20 manches sont
 * preparees au lancement : une partie qui depasse 15 min envoyait aux joueurs
 * un lien deja mort (403), donc pas de son. Le lien envoye doit etre valable
 * au moment ou chaque manche commence.
 *
 * Horloge factice et faux serveur socket.io, comme realtimeOrchestrator-relance.
 * Deezer et la base sont remplaces : une recherche rend un lien neuf de 15 min.
 */
import type { Server } from "socket.io";

jest.mock("../../src/services/gamePersistence", () => ({
  persistGameResults: jest.fn(async () => undefined),
  persistRoundResponses: jest.fn(async () => undefined),
}));

const LINK_LIFE_MS = 15 * 60_000;
const linkValidUntil = (ms: number, tag: string) =>
  `https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/${tag}.mp3?hdnea=exp=${Math.floor(ms / 1000)}~acl=/api/1/1/a/b/c/${tag}.mp3*~hmac=x`;

const freshLink = async (row: { id: string }): Promise<{ url: string | null; failed: boolean }> => ({
  url: linkValidUntil(Date.now() + LINK_LIFE_MS, `neuf-${row.id}`),
  failed: false,
});
const hydratePreviewOutcome = jest.fn(freshLink);
jest.mock("../../src/services/trackResolution", () => ({
  hydratePreviewOutcome: (...args: unknown[]) => hydratePreviewOutcome(...(args as [{ id: string }])),
}));
jest.mock("../../src/config/db", () => ({
  pool: {
    query: jest.fn(async (_sql: string, params: unknown[]) => ({
      rows: [{ id: String(params[0]), provider: "deezer", external_id: String(params[0]), title: "t", artist: "a", album_cover: null, audio_url: null, duration_ms: null, metadata: null }],
    })),
  },
}));

import { isExpiredPreview, previewExpiresAt } from "../../src/utils/previewExpiry";
import { bootstrapGameState, clearGame, getGameState, pauseGame, resumeGame, type RoundTrack } from "../../src/services/realtimeGame";
import {
  clearPacingTimer,
  clearGraceTimer,
  clearRevealTimer,
  refreshRoundPreviews,
  startRoundAndBroadcast,
} from "../../src/services/realtimeOrchestrator";

type Emitted = { event: string; payload: unknown };

function fakeIo(): { io: Server; emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  const io = {
    to: () => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ event, payload });
      },
    }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
  } as unknown as Server;
  return { io, emitted };
}

// audio_sources.id est un uuid : c'est ce que porte chaque manche.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Comme au lancement : toutes les manches preparees d'un coup, liens de 15 min.
function launchTracks(count: number): RoundTrack[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    audioSourceId: uuid(100 + i),
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: linkValidUntil(now + LINK_LIFE_MS, `lancement-${i + 1}`),
  }));
}

type RoundStart = { round: number; track: RoundTrack; timing: { startAt: number } };
type StateFrame = { phase: string; currentRound: number; currentTrack: RoundTrack | null };

/** Le lien que les joueurs ont en main pour chaque manche, au moment ou elle commence. */
function linkAtStart(emitted: Emitted[], round: number): string | null {
  // Le dernier etat diffuse pour cette manche (un lien rafraichi en cours de route le remplace).
  const frames = emitted
    .filter(e => e.event === "game:state")
    .map(e => e.payload as StateFrame)
    .filter(s => s.phase === "GUESSING" && s.currentRound === round);
  return frames.length ? frames[frames.length - 1].currentTrack?.previewUrl ?? null : null;
}

const ROUND_MS = 40_000; // 20 manches de 40 s + reveal : plus de 15 min
let roomSeq = 0;
let room = "";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-11-12T21:34:00Z"));
  hydratePreviewOutcome.mockReset().mockImplementation(freshLink);
  room = `T35R${++roomSeq}`;
});

afterEach(() => {
  clearRevealTimer(room);
  clearPacingTimer(room);
  clearGraceTimer(room);
  clearGame(room);
  jest.useRealTimers();
});

function launch(io: Server, tracks: RoundTrack[]): void {
  bootstrapGameState({
    roomCode: room,
    hostUserId: 1,
    tracks,
    participants: [1, 2].map(id => ({ userId: id, username: `P${id}` })),
    mode: "friends",
    config: { roundDurationMs: ROUND_MS },
    sessionId: 1,
  });
  startRoundAndBroadcast(io, room);
}

describe("T35 : un lien valable au debut de chaque manche", () => {
  it("une partie de 20 manches qui depasse 15 min n'a aucune manche au lien expire", async () => {
    const { io, emitted } = fakeIo();
    launch(io, launchTracks(20));
    // La partie avance seule : chrono de manche, puis filet anti-AFK (10 s).
    for (let i = 0; i < 20 * 60 && getGameState(room)?.phase !== "FINISHED"; i++) {
      await jest.advanceTimersByTimeAsync(1_000);
    }
    expect(getGameState(room)?.phase).toBe("FINISHED");
    // La partie a bien depasse la duree de vie d'un lien.
    expect(Date.now() - new Date("2026-11-12T21:34:00Z").getTime()).toBeGreaterThan(LINK_LIFE_MS);
    const muted: number[] = [];
    for (let round = 1; round <= 20; round++) {
      const start = emitted.find(e => e.event === "game:round:start" && (e.payload as RoundStart).round === round)?.payload as RoundStart;
      const expiresAt = previewExpiresAt(linkAtStart(emitted, round)) ?? 0;
      // Valable pendant toute la manche, a son heure de debut.
      if (expiresAt < start.timing.startAt + ROUND_MS) muted.push(round);
    }
    expect(muted).toEqual([]);
  });

  it("un lien deja vieux au lancement (cache) est rafraichi des la manche 1", async () => {
    const { io, emitted } = fakeIo();
    const tracks = launchTracks(3);
    // Session 823 : un lien qui expirait 3 min apres le lancement.
    tracks[0].previewUrl = linkValidUntil(Date.now() + 3 * 60_000, "vieux-1");
    launch(io, tracks);
    await jest.advanceTimersByTimeAsync(0);
    const link = linkAtStart(emitted, 1);
    expect(link).toContain(`neuf-${uuid(100)}`);
    expect(isExpiredPreview(link, 10 * 60_000)).toBe(false);
  });

  it("apres une longue pause, la reprise rafraichit la manche en cours et les suivantes", async () => {
    const { io, emitted } = fakeIo();
    launch(io, launchTracks(5));
    await jest.advanceTimersByTimeAsync(2_000);
    pauseGame(room);
    await jest.advanceTimersByTimeAsync(20 * 60_000);
    resumeGame(room);
    hydratePreviewOutcome.mockClear();
    await refreshRoundPreviews(io, room);
    expect(hydratePreviewOutcome).toHaveBeenCalledTimes(3); // manche 1 en cours, 2 et 3
    expect(isExpiredPreview(linkAtStart(emitted, 1), ROUND_MS)).toBe(false);
  });

  it("un lien encore frais ne coute aucune recherche", async () => {
    const { io } = fakeIo();
    launch(io, launchTracks(5));
    await jest.advanceTimersByTimeAsync(0);
    expect(hydratePreviewOutcome).not.toHaveBeenCalled();
  });

  it("une recherche qui echoue laisse la manche partir avec son lien", async () => {
    hydratePreviewOutcome.mockImplementation(async () => ({ url: null, failed: true }));
    const { io } = fakeIo();
    const tracks = launchTracks(3);
    const old = linkValidUntil(Date.now() + 60_000 * 2, "vieux-1");
    tracks[0].previewUrl = old;
    launch(io, tracks);
    await jest.advanceTimersByTimeAsync(0);
    expect(getGameState(room)?.phase).toBe("GUESSING");
    expect(getGameState(room)?.currentTrack?.previewUrl).toBe(old);
  });
});
