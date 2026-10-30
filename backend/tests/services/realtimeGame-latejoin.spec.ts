/**
 * Arrivee en cours de partie (T19, decision de Tym du 29/10/2026) : la
 * machine a etats, sans socket ni base.
 *
 * Le retardataire attend hors de `players` : il ne repond pas, ne retient ni
 * la revelation anticipee ni le passage a la manche suivante, n'est pas note.
 * Il devient joueur au debut de la manche suivante, a 0 point, et n'est
 * jamais propose au « qui a mis ce morceau ? ».
 */
import {
  admitToGame,
  bootstrapGameState,
  clearGame,
  dropWaiting,
  earlyRevealDecision,
  gameStateSnapshot,
  getGameState,
  isWaitingPlayer,
  markDisconnected,
  markReady,
  markReconnected,
  recordAnswer,
  revealRound,
  startNextRound,
  type RoundTrack,
} from "../../src/services/realtimeGame";

const ROOM = "TEST_LATEJOIN_ROOM";
const DURATION = 20_000;
const LATE = { userId: 9, username: "Retard" };

function makeTracks(count: number, owners: number[] = []): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
    metadata: owners.length ? { owner_user_id: owners[i % owners.length] } : null,
  }));
}

function setup(opts: { players?: number; rounds?: number; owners?: number[] } = {}): void {
  clearGame(ROOM);
  bootstrapGameState({
    roomCode: ROOM,
    hostUserId: 1,
    tracks: makeTracks(opts.rounds ?? 3, opts.owners),
    participants: Array.from({ length: opts.players ?? 3 }, (_, i) => ({ userId: i + 1, username: `P${i + 1}` })),
    mode: "friends",
    config: { roundDurationMs: DURATION },
  });
  startNextRound(ROOM);
}

/** Tous les joueurs de la partie repondent, puis la manche est revelee. */
function playAndReveal(answer = "Song"): void {
  const state = getGameState(ROOM)!;
  for (const p of Object.values(state.players)) recordAnswer(ROOM, p.userId, answer);
  revealRound(ROOM);
}

/** Tous les joueurs de la partie sont prets : la manche suivante part. */
function everyoneReady(): void {
  for (const p of Object.values(getGameState(ROOM)!.players)) markReady(ROOM, p.userId);
}

afterEach(() => clearGame(ROOM));

describe("arrivee pendant la manche 2 sur 3", () => {
  it("attend la manche 2, ne peut pas y repondre, joue la manche 3 a 0 point", () => {
    setup();
    playAndReveal();
    everyoneReady();
    expect(getGameState(ROOM)!.currentRound).toBe(2);

    expect(admitToGame(ROOM, LATE)).toBe("arrived");
    expect(isWaitingPlayer(ROOM, LATE.userId)).toBe(true);
    expect(getGameState(ROOM)!.players[LATE.userId]).toBeUndefined();
    expect(getGameState(ROOM)!.waiting).toEqual([{ userId: 9, username: "Retard" }]);

    // Sa reponse de la manche 2 n'est jamais notee.
    recordAnswer(ROOM, LATE.userId, "Song 2 Artist 2");
    expect(getGameState(ROOM)!.players[LATE.userId]).toBeUndefined();
    playAndReveal("Song 2 Artist 2");
    expect(getGameState(ROOM)!.players[LATE.userId]).toBeUndefined();

    // Ni le reveal, ni « pret » ne le promeuvent : seul le debut de la manche suivante.
    markReady(ROOM, LATE.userId);
    expect(getGameState(ROOM)!.phase).toBe("REVEAL");
    everyoneReady();
    const state = getGameState(ROOM)!;
    expect(state.currentRound).toBe(3);
    expect(state.waiting).toEqual([]);
    expect(state.players[LATE.userId]).toEqual(
      expect.objectContaining({ score: 0, rounds: 0, hasAnswered: false, totalReactionMs: 2 * DURATION }),
    );

    // Manche 3 : il joue comme les autres.
    recordAnswer(ROOM, LATE.userId, "Song 3 Artist 3");
    revealRound(ROOM);
    expect(getGameState(ROOM)!.players[LATE.userId]).toEqual(expect.objectContaining({ score: 2, rounds: 1, lastVerdict: "correct" }));
  });

  it("ne retient pas la revelation anticipee quand tous les joueurs ont repondu", () => {
    setup();
    admitToGame(ROOM, LATE);
    const state = getGameState(ROOM)!;
    for (const p of Object.values(state.players)) recordAnswer(ROOM, p.userId, "x");
    expect(earlyRevealDecision(ROOM)).toEqual({ kind: "reveal" });
  });

  it("ne retient pas le passage a la manche suivante", () => {
    setup();
    admitToGame(ROOM, LATE);
    playAndReveal();
    everyoneReady();
    expect(getGameState(ROOM)!.currentRound).toBe(2);
  });
});

describe("arrivee pendant la derniere manche", () => {
  it("reste en attente jusqu'a la fin, hors du classement final", () => {
    setup({ rounds: 2 });
    playAndReveal();
    everyoneReady();
    expect(getGameState(ROOM)!.currentRound).toBe(2);
    admitToGame(ROOM, LATE);
    playAndReveal();
    everyoneReady();
    const state = getGameState(ROOM)!;
    expect(state.phase).toBe("FINISHED");
    expect(state.players[LATE.userId]).toBeUndefined();
    expect(state.waiting).toEqual([{ userId: 9, username: "Retard" }]);
  });
});

describe("reconnexions", () => {
  it("un joueur deja dans la partie garde son score et ne passe pas en attente", () => {
    setup();
    playAndReveal("Song 1 Artist 1");
    const before = getGameState(ROOM)!.players[2].score;
    expect(before).toBeGreaterThan(0);
    markDisconnected(ROOM, 2);
    markReconnected(ROOM, 2);
    expect(admitToGame(ROOM, { userId: 2, username: "P2" })).toBe("player");
    expect(getGameState(ROOM)!.players[2].score).toBe(before);
    expect(isWaitingPlayer(ROOM, 2)).toBe(false);
  });

  it("le retardataire qui recharge sa page reste en attente, sans doublon", () => {
    setup();
    expect(admitToGame(ROOM, LATE)).toBe("arrived");
    markDisconnected(ROOM, LATE.userId);
    expect(admitToGame(ROOM, LATE)).toBe("waiting");
    expect(getGameState(ROOM)!.waiting).toHaveLength(1);
  });

  it("coupe au debut de la manche suivante, il attend la d'apres", () => {
    setup();
    admitToGame(ROOM, LATE);
    markDisconnected(ROOM, LATE.userId);
    playAndReveal();
    everyoneReady();
    expect(getGameState(ROOM)!.players[LATE.userId]).toBeUndefined();
    markReconnected(ROOM, LATE.userId);
    playAndReveal();
    everyoneReady();
    expect(getGameState(ROOM)!.players[LATE.userId]).toEqual(expect.objectContaining({ score: 0 }));
  });

  it("parti par Quitter, il n'est pas promu", () => {
    setup();
    admitToGame(ROOM, LATE);
    dropWaiting(ROOM, LATE.userId);
    playAndReveal();
    everyoneReady();
    expect(getGameState(ROOM)!.players[LATE.userId]).toBeUndefined();
    expect(getGameState(ROOM)!.waiting).toEqual([]);
  });
});

describe("hors manche, comme avant", () => {
  it("apres la fin de partie, un nouveau venu rejoint les joueurs", () => {
    setup({ rounds: 1 });
    playAndReveal();
    everyoneReady();
    expect(getGameState(ROOM)!.phase).toBe("FINISHED");
    expect(admitToGame(ROOM, LATE)).toBe("player");
    expect(isWaitingPlayer(ROOM, LATE.userId)).toBe(false);
  });

  it("sans partie en memoire, rien a faire", () => {
    clearGame(ROOM);
    expect(admitToGame(ROOM, LATE)).toBe("none");
  });
});

describe("qui a mis ce morceau ?", () => {
  it("le retardataire n'est jamais propose, il peut quand meme deviner", () => {
    // 3 joueurs du lancement, chacun proprietaire d'un morceau sur 3.
    for (let attempt = 0; attempt < 20; attempt++) {
      clearGame(ROOM);
      bootstrapGameState({
        roomCode: ROOM,
        hostUserId: 1,
        tracks: makeTracks(6, [1, 2, 3]),
        participants: [1, 2, 3].map(id => ({ userId: id, username: `P${id}` })),
        mode: "friends",
        config: { roundDurationMs: DURATION },
      });
      startNextRound(ROOM);
      admitToGame(ROOM, LATE);
      playAndReveal();
      everyoneReady();
      const state = getGameState(ROOM)!;
      expect(state.players[LATE.userId]).toBeDefined();
      expect(state.currentTrack?.ownerChoices).not.toContain(LATE.userId);
      expect(state.currentTrack?.ownerChoices?.length).toBe(3);
    }
    // Et sa devinette compte : le proprietaire de la manche 2 est le joueur 2.
    recordAnswer(ROOM, LATE.userId, "", 2);
    revealRound(ROOM);
    expect(getGameState(ROOM)!.players[LATE.userId].score).toBe(1);
  });
});

describe("ce qui part sur le fil", () => {
  it("la liste d'attente ne porte que le pseudo, et la manche reste caviardee", () => {
    setup();
    admitToGame(ROOM, { ...LATE, avatar: "https://exemple.test/a.png" });
    markDisconnected(ROOM, LATE.userId);
    const snapshot = gameStateSnapshot(ROOM)!;
    expect(snapshot.waiting).toEqual([{ userId: 9, username: "Retard" }]);
    expect(snapshot.currentTrack?.title).toBe("");
    expect(snapshot.currentTrack?.artist).toBe("");
  });
});
