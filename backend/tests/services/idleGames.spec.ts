/**
 * Le filet des parties fantomes (T22), avec les vrais minuteurs de partie
 * (horloge factice) et un faux serveur socket.io.
 *
 * Partie 829 du 14/11 : la table est partie ouvrir une autre salle, et
 * l'ancienne a revele 12 manches pour personne. Ici : plus aucun joueur, la
 * partie se fige sans bruler de manche, reprend si quelqu'un revient, et
 * s'arrete (chemin de T42) si personne ne revient.
 */
import type { Server } from "socket.io";

jest.mock("../../src/services/gamePersistence", () => ({
  persistGameResults: jest.fn(async () => undefined),
  persistRoundResponses: jest.fn(async () => undefined),
}));

import {
  EMPTY_PAUSE_MS,
  IDLE_STOP_MS,
  SILENT_ROUNDS_BEFORE_PAUSE,
  bootstrapGameState,
  clearGame,
  forgetRoomAbsence,
  getGameState,
  markDisconnected,
  markPresent,
  markReconnected,
  recordAnswer,
  type RoundTrack,
} from "../../src/services/realtimeGame";
import {
  clearGraceTimer,
  clearPacingTimer,
  clearRevealTimer,
  rescheduleAfterResume,
  startRoundAndBroadcast,
} from "../../src/services/realtimeOrchestrator";
import { checkIdleGame, setIdleStopper, sweepIdleGames } from "../../src/services/idleGames";
import { ROUND_PACING } from "../../src/services/roundPacing";

type Emitted = { event: string; payload: unknown };

/** Faux serveur : `inRoom` = les joueurs qui ont un socket dans la salle. */
function fakeIo(inRoom: Set<number>): { io: Server; emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  const io = {
    to: () => ({ emit: (event: string, payload: unknown) => emitted.push({ event, payload }) }),
    sockets: {
      adapter: { rooms: { get: () => new Set([...inRoom].map(id => `s${id}`)) } },
      sockets: { get: (sid: string) => ({ data: { auth: { user: { id: Number(sid.slice(1)) } } } }) },
    },
  } as unknown as Server;
  return { io, emitted };
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

const ROUND_MS = 30_000;
const PREROLL_MS = ROUND_PACING.countdownMs;
const REVEAL_MS = ROUND_PACING.answerMs + ROUND_PACING.scoresMs;
let seq = 0;
let room = "";

function launch(io: Server, opts: { mode?: string; players?: number[] } = {}): void {
  bootstrapGameState({
    roomCode: room,
    hostUserId: 1,
    tracks: makeTracks(10),
    participants: (opts.players ?? [1, 2]).map(id => ({ userId: id, username: `P${id}` })),
    mode: opts.mode ?? "friends",
    config: { roundDurationMs: ROUND_MS },
    sessionId: 829,
  });
  startRoundAndBroadcast(io, room);
}

const stopper = jest.fn(async () => true);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  room = `IDLE_${++seq}`;
  stopper.mockClear();
  setIdleStopper(stopper);
});

afterEach(() => {
  clearRevealTimer(room);
  clearPacingTimer(room);
  clearGraceTimer(room);
  clearGame(room);
  forgetRoomAbsence(room, [1, 2, 3]);
  setIdleStopper(null);
  jest.useRealTimers();
});

const reveals = (emitted: Emitted[]) => emitted.filter(e => e.event === "game:round:reveal").length;

describe("tout le monde part en pleine partie", () => {
  it("la partie se fige sans bruler de manche, puis s'arrete toute seule", () => {
    const inRoom = new Set([1, 2]);
    const { io, emitted } = fakeIo(inRoom);
    launch(io);
    // Les deux joueurs s'en vont (« Quitter », onglet ferme).
    for (const id of [1, 2]) {
      markDisconnected(room, id);
      inRoom.delete(id);
    }
    expect(checkIdleGame(io, room)).toBe("none");
    jest.advanceTimersByTime(EMPTY_PAUSE_MS);
    expect(checkIdleGame(io, room)).toBe("pause");
    expect(getGameState(room)?.paused).toBe(true);
    // Le minuteur de manche est coupe : plus rien ne se revele, meme bien plus tard.
    jest.advanceTimersByTime(IDLE_STOP_MS - 1);
    expect(reveals(emitted)).toBe(0);
    expect(getGameState(room)?.currentRound).toBe(1);
    expect(checkIdleGame(io, room)).toBe("none");
    expect(stopper).not.toHaveBeenCalled();

    const state = getGameState(room)!;
    jest.advanceTimersByTime(1);
    expect(checkIdleGame(io, room)).toBe("stop");
    expect(stopper).toHaveBeenCalledWith(room, state);
  });

  it("un joueur revient : la manche reprend ou elle en etait et se revele a son heure", () => {
    const inRoom = new Set([1, 2]);
    const { io, emitted } = fakeIo(inRoom);
    launch(io);
    const leftAtStart = getGameState(room)!.timing.revealAt! - Date.now();
    for (const id of [1, 2]) {
      markDisconnected(room, id);
      inRoom.delete(id);
    }
    checkIdleGame(io, room);
    jest.advanceTimersByTime(EMPTY_PAUSE_MS);
    expect(checkIdleGame(io, room)).toBe("pause");
    jest.advanceTimersByTime(60_000);

    // room:join : socket de retour, drapeau leve, puis le filet est consulte.
    markReconnected(room, 2);
    inRoom.add(2);
    expect(checkIdleGame(io, room)).toBe("resume");
    expect(getGameState(room)?.paused).toBe(false);
    // Le temps de la veille ne compte pas : il reste ce qu'il restait a la pause.
    const left = getGameState(room)!.timing.revealAt! - Date.now();
    expect(left).toBe(leftAtStart - EMPTY_PAUSE_MS);
    jest.advanceTimersByTime(left + 50);
    expect(reveals(emitted)).toBe(1);
    expect(stopper).not.toHaveBeenCalled();
  });

  it("le filet regarde toutes les parties en memoire", () => {
    const inRoom = new Set<number>();
    const { io } = fakeIo(inRoom);
    launch(io);
    const t0 = Date.now();
    sweepIdleGames(io, t0);
    sweepIdleGames(io, t0 + EMPTY_PAUSE_MS);
    expect(getGameState(room)?.idle?.reason).toBe("empty");
  });
});

describe("deux joueurs s'en vont en pleine partie, un reste", () => {
  it("la partie continue pour celui qui reste, les partis passent absents", () => {
    const inRoom = new Set([1, 2, 3]);
    const { io } = fakeIo(inRoom);
    launch(io, { players: [1, 2, 3] });
    for (const id of [2, 3]) {
      markDisconnected(room, id);
      inRoom.delete(id);
    }
    for (let round = 1; round <= 3; round++) {
      expect(checkIdleGame(io, room, Date.now() + EMPTY_PAUSE_MS * 2)).toBe("none");
      // Il repond seul : la manche se revele tout de suite (les partis ne la retiennent pas).
      jest.advanceTimersByTime(PREROLL_MS);
      recordAnswer(room, 1, "Song");
      jest.advanceTimersByTime(ROUND_MS + REVEAL_MS + 50);
    }
    const state = getGameState(room)!;
    expect(state.paused).toBeFalsy();
    expect(state.currentRound).toBe(4);
    expect(state.players[2].absent).toBe(true);
    expect(state.players[3].absent).toBe(true);
    expect(state.players[1].absent).toBeFalsy();
  });
});

describe("personne ne repond, tout le monde est la", () => {
  it(`veille a la ${SILENT_ROUNDS_BEFORE_PAUSE}e revelation, « Je suis là » relance les minuteurs`, () => {
    const inRoom = new Set([1, 2]);
    const { io, emitted } = fakeIo(inRoom);
    launch(io);
    for (let i = 0; i < SILENT_ROUNDS_BEFORE_PAUSE; i++) jest.advanceTimersByTime(PREROLL_MS + ROUND_MS + 50 + (i < SILENT_ROUNDS_BEFORE_PAUSE - 1 ? REVEAL_MS : 0));
    const state = getGameState(room)!;
    expect(state.phase).toBe("REVEAL");
    expect(state.idle?.reason).toBe("silent");
    // Le classement ne part pas tout seul pendant la veille.
    jest.advanceTimersByTime(REVEAL_MS * 3);
    expect(getGameState(room)?.currentRound).toBe(SILENT_ROUNDS_BEFORE_PAUSE);

    expect(markPresent(room, 2)).toBe("player");
    rescheduleAfterResume(io, room);
    jest.advanceTimersByTime(REVEAL_MS + 50);
    expect(getGameState(room)?.currentRound).toBe(SILENT_ROUNDS_BEFORE_PAUSE + 1);
    expect(reveals(emitted)).toBe(SILENT_ROUNDS_BEFORE_PAUSE);
  });
});
