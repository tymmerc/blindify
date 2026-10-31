// Chat Twitch dans la partie (T5b) : seules les reponses `!b` comptent,
// pendant la phase du public, une par pseudo Twitch et par manche, avec la
// moitie du bareme et l'anti-spoiler. La page viewer garde son bareme plein.

jest.mock("../../src/services/gamePersistence", () => ({
  markMultiplayerRoomFinished: jest.fn(async () => undefined),
  markStreamerSessionFinished: jest.fn(async () => undefined),
}));

import type { Server as IOServer } from "socket.io";
import type { StreamerRound } from "../../src/types/streamer";
import {
  CHAT_GUESS_DURATION,
  START_COUNTDOWN_MS,
  bootstrapStreamerGame,
  clearAllStreamerGamesForTests,
  endStreamerGame,
  getStreamerState,
  recordViewerAnswer,
  startNextStreamerRound,
} from "../../src/services/streamerGame";
import { getViewer, joinViewer, rankedViewers } from "../../src/services/streamerViewers";
import { CHAT_SPOILER_DECAY_MS, chatFactor } from "../../src/services/streamerScoring";
import { handleChatLine, setTwitchOpenerForTests, startTwitch, stopAllTwitchForTests, twitchChannelOf } from "../../src/services/streamerTwitch";
import type { ReaderOptions } from "../../src/services/twitchReader";

const ROOM = "TWCH01";
const chain = () => ({ to: () => chain(), except: () => chain(), emit: () => true });
const io = { to: () => chain() } as unknown as IOServer;

const track: StreamerRound = {
  round: 1,
  trackId: "t1",
  title: "Chocolat",
  artist: "Naza",
  previewUrl: "https://extraits.test/1.mp3",
  trackSource: "streamer",
};

const say = (login: string, text: string, at?: number) =>
  handleChatLine(io, ROOM, { channel: "tymmerc", login, displayName: login, text }, at);

function openChat() {
  bootstrapStreamerGame({ roomCode: ROOM, hostUserId: 1, rounds: [track, { ...track, round: 2 }], subMode: "viewers_only" });
  startNextStreamerRound(io, ROOM);
  jest.advanceTimersByTime(START_COUNTDOWN_MS);
  return Date.now();
}

const byPseudo = (pseudo: string, source = "chat") => rankedViewers(ROOM).find(v => v.pseudo === pseudo && v.source === source);

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  stopAllTwitchForTests();
  setTwitchOpenerForTests(null);
  clearAllStreamerGamesForTests();
  jest.useRealTimers();
});

describe("anti-spoiler du chat", () => {
  it("moitie du bareme, puis fond en quelques secondes apres la premiere bonne reponse", () => {
    expect(chatFactor(1_000, null)).toBe(0.5);
    expect(chatFactor(1_000, 1_000)).toBe(0.5);
    expect(chatFactor(1_000 + CHAT_SPOILER_DECAY_MS / 2, 1_000)).toBe(0.25);
    expect(chatFactor(1_000 + CHAT_SPOILER_DECAY_MS * 10, 1_000)).toBeCloseTo(0.05);
  });
});

describe("reponses du chat dans la partie", () => {
  it("seulement `!b`, seulement pendant la phase du public, une par pseudo et par manche", () => {
    say("lena", "!b chocolat - naza");
    expect(byPseudo("lena")).toBeUndefined();
    const t0 = openChat();
    say("lena", "chocolat naza", t0);
    say("lena", "!b chocolat - naza", t0);
    say("lena", "!b autre - chose", t0 + 100);
    expect(getStreamerState(ROOM)?.answersCount).toBe(1);
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(byPseudo("lena")?.score).toBe(15);
    // Manche finie : la reponse n'est plus lue.
    say("lena", "!b chocolat - naza");
    expect(getStreamerState(ROOM)?.answersCount).toBe(1);
    expect(byPseudo("lena")?.score).toBe(15);
  });

  it("la page garde le plein bareme ; le chat recopie apres la premiere bonne reponse ne rapporte presque rien", () => {
    const t0 = openChat();
    const page = joinViewer(ROOM, { pseudo: "Page" });
    if (!page.ok) throw new Error("join");
    // Reponse de la page, par le meme chemin que live:guess.
    recordViewerAnswer(io, ROOM, page.viewer.id, { title: "chocolat", artist: "naza" }, t0);
    say("premier", "!b chocolat - naza", t0);
    say("copieur", "!b chocolat - naza", t0 + CHAT_SPOILER_DECAY_MS);
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(getViewer(ROOM, page.viewer.id)?.score).toBe(30);
    expect(byPseudo("premier")?.score).toBe(15);
    expect(byPseudo("copieur")?.score).toBeLessThanOrEqual(2);
  });

  it("un pseudo Twitch identique a un pseudo de la page reste une fiche a part", () => {
    const t0 = openChat();
    const page = joinViewer(ROOM, { pseudo: "Lena" });
    if (!page.ok) throw new Error("join");
    say("lena", "!b chocolat - naza", t0);
    const lenas = rankedViewers(ROOM).filter(v => v.pseudo.toLowerCase() === "lena");
    expect(lenas.map(v => v.source).sort()).toEqual(["chat", "page"]);
  });

  it("le classement marque la source « chat »", () => {
    const t0 = openChat();
    say("zoe", "!b chocolat - naza", t0);
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(getStreamerState(ROOM)?.leaderboard?.[0]).toMatchObject({ pseudo: "zoe", source: "chat" });
  });
});

describe("cycle de vie du lecteur", () => {
  it("ouvert avec la partie, ferme a sa fin", () => {
    const close = jest.fn();
    let opts: ReaderOptions | null = null;
    setTwitchOpenerForTests(o => {
      opts = o;
      return { channel: o.channel, close };
    });
    openChat();
    startTwitch(io, ROOM, "tymmerc");
    expect(twitchChannelOf(ROOM)).toBe("tymmerc");
    (opts as ReaderOptions | null)?.onLine({ channel: "tymmerc", login: "lena", displayName: "Lena", text: "!b chocolat - naza" });
    expect(getStreamerState(ROOM)?.answersCount).toBe(1);
    endStreamerGame(io, ROOM);
    expect(close).toHaveBeenCalledTimes(1);
    expect(twitchChannelOf(ROOM)).toBeNull();
  });
});
