/**
 * T35 en mode streamer : c'est l'hote qui lance chaque manche, une partie
 * depasse souvent les ~15 min de vie d'un lien Deezer. Le lien que l'overlay
 * recoit doit etre valable quand la manche demarre. Horloge factice, Deezer
 * remplace (roundPreviews.freshPreview).
 */
jest.mock("../../src/services/gamePersistence", () => ({
  markMultiplayerRoomFinished: jest.fn(async () => undefined),
  markStreamerSessionFinished: jest.fn(async () => undefined),
}));

const LINK_LIFE_MS = 15 * 60_000;
const linkValidUntil = (ms: number, tag: string) =>
  `https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/${tag}.mp3?hdnea=exp=${Math.floor(ms / 1000)}~hmac=x`;

const freshPreview = jest.fn(async (id: string | number | null | undefined) => linkValidUntil(Date.now() + LINK_LIFE_MS, `neuf-${id}`));
jest.mock("../../src/services/roundPreviews", () => ({
  ...jest.requireActual("../../src/services/roundPreviews"),
  freshPreview: (id: string | number | null | undefined) => freshPreview(id),
}));

import type { Server as IOServer } from "socket.io";
import type { StreamerRound, StreamerState } from "../../src/types/streamer";
import {
  START_COUNTDOWN_MS,
  bootstrapStreamerGame,
  clearAllStreamerGamesForTests,
  getStreamerState,
  startNextStreamerRound,
} from "../../src/services/streamerGame";
import { mediaRoom } from "../../src/services/streamerChannels";
import { previewExpiresAt } from "../../src/utils/previewExpiry";

const ROOM = "STRT35";

type Sent = { to: string[]; event: string; payload: unknown };

function fakeIo() {
  const sent: Sent[] = [];
  const chain = (to: string[]) => ({
    to: (r: string) => chain([...to, r]),
    except: () => chain(to),
    emit: (event: string, payload: unknown) => {
      sent.push({ to, event, payload });
      return true;
    },
  });
  const io = { to: (r: string) => chain([r]), in: () => ({ disconnectSockets: () => undefined }) } as unknown as IOServer;
  return { io, sent };
}

function rounds(count: number): StreamerRound[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `deezer-${i + 1}`,
    audioSourceId: `00000000-0000-4000-8000-${String(200 + i).padStart(12, "0")}`,
    title: `Chanson ${i + 1}`,
    artist: "Les Testeurs",
    previewUrl: linkValidUntil(now + LINK_LIFE_MS, `lancement-${i + 1}`),
    trackSource: "streamer",
  }));
}

/** Le dernier lien envoye a l'overlay (room media) pour cette manche. */
function overlayLink(sent: Sent[], round: number): string | null {
  const frames = sent
    .filter(s => s.to.includes(mediaRoom(ROOM)) && s.event === "state:sync")
    .map(s => s.payload as StreamerState)
    .filter(st => st.currentRound === round);
  return frames.length ? frames[frames.length - 1].currentTrack?.previewUrl ?? null : null;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-11-12T21:00:00Z"));
  freshPreview.mockClear();
});

afterEach(() => {
  clearAllStreamerGamesForTests();
  jest.useRealTimers();
});

describe("T35 streamer : un lien valable au debut de chaque manche", () => {
  it("la manche lancee 20 min apres le debut part avec un lien neuf", async () => {
    const { io, sent } = fakeIo();
    bootstrapStreamerGame({ roomCode: ROOM, hostUserId: 1, rounds: rounds(3), subMode: "solo", sessionId: 1 });
    // L'hote discute avec son chat 20 min avant de lancer.
    await jest.advanceTimersByTimeAsync(20 * 60_000);
    startNextStreamerRound(io, ROOM);
    await jest.advanceTimersByTimeAsync(0);
    const link = overlayLink(sent, 1);
    expect(link).toContain("neuf-00000000-0000-4000-8000-000000000200");
    // Le son part apres le decompte : le lien tient toute la manche.
    expect(previewExpiresAt(link)).toBeGreaterThan(Date.now() + START_COUNTDOWN_MS + 60_000);
    expect(getStreamerState(ROOM)?.currentTrack?.previewUrl).toBe(link);
  });

  it("un lien encore frais ne coute aucune recherche", async () => {
    const { io } = fakeIo();
    bootstrapStreamerGame({ roomCode: ROOM, hostUserId: 1, rounds: rounds(3), subMode: "solo", sessionId: 1 });
    startNextStreamerRound(io, ROOM);
    await jest.advanceTimersByTimeAsync(0);
    expect(freshPreview).not.toHaveBeenCalled();
  });
});
