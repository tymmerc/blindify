/**
 * T27 : relancer une partie dans la meme salle juste apres la fin.
 *
 * Vu en vrai le 06/11 (salle 9SXZ6U, partie 777) : relancee 3 s apres la fin
 * de la 776, la manche 1 a demarre mais ne s'est jamais revelee. Le garde
 * "partie finie" de la salle restait pose 10 s apres le game over et bloquait
 * les minuteurs de la revanche.
 *
 * Horloge factice et faux serveur socket.io, comme realtimeOrchestrator-grace.
 */
import type { Server } from "socket.io";

jest.mock("../../src/services/gamePersistence", () => ({
  persistGameResults: jest.fn(async () => undefined),
  persistRoundResponses: jest.fn(async () => undefined),
}));

import {
  bootstrapGameState,
  clearGame,
  getGameState,
  pauseGame,
  recordAnswer,
  resumeGame,
  type RoundTrack,
} from "../../src/services/realtimeGame";
import {
  broadcastGameOver,
  clearAdvanceTimer,
  clearGraceTimer,
  clearRevealTimer,
  revealRoundNow,
  startRoundAndBroadcast,
  unstickGames,
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

function makeTracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

const ROUND_MS = 10_000;
const PREROLL_MS = 1_600;
let roomSeq = 0;
let room = "";

function launch(io: Server, rounds: number, sessionId: number): void {
  bootstrapGameState({
    roomCode: room,
    hostUserId: 1,
    tracks: makeTracks(rounds),
    participants: [1, 2].map(id => ({ userId: id, username: `P${id}` })),
    mode: "friends",
    config: { roundDurationMs: ROUND_MS },
    sessionId,
  });
  startRoundAndBroadcast(io, room);
}

/** Une partie d'une manche jouee jusqu'au game over, comme en vrai. */
function playOneRoundGame(io: Server, sessionId: number): void {
  launch(io, 1, sessionId);
  recordAnswer(room, 1, "Song 1 Artist 1");
  recordAnswer(room, 2, "Song 1 Artist 1");
  revealRoundNow(io, room);
  // Apres le reveal de la derniere manche, tout le monde est « pret » (ou le
  // filet anti-AFK passe) : la manche suivante n'existe pas, game over.
  startRoundAndBroadcast(io, room);
  expect(getGameState(room)?.phase).toBe("FINISHED");
}

const count = (emitted: Emitted[], event: string) => emitted.filter(e => e.event === event).length;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  room = `RELANCE_${++roomSeq}`;
});

afterEach(() => {
  clearRevealTimer(room);
  clearAdvanceTimer(room);
  clearGraceTimer(room);
  clearGame(room);
  jest.useRealTimers();
});

describe.each([0, 1_000, 3_000, 9_000])("revanche %i ms apres la fin", delayMs => {
  it("la manche 1 se revele a son heure, la manche suivante part seule, la partie finit", () => {
    const { io, emitted } = fakeIo();
    playOneRoundGame(io, 776);
    expect(count(emitted, "game:over")).toBe(1);

    jest.advanceTimersByTime(delayMs);
    // Ce que fait startGameLocked : la salle repart de zero.
    clearGame(room);
    launch(io, 2, 777);
    expect(getGameState(room)?.phase).toBe("GUESSING");
    expect(getGameState(room)?.currentRound).toBe(1);

    // Personne ne repond : le minuteur de manche doit reveler quand meme.
    jest.advanceTimersByTime(PREROLL_MS + ROUND_MS + 50);
    expect(getGameState(room)?.phase).toBe("REVEAL");
    expect(count(emitted, "game:round:reveal")).toBe(2);

    // Personne ne clique « pret » : le filet anti-AFK lance la manche 2.
    jest.advanceTimersByTime(10_000 + 50);
    expect(getGameState(room)?.currentRound).toBe(2);
    expect(getGameState(room)?.phase).toBe("GUESSING");

    jest.advanceTimersByTime(PREROLL_MS + ROUND_MS + 50);
    expect(getGameState(room)?.phase).toBe("REVEAL");
    // Derniere manche revelee, personne ne clique « pret » : game over 10 s apres.
    jest.advanceTimersByTime(10_000 + 50);
    expect(getGameState(room)?.phase).toBe("FINISHED");
    // La revanche a bien son propre game over (et donc son enregistrement).
    expect(count(emitted, "game:over")).toBe(2);
  });
});

it("le nettoyage differe de la partie d'avant n'efface pas les resultats de la revanche", () => {
  const { io } = fakeIo();
  playOneRoundGame(io, 776);
  jest.advanceTimersByTime(3_000);
  clearGame(room);
  launch(io, 1, 777);
  const playMs = PREROLL_MS + ROUND_MS + 50 + 10_000 + 50;
  jest.advanceTimersByTime(playMs);
  expect(getGameState(room)?.phase).toBe("FINISHED");
  // 60 s apres la fin de la 776, mais une trentaine de secondes seulement apres
  // celle de la 777 : l'ecran de resultats de la 777 doit encore lire l'etat.
  jest.advanceTimersByTime(60_000 - 3_000 - playMs + 100);
  expect(getGameState(room)?.phase).toBe("FINISHED");
  // Et le nettoyage de la 777 passe bien, 60 s apres SA fin.
  jest.advanceTimersByTime(60_000);
  expect(getGameState(room)).toBeUndefined();
});

it("un double game over de la meme partie reste ignore", () => {
  const { io, emitted } = fakeIo();
  playOneRoundGame(io, 776);
  broadcastGameOver(io, room);
  expect(count(emitted, "game:over")).toBe(1);
});

describe("filet anti-blocage (unstickGames)", () => {
  it("revele une manche dont le minuteur a disparu, une fois l'heure passee", () => {
    const { io, emitted } = fakeIo();
    launch(io, 2, 900);
    // On simule la perte du minuteur de reveal (le bug du 06/11).
    clearRevealTimer(room);
    const revealAt = getGameState(room)!.timing.revealAt!;
    expect(unstickGames(io, revealAt + 1_000)).not.toContain(room); // trop tot : marge
    expect(unstickGames(io, revealAt + 6_000)).toContain(room);
    expect(getGameState(room)?.phase).toBe("REVEAL");
    expect(count(emitted, "game:round:reveal")).toBe(1);
  });

  it("repose le filet anti-AFK d'un reveal sans suite", () => {
    const { io } = fakeIo();
    launch(io, 2, 901);
    jest.advanceTimersByTime(PREROLL_MS + ROUND_MS + 50);
    expect(getGameState(room)?.phase).toBe("REVEAL");
    clearAdvanceTimer(room);
    expect(unstickGames(io)).toContain(room);
    jest.advanceTimersByTime(10_000 + 50);
    expect(getGameState(room)?.currentRound).toBe(2);
    expect(getGameState(room)?.phase).toBe("GUESSING");
  });

  it("ne touche ni une partie qui tourne normalement, ni une pause, ni une partie finie", () => {
    const { io, emitted } = fakeIo();
    launch(io, 2, 902);
    // Minuteur present : rien, meme bien apres l'heure (le minuteur s'en charge).
    expect(unstickGames(io, Date.now() + 60_000)).not.toContain(room);
    clearRevealTimer(room);
    pauseGame(room);
    expect(unstickGames(io, Date.now() + 60_000)).not.toContain(room);
    resumeGame(room);
    clearGame(room);
    playOneRoundGame(io, 903);
    expect(unstickGames(io, Date.now() + 60_000)).not.toContain(room);
    expect(count(emitted, "game:over")).toBe(1);
  });
});
