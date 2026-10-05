/**
 * Grace de reconnexion cote minuteurs (realtimeOrchestrator) : quand la
 * revelation anticipee part, une seule fois, et qu'aucun minuteur ne traine.
 * Horloge factice de Jest (Date compris) et faux serveur socket.io qui note
 * ce qui est emis : rien ne depend du temps reel.
 */
import type { Server } from "socket.io";
import {
  DISCONNECT_GRACE_MS,
  bootstrapGameState,
  clearGame,
  getGameState,
  markDisconnected,
  markReconnected,
  pauseGame,
  recordAnswer,
  resumeGame,
  revealRound,
  startNextRound,
  startReconnectGrace,
  type RoundTrack,
} from "../../src/services/realtimeGame";
import {
  clearAdvanceTimer,
  clearGraceTimer,
  clearRevealTimer,
  startRoundAndBroadcast,
  tryEarlyReveal,
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

// Pre-roll de startRoundAndBroadcast : la musique part 1,6 s apres l'annonce.
const PREROLL_MS = 1_600;
let roomSeq = 0;
let room = "";

/** Une manche en cours, joueurs 1 et 2 ont repondu, le 3 non. */
function roundWithTwoAnswers(io: Server, roundDurationMs = 20_000): void {
  room = `GRACE_ORCH_${++roomSeq}`;
  bootstrapGameState({
    roomCode: room,
    hostUserId: 1,
    tracks: makeTracks(2),
    participants: [1, 2, 3].map(id => ({ userId: id, username: `P${id}` })),
    mode: "friends",
    config: { roundDurationMs },
  });
  startRoundAndBroadcast(io, room);
  recordAnswer(room, 1, "Song 1 Artist 1");
  recordAnswer(room, 2, "Song 1 Artist 1");
}

/** Le joueur 3 coupe : ce que fait le gestionnaire "disconnecting". */
function dropPlayer3(io: Server): boolean {
  markDisconnected(room, 3);
  startReconnectGrace(room, 3);
  return tryEarlyReveal(io, room);
}

const reveals = (emitted: Emitted[]) => emitted.filter(e => e.event === "game:round:reveal");

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
});

afterEach(() => {
  clearGraceTimer(room);
  clearRevealTimer(room);
  clearAdvanceTimer(room);
  clearGame(room);
  jest.useRealTimers();
});

describe("grace de reconnexion : minuteurs de l'orchestrateur", () => {
  it("revele a la fin de la grace, pas avant", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io);
    jest.advanceTimersByTime(PREROLL_MS + 2_000);

    expect(dropPlayer3(io)).toBe(false);
    jest.advanceTimersByTime(DISCONNECT_GRACE_MS - 1);
    expect(reveals(emitted)).toHaveLength(0);
    expect(getGameState(room)?.phase).toBe("GUESSING");

    jest.advanceTimersByTime(1);
    expect(reveals(emitted)).toHaveLength(1);
    expect(getGameState(room)?.phase).toBe("REVEAL");
    // La revelation porte la vraie piste (caviardee jusque-la).
    expect((reveals(emitted)[0].payload as { track: { title: string } }).track.title).toBe("Song 1");
  });

  it("le minuteur de manche qui tombe pendant la grace revele une seule fois, et la grace ne traine pas", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io, 2_000);
    // Coupure 1 s avant la fin de la manche : la grace irait 4 s plus loin.
    jest.advanceTimersByTime(PREROLL_MS + 1_000);
    dropPlayer3(io);

    jest.advanceTimersByTime(1_000);
    expect(reveals(emitted)).toHaveLength(1);
    expect(getGameState(room)?.phase).toBe("REVEAL");
    // Reste seulement le filet anti-AFK de la revelation (10 s).
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
    expect(reveals(emitted)).toHaveLength(1);
    expect(getGameState(room)?.currentRound).toBe(1);
  });

  it("jamais de revelation pendant une pause de l'hote ; la grace reprend ou elle en etait", () => {
    const { io, emitted } = fakeIo();
    // Manche longue : son minuteur reste loin de la fenetre observee.
    roundWithTwoAnswers(io, 60_000);
    jest.advanceTimersByTime(PREROLL_MS + 2_000);
    dropPlayer3(io);
    jest.advanceTimersByTime(1_000);
    // Pause sans toucher aux minuteurs : c'est la garde du rappel qui doit tenir.
    pauseGame(room);

    jest.advanceTimersByTime(DISCONNECT_GRACE_MS * 3);
    expect(reveals(emitted)).toHaveLength(0);
    expect(getGameState(room)?.phase).toBe("GUESSING");

    // A la reprise (game:resume), la grace etait gelee : il lui reste les 4 s
    // qu'elle avait a la pause.
    resumeGame(room);
    expect(tryEarlyReveal(io, room)).toBe(false);
    jest.advanceTimersByTime(DISCONNECT_GRACE_MS - 1_000 - 1);
    expect(reveals(emitted)).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(reveals(emitted)).toHaveLength(1);
    expect(getGameState(room)?.phase).toBe("REVEAL");
  });

  it("le minuteur de manche ne revele jamais pendant une pause de l'hote", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io, 2_000);
    jest.advanceTimersByTime(PREROLL_MS + 500);
    // Pause sans toucher aux minuteurs : c'est la garde du rappel qui doit tenir.
    pauseGame(room);
    jest.advanceTimersByTime(5_000);
    expect(reveals(emitted)).toHaveLength(0);
    expect(getGameState(room)?.phase).toBe("GUESSING");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("le minuteur de manche ne revele que sa propre manche", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io);
    // La manche 2 part sans passer par l'orchestrateur : le minuteur de la
    // manche 1 tourne encore et ne doit pas reveler la 2.
    revealRound(room);
    startNextRound(room, { startAt: Date.now() + 10_000 });
    jest.advanceTimersByTime(PREROLL_MS + 20_000);
    expect(reveals(emitted)).toHaveLength(0);
    expect(getGameState(room)?.phase).toBe("GUESSING");
    expect(getGameState(room)?.currentRound).toBe(2);
  });

  it("le minuteur de manche finit comme les revelations anticipees : etat diffuse, filet anti-AFK", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io, 2_000);
    jest.advanceTimersByTime(PREROLL_MS + 2_000);
    expect(reveals(emitted)).toHaveLength(1);
    const after = emitted.slice(emitted.findIndex(e => e.event === "game:round:reveal"));
    expect(after.some(e => e.event === "game:state" && (e.payload as { phase: string }).phase === "REVEAL")).toBe(true);
    // Filet anti-AFK pose : la manche 2 part seule 10 s plus tard.
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(10_000);
    expect(getGameState(room)?.currentRound).toBe(2);
  });

  it("le minuteur de grace d'une manche passee ne touche pas la suivante", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io);
    jest.advanceTimersByTime(PREROLL_MS + 2_000);
    dropPlayer3(io);
    clearRevealTimer(room);
    // La manche 2 part sans passer par l'orchestrateur : le minuteur de grace
    // de la manche 1 survit. Les presents ont repondu, le joueur 3 n'a pas de
    // grace dans cette manche.
    revealRound(room);
    startNextRound(room);
    recordAnswer(room, 1, "Song 2 Artist 2");
    recordAnswer(room, 2, "Song 2 Artist 2");

    jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
    expect(reveals(emitted)).toHaveLength(0);
    expect(getGameState(room)?.currentRound).toBe(2);
    expect(getGameState(room)?.phase).toBe("GUESSING");
  });

  it("revanche sous le meme code : le minuteur de grace de l'ancienne partie ne revele rien", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io);
    jest.advanceTimersByTime(PREROLL_MS + 2_000);
    dropPlayer3(io);
    clearRevealTimer(room);
    // Revanche : nouvelle partie sous le meme code, manche 1 encore, personne
    // n'a repondu. Le rappel de l'ancienne grace ne revele pas cette manche.
    bootstrapGameState({
      roomCode: room,
      hostUserId: 1,
      tracks: makeTracks(2),
      participants: [1, 2, 3].map(id => ({ userId: id, username: `P${id}` })),
      mode: "friends",
      config: { roundDurationMs: 20_000 },
    });
    startNextRound(room);
    recordAnswer(room, 1, "Song 1 Artist 1");

    jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
    expect(reveals(emitted)).toHaveLength(0);
    expect(getGameState(room)?.phase).toBe("GUESSING");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("un joueur revenu pendant sa grace arrete la revelation anticipee, sa reponse la declenche", () => {
    const { io, emitted } = fakeIo();
    roundWithTwoAnswers(io);
    jest.advanceTimersByTime(PREROLL_MS + 2_000);
    dropPlayer3(io);

    jest.advanceTimersByTime(2_000);
    markReconnected(room, 3);
    jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
    expect(reveals(emitted)).toHaveLength(0);
    expect(getGameState(room)?.phase).toBe("GUESSING");

    recordAnswer(room, 3, "Song 1 Artist 1");
    expect(tryEarlyReveal(io, room)).toBe(true);
    expect(reveals(emitted)).toHaveLength(1);
    expect(getGameState(room)?.players[3].lastVerdict).toBe("correct");
  });

  it("la revelation anticipee annule le minuteur de manche : pas de seconde revelation", () => {
    const { io, emitted } = fakeIo();
    // Manche de 8 s : la grace (5 s) finit 3 s avant le minuteur de manche.
    roundWithTwoAnswers(io, 8_000);
    jest.advanceTimersByTime(PREROLL_MS);
    dropPlayer3(io);

    jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
    expect(reveals(emitted)).toHaveLength(1);
    // Apres la fin prevue de la manche, avant le filet anti-AFK (10 s) : une
    // seule revelation, toujours la manche 1.
    jest.advanceTimersByTime(5_000);
    expect(reveals(emitted)).toHaveLength(1);
    expect(getGameState(room)?.currentRound).toBe(1);
  });

  it("clearGraceTimer ne laisse aucun minuteur de grace derriere lui", () => {
    const { io } = fakeIo();
    roundWithTwoAnswers(io);
    clearRevealTimer(room);
    expect(jest.getTimerCount()).toBe(0);
    dropPlayer3(io);
    expect(jest.getTimerCount()).toBe(1);
    clearGraceTimer(room);
    expect(jest.getTimerCount()).toBe(0);
  });
});
