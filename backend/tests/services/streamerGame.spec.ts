// Mode streamer (T5) : phases, reponses des viewers, classement, et ce que
// chaque public recoit. Aucune base : la fin de partie est simulee.

jest.mock("../../src/services/gamePersistence", () => ({
  markMultiplayerRoomFinished: jest.fn(async () => undefined),
  markStreamerSessionFinished: jest.fn(async () => undefined),
}));

import type { Server as IOServer } from "socket.io";
import type { StreamerRound, StreamerState, StreamerSubMode } from "../../src/types/streamer";
import {
  CHAT_GUESS_DURATION,
  START_COUNTDOWN_MS,
  STREAMER_GUESS_DURATION,
  IDLE_MS,
  activeStreamerGames,
  armStreamerIdle,
  bootstrapStreamerGame,
  clearAllStreamerGamesForTests,
  endStreamerGame,
  getStreamerState,
  hostBack,
  hostLeft,
  kickViewer,
  recordStreamerGuess,
  recordViewerAnswer,
  startNextStreamerRound,
} from "../../src/services/streamerGame";
import { joinViewer, getViewer } from "../../src/services/streamerViewers";
import { mediaRoom, viewersRoom } from "../../src/services/streamerChannels";
import { markStreamerSessionFinished } from "../../src/services/gamePersistence";

const ROOM = "STRM01";
const HOST = 1;

type Sent = { to: string[]; except: string[]; event: string; payload: unknown };

function fakeIo() {
  const sent: Sent[] = [];
  const chain = (to: string[], except: string[]) => ({
    to: (r: string) => chain([...to, r], except),
    except: (r: string) => chain(to, [...except, r]),
    emit: (event: string, payload: unknown) => {
      sent.push({ to, except, event, payload });
      return true;
    },
  });
  const io = { to: (r: string) => chain([r], []), in: () => ({ disconnectSockets: () => undefined }) } as unknown as IOServer;
  return { io, sent };
}

const track = (round: number): StreamerRound => ({
  round,
  trackId: `deezer-${round}`,
  audioSourceId: `src-${round}`,
  title: `Chanson ${round}`,
  artist: "Les Testeurs",
  album: "Album",
  previewUrl: `https://extraits.test/${round}.mp3`,
  albumCover: `https://pochettes.test/${round}.jpg`,
  metadata: { owner_user_id: HOST },
  trackSource: "streamer",
});

function setup(subMode: StreamerSubMode = "viewers_only", rounds = 2) {
  const { io, sent } = fakeIo();
  bootstrapStreamerGame({ roomCode: ROOM, hostUserId: HOST, rounds: Array.from({ length: rounds }, (_, i) => track(i + 1)), subMode, sessionId: 42 });
  return { io, sent };
}

function viewer(pseudo: string): string {
  const r = joinViewer(ROOM, { pseudo });
  if (!r.ok) throw new Error(r.code);
  return r.viewer.id;
}

const phase = () => getStreamerState(ROOM)?.phase;
const toMedia = (s: Sent) => s.to.includes(mediaRoom(ROOM));
const toPublic = (s: Sent) => s.to.includes(viewersRoom(ROOM));

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  clearAllStreamerGamesForTests();
  jest.useRealTimers();
});

describe("phases", () => {
  it("viewers_only : compte a rebours, reponses du public, reveal, manche suivante, fin", () => {
    const { io } = setup("viewers_only", 2);
    startNextStreamerRound(io, ROOM);
    expect(phase()).toBe("STARTING_ROUND");
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    expect(phase()).toBe("GUESSING_CHAT");
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(phase()).toBe("ROUND_ENDED");
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS + CHAT_GUESS_DURATION);
    expect(phase()).toBe("GAME_OVER");
    expect(markStreamerSessionFinished).toHaveBeenCalledWith(42, 2);
  });

  it("duo : le public, puis le streamer, qui gagne la manche s'il trouve", () => {
    const { io } = setup("duo", 2);
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS + CHAT_GUESS_DURATION);
    expect(phase()).toBe("GUESSING_STREAMER");
    recordStreamerGuess(io, ROOM, HOST, { title: "chanson 1", artist: "les testeurs" });
    const state = getStreamerState(ROOM) as StreamerState;
    expect(state.phase).toBe("ROUND_ENDED");
    expect(state.streamerWins).toBe(1);
    expect(state.chatWins).toBe(0);
  });

  it("duo : le streamer rate, la manche va au chat seulement si le chat a trouve", () => {
    const { io } = setup("duo", 2);
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS + CHAT_GUESS_DURATION + STREAMER_GUESS_DURATION);
    expect(getStreamerState(ROOM)).toMatchObject({ chatWins: 0, streamerWins: 0 });
    const v = viewer("Lena");
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    recordViewerAnswer(io, ROOM, v, { title: "chanson 2" });
    jest.advanceTimersByTime(CHAT_GUESS_DURATION + STREAMER_GUESS_DURATION);
    expect(getStreamerState(ROOM)).toMatchObject({ chatWins: 1, streamerWins: 0 });
  });

  it("solo : pas de phase du public, et un viewer ne peut pas repondre", () => {
    const { io } = setup("solo", 1);
    const v = viewer("Lena");
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    expect(phase()).toBe("GUESSING_STREAMER");
    expect(recordViewerAnswer(io, ROOM, v, { title: "chanson 1" })).toBe("ferme");
  });

  it("seul l'hote repond pour le streamer", () => {
    const { io } = setup("solo", 1);
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    recordStreamerGuess(io, ROOM, 99, { title: "chanson 1", artist: "les testeurs" });
    expect(phase()).toBe("GUESSING_STREAMER");
  });

  it("« Finir » donne le podium tout de suite", () => {
    const { io } = setup("viewers_only", 5);
    startNextStreamerRound(io, ROOM);
    endStreamerGame(io, ROOM);
    expect(phase()).toBe("GAME_OVER");
    expect(activeStreamerGames()).toEqual([]);
  });

  it("« Finir » en pleine manche : le podium sort, pas la reponse", () => {
    const { io, sent } = setup("duo", 5);
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS + 1_000);
    endStreamerGame(io, ROOM);
    const over = sent.filter(s => (s.payload as StreamerState)?.phase === "GAME_OVER");
    expect(over.length).toBe(2);
    for (const f of over) {
      expect((f.payload as StreamerState).currentTrack).toBeNull();
      expect(JSON.stringify(f.payload)).not.toContain("Chanson 1");
    }
  });

  it("partie laissee en plan (lobby, entre deux manches) : finie apres 30 minutes", () => {
    const { io } = setup("viewers_only", 5);
    armStreamerIdle(io, ROOM);
    jest.advanceTimersByTime(IDLE_MS);
    expect(phase()).toBe("GAME_OVER");
    clearAllStreamerGamesForTests();
    const again = setup("viewers_only", 5);
    startNextStreamerRound(again.io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS + CHAT_GUESS_DURATION);
    expect(phase()).toBe("ROUND_ENDED");
    jest.advanceTimersByTime(IDLE_MS - 1);
    expect(phase()).toBe("ROUND_ENDED");
    jest.advanceTimersByTime(1);
    expect(phase()).toBe("GAME_OVER");
  });

  it("l'hote coupe : la partie l'attend, puis finit s'il ne revient pas", () => {
    const { io } = setup("viewers_only", 5);
    startNextStreamerRound(io, ROOM);
    hostLeft(io, ROOM, 60_000);
    jest.advanceTimersByTime(START_COUNTDOWN_MS + 1_000);
    hostBack(ROOM);
    jest.advanceTimersByTime(60_000);
    expect(phase()).not.toBe("GAME_OVER");
    hostLeft(io, ROOM, 60_000);
    jest.advanceTimersByTime(60_000);
    expect(phase()).toBe("GAME_OVER");
  });
});

describe("reponses et classement des viewers", () => {
  function chatOpen(rounds = 2) {
    const ctx = setup("viewers_only", rounds);
    startNextStreamerRound(ctx.io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    return ctx;
  }

  it("une reponse par manche, seulement pendant la phase du public", () => {
    const { io } = setup("viewers_only", 2);
    const v = viewer("Lena");
    startNextStreamerRound(io, ROOM);
    expect(recordViewerAnswer(io, ROOM, v, { title: "x" })).toBe("ferme");
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    expect(recordViewerAnswer(io, ROOM, v, { title: "", artist: "" })).toBe("vide");
    expect(recordViewerAnswer(io, ROOM, v, { title: "chanson 1" })).toBe("ok");
    expect(recordViewerAnswer(io, ROOM, v, { title: "chanson 1", artist: "les testeurs" })).toBe("deja");
    expect(recordViewerAnswer(io, ROOM, "inconnu", { title: "x" })).toBe("inconnu");
    expect(getStreamerState(ROOM)?.answersCount).toBe(1);
  });

  it("titre + artiste + rapidite, et le plus rapide passe devant", () => {
    const { io } = chatOpen();
    const fast = viewer("Rapide");
    const slow = viewer("Lent");
    const half = viewer("Moitie");
    const wrong = viewer("Faux");
    const open = Date.now();
    recordViewerAnswer(io, ROOM, fast, { title: "chanson 1", artist: "les testeurs" }, open);
    recordViewerAnswer(io, ROOM, slow, { title: "chanson 1", artist: "les testeurs" }, open + CHAT_GUESS_DURATION / 2);
    recordViewerAnswer(io, ROOM, half, { title: "chanson 1" }, open);
    recordViewerAnswer(io, ROOM, wrong, { title: "autre chose" }, open);
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(getViewer(ROOM, fast)?.score).toBe(30);
    expect(getViewer(ROOM, slow)?.score).toBe(25);
    expect(getViewer(ROOM, half)?.score).toBe(20);
    expect(getViewer(ROOM, wrong)?.score).toBe(0);
    const board = getStreamerState(ROOM)?.leaderboard ?? [];
    expect(board.map(e => e.pseudo)).toEqual(["Rapide", "Lent", "Moitie"]);
    expect(getStreamerState(ROOM)?.chatSnapshot).toEqual({ total: 4, correct: 3, percentCorrect: 75 });
  });

  it("en duo, les points des viewers ne sortent qu'au reveal final", () => {
    const { io } = setup("duo", 2);
    const v = viewer("Lena");
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    recordViewerAnswer(io, ROOM, v, { title: "chanson 1", artist: "les testeurs" });
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(phase()).toBe("GUESSING_STREAMER");
    expect(getViewer(ROOM, v)?.score).toBe(0);
    expect(getStreamerState(ROOM)?.chatSnapshot?.percentCorrect).toBe(100);
    jest.advanceTimersByTime(STREAMER_GUESS_DURATION);
    expect(getViewer(ROOM, v)?.score).toBeGreaterThan(20);
  });

  it("chaque viewer qui a repondu recoit son resultat, a lui seul", () => {
    const { io, sent } = chatOpen();
    const v = viewer("Lena");
    recordViewerAnswer(io, ROOM, v, { title: "chanson 1", artist: "les testeurs" });
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    const results = sent.filter(s => s.event === "live:result");
    expect(results).toHaveLength(1);
    expect(results[0].to).toEqual([`stream:viewer:${ROOM}:${v}`]);
    expect(results[0].payload).toMatchObject({ round: 1, verdict: "correct", rank: 1 });
  });

  it("l'hote et l'overlay voient le nombre de reponses et les pseudos, jamais le texte", () => {
    const { io, sent } = chatOpen();
    const v = viewer("Lena");
    recordViewerAnswer(io, ROOM, v, { title: "mon secret", artist: "personne" });
    jest.advanceTimersByTime(600);
    const answers = sent.filter(s => s.event === "streamer:answers");
    expect(answers).toHaveLength(1);
    expect(answers[0].to).toEqual([mediaRoom(ROOM)]);
    expect(answers[0].payload).toEqual({ roomCode: ROOM, round: 1, count: 1, names: ["Lena"], viewers: [{ id: v, pseudo: "Lena" }] });
    expect(JSON.stringify(answers[0].payload)).not.toContain("secret");
  });

  it("une nouvelle partie remet les scores a zero mais garde les inscrits", () => {
    const { io } = chatOpen(1);
    const v = viewer("Lena");
    recordViewerAnswer(io, ROOM, v, { title: "chanson 1", artist: "les testeurs" });
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(getViewer(ROOM, v)?.score).toBeGreaterThan(0);
    bootstrapStreamerGame({ roomCode: ROOM, hostUserId: HOST, rounds: [track(1)], subMode: "viewers_only" });
    expect(getViewer(ROOM, v)?.score).toBe(0);
  });
});

describe("exclure un viewer", () => {
  it("il quitte la manche et le classement, son socket est coupe, il ne revient pas", () => {
    const { io, sent } = setup("viewers_only", 2);
    const bad = joinViewer(ROOM, { pseudo: "Vilain" });
    const good = viewer("Lena");
    if (!bad.ok) throw new Error("join");
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    recordViewerAnswer(io, ROOM, bad.viewer.id, { title: "chanson 1", artist: "les testeurs" });
    recordViewerAnswer(io, ROOM, good, { title: "chanson 1", artist: "les testeurs" });
    expect(kickViewer(io, ROOM, bad.viewer.id)).toBe(true);
    expect(getStreamerState(ROOM)?.answersCount).toBe(1);
    expect(sent.some(f => f.event === "live:error" && f.to[0] === `stream:viewer:${ROOM}:${bad.viewer.id}`)).toBe(true);
    jest.advanceTimersByTime(CHAT_GUESS_DURATION);
    expect(getStreamerState(ROOM)?.leaderboard?.map(e => e.pseudo)).toEqual(["Lena"]);
    expect(joinViewer(ROOM, { pseudo: "x", key: bad.viewer.key })).toEqual({ ok: false, code: "exclu" });
    expect(joinViewer(ROOM, { pseudo: "Vilain" })).toEqual({ ok: false, code: "exclu" });
    expect(kickViewer(io, ROOM, "inconnu")).toBe(false);
  });
});

describe("anti-triche : ce que recoit chaque public", () => {
  function playRound(subMode: StreamerSubMode) {
    const ctx = setup(subMode, 1);
    startNextStreamerRound(ctx.io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS + CHAT_GUESS_DURATION + STREAMER_GUESS_DURATION);
    return ctx;
  }

  it.each(["viewers_only", "duo", "solo"] as const)("%s : jamais d'extrait vers le public, aucune phase", subMode => {
    const { sent } = playRound(subMode);
    const publicFrames = sent.filter(toPublic);
    expect(publicFrames.length).toBeGreaterThan(3);
    for (const f of publicFrames) {
      expect(f.except).toContain(mediaRoom(ROOM));
      const text = JSON.stringify(f.payload);
      expect(text).not.toContain("extraits.test");
      expect(text).not.toContain("deezer-1");
      expect(text).not.toContain("src-1");
    }
  });

  it.each(["viewers_only", "duo", "solo"] as const)("%s : pas de titre avant le reveal final, pour personne", subMode => {
    const { sent } = playRound(subMode);
    for (const f of sent) {
      const state = f.payload as StreamerState;
      if (!state || typeof state !== "object" || !("phase" in state)) continue;
      const hidden = ["STARTING_ROUND", "GUESSING_CHAT", "REVEAL_PARTIAL", "GUESSING_STREAMER"].includes(state.phase);
      if (hidden) {
        expect(JSON.stringify(state)).not.toContain("Chanson 1");
        expect(JSON.stringify(state)).not.toContain("pochettes.test");
      }
    }
  });

  it("l'hote et l'overlay recoivent l'extrait pendant la manche", () => {
    const { io, sent } = setup("viewers_only", 1);
    startNextStreamerRound(io, ROOM);
    jest.advanceTimersByTime(START_COUNTDOWN_MS);
    const guessing = sent.filter(s => toMedia(s) && (s.payload as StreamerState)?.phase === "GUESSING_CHAT");
    expect(guessing.length).toBeGreaterThan(0);
    expect((guessing[0].payload as StreamerState).currentTrack?.previewUrl).toBe("https://extraits.test/1.mp3");
  });

  it("le public ne recoit pas l'id du compte de l'hote", () => {
    const { sent } = playRound("viewers_only");
    for (const f of sent.filter(toPublic)) expect((f.payload as StreamerState).hostUserId).toBe(0);
  });

  it("au reveal, le public voit titre, artiste et pochette", () => {
    const { sent } = playRound("viewers_only");
    const reveal = sent.find(s => toPublic(s) && s.event === "round:reveal:final");
    const t = (reveal?.payload as StreamerState).currentTrack;
    expect(t).toMatchObject({ title: "Chanson 1", artist: "Les Testeurs", albumCover: "https://pochettes.test/1.jpg", previewUrl: null, metadata: null });
  });
});
