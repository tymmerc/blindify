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
  gameStateSnapshot,
  nextRevealStep,
  pauseGame,
  resumeGame,
  type RoundTrack,
} from "../../src/services/realtimeGame";
import { ROUND_PACING } from "../../src/services/roundPacing";

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
    expect(state?.players[2].score).toBe(2); // 1 titre + 1 artiste
  });

  it("awards partial for title only", () => {
    recordAnswer(ROOM, 2, "", null, "Bohemian Rhapsody", "Wrong Artist");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("close");
    expect(state?.players[2].score).toBe(1); // titre seul
  });

  it("awards partial for artist only", () => {
    recordAnswer(ROOM, 2, "", null, "Wrong Title", "Queen");
    const state = revealRound(ROOM);
    expect(state?.players[2].lastVerdict).toBe("close");
    expect(state?.players[2].score).toBe(1); // artiste seul
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
    expect(state?.players[2].score).toBe(3); // titre + artiste + bonne source
  });

  // Morceau partage : le joueur 3 l'a apporte ce soir, le joueur 2 l'avait
  // importe aussi. Les deux sont de bonnes reponses au « qui a mis quoi ».
  it("counts every importer of a shared track as a right owner guess", () => {
    const shared: RoundTrack[] = [{
      round: 1, trackId: "t1", title: "Song 1", artist: "Artist 1", previewUrl: null,
      metadata: { owner_user_id: 3, owner_user_ids: [2, 3] },
    }];
    setupGame({ tracks: shared });
    startNextRound(ROOM);
    recordAnswer(ROOM, 1, "", 2, "", "");
    recordAnswer(ROOM, 2, "", 2, "", "");
    recordAnswer(ROOM, 3, "", 1, "", "");
    const state = revealRound(ROOM);
    expect(state?.players[1].lastGained).toBe(1);
    expect(state?.players[2].lastGained).toBe(1);
    expect(state?.players[3].lastGained).toBe(0);
  });
});

describe("startNextRound - owner choices", () => {
  const fourPlayers = [
    { userId: 1, username: "Host" },
    { userId: 2, username: "Player2" },
    { userId: 3, username: "Player3" },
    { userId: 4, username: "Player4" },
  ];

  it("offers the owner and two decoys who did not import the track", () => {
    for (let i = 0; i < 20; i++) {
      setupGame({
        participants: fourPlayers,
        tracks: [{ round: 1, trackId: "t1", title: "S", artist: "A", previewUrl: null, metadata: { owner_user_id: 3, owner_user_ids: [2, 3] } }],
      });
      const choices = startNextRound(ROOM)?.currentTrack?.ownerChoices ?? [];
      expect(choices).toHaveLength(3);
      expect(choices).toContain(3);
      expect(choices).not.toContain(2);
    }
  });

  it("fills with the other importers when there are not enough decoys", () => {
    setupGame({
      tracks: [{ round: 1, trackId: "t1", title: "S", artist: "A", previewUrl: null, metadata: { owner_user_id: 3, owner_user_ids: [2, 3] } }],
    });
    const choices = startNextRound(ROOM)?.currentTrack?.ownerChoices ?? [];
    expect([...choices].sort()).toEqual([1, 2, 3]);
  });

  it("keeps a co-importer who plays when the contributor only presents", () => {
    setupGame({
      participants: fourPlayers.slice(1),
      tracks: [{ round: 1, trackId: "t1", title: "S", artist: "A", previewUrl: null, metadata: { owner_user_id: 1, owner_user_ids: [1, 2] } }],
    });
    const choices = startNextRound(ROOM)?.currentTrack?.ownerChoices ?? [];
    expect(choices).toContain(2);
    expect(choices).toHaveLength(3);
  });
});

// T7 (soiree du 01/11, sessions 752 a 754) : a deux, « qui a ajoute ce titre ? »
// n'a pas de sens, si ce n'est pas toi c'est forcement l'autre.
describe("startNextRound - « qui a ajoute ? » seulement a 3 joueurs ou plus", () => {
  const owned: RoundTrack[] = [{ round: 1, trackId: "t1", title: "Song 1", artist: "Artist 1", previewUrl: null, metadata: { owner_user_id: 1 } }];
  const two = [{ userId: 1, username: "Mae" }, { userId: 2, username: "Manou" }];

  it("a deux joueurs : pas de question, pas de candidats, et la reponse ne rapporte rien", () => {
    setupGame({ participants: two, tracks: owned });
    const round = startNextRound(ROOM);
    expect(round?.currentTrack?.ownerQuestion).toBe(false);
    expect(round?.currentTrack?.ownerChoices).toEqual([]);
    // Un vieux client qui envoie quand meme un choix ne marque pas le point.
    recordAnswer(ROOM, 2, "", 1, "", "");
    expect(revealRound(ROOM)?.players[2].lastGained).toBe(0);
  });

  it("la question cachee reste cachee dans l'etat public de la manche", () => {
    setupGame({ participants: two, tracks: owned });
    startNextRound(ROOM);
    expect(gameStateSnapshot(ROOM)?.currentTrack?.ownerQuestion).toBe(false);
  });

  it("a trois joueurs : la question revient, avec le bonus", () => {
    setupGame({ tracks: owned });
    expect(startNextRound(ROOM)?.currentTrack?.ownerQuestion).toBe(true);
    recordAnswer(ROOM, 2, "", 1, "", "");
    expect(revealRound(ROOM)?.players[2].lastGained).toBe(1);
  });

  it("une seule personne a ramene la musique : pas de question non plus", () => {
    clearGame(ROOM);
    bootstrapGameState({
      roomCode: ROOM,
      hostUserId: 1,
      tracks: owned,
      singleContributor: true,
      participants: [{ userId: 1, username: "A" }, { userId: 2, username: "B" }, { userId: 3, username: "C" }],
      mode: "friends",
      config: { roundDurationMs: 20000 },
    });
    expect(startNextRound(ROOM)?.currentTrack?.ownerQuestion).toBe(false);
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

  // T38 : le serveur enchaine les ecrans, les « pret » ne font plus avancer.
  it("ne fait plus avancer la partie, meme quand tout le monde est pret", () => {
    markReady(ROOM, 1);
    markReady(ROOM, 2);
    const state = markReady(ROOM, 3);
    expect(state?.phase).toBe("REVEAL");
    expect(state?.currentRound).toBe(1);
  });
});

describe("rythme du reveal (T38)", () => {
  beforeEach(() => {
    setupGame({ tracks: makeTracks(2) });
    startNextRound(ROOM);
  });

  it("la revelation ouvre l'ecran de la reponse pour ROUND_PACING.answerMs", () => {
    const before = Date.now();
    const state = revealRound(ROOM)!;
    expect(state.pacing?.step).toBe("answer");
    expect(state.pacing!.endsAt).toBeGreaterThanOrEqual(before + ROUND_PACING.answerMs);
    expect(state.pacing!.endsAt).toBeLessThanOrEqual(Date.now() + ROUND_PACING.answerMs);
  });

  it("reponse, puis classement, puis manche suivante", () => {
    revealRound(ROOM);
    expect(nextRevealStep(ROOM, 1_000)).toBe("scores");
    expect(getGameState(ROOM)?.pacing).toEqual({ step: "scores", endsAt: 1_000 + ROUND_PACING.scoresMs });
    expect(nextRevealStep(ROOM, 2_000)).toBe("next");
    // L'appelant lance la manche suivante : l'ecran du reveal disparait.
    const next = startNextRound(ROOM)!;
    expect(next.phase).toBe("GUESSING");
    expect(next.pacing).toBeNull();
  });

  it("rien pendant la manche ni pendant une pause", () => {
    expect(nextRevealStep(ROOM)).toBeNull();
    revealRound(ROOM);
    pauseGame(ROOM, 1_000);
    expect(nextRevealStep(ROOM)).toBeNull();
    expect(getGameState(ROOM)?.pacing?.step).toBe("answer");
  });

  it("la pause gele aussi la fin de l'ecran en cours", () => {
    revealRound(ROOM);
    const endsAt = getGameState(ROOM)!.pacing!.endsAt;
    pauseGame(ROOM, 10_000);
    resumeGame(ROOM, 14_000);
    expect(getGameState(ROOM)?.pacing?.endsAt).toBe(endsAt + 4_000);
  });

  it("apres la derniere manche, pas de classement : la reponse mene au podium", () => {
    revealRound(ROOM);
    nextRevealStep(ROOM);
    nextRevealStep(ROOM);
    startNextRound(ROOM);
    revealRound(ROOM);
    expect(nextRevealStep(ROOM)).toBe("next");
    expect(startNextRound(ROOM)?.phase).toBe("FINISHED");
  });

  it("le detail de chaque reponse arrive au reveal, jamais pendant la manche", () => {
    recordAnswer(ROOM, 1, "", 2, "Song 1", "Wrong");
    expect(gameStateSnapshot(ROOM)!.players[1].lastTitleOk).toBeUndefined();
    const state = revealRound(ROOM)!;
    expect(state.players[1]).toEqual(expect.objectContaining({ lastTitleOk: true, lastArtistOk: false, lastOwnerOk: false }));
    nextRevealStep(ROOM);
    nextRevealStep(ROOM);
    startNextRound(ROOM);
    expect(gameStateSnapshot(ROOM)!.players[1].lastTitleOk).toBeUndefined();
  });

  it("la piste de la manche suivante reste caviardee pendant son 3-2-1", () => {
    revealRound(ROOM);
    startNextRound(ROOM, { startAt: Date.now() + ROUND_PACING.countdownMs });
    const snap = gameStateSnapshot(ROOM)!;
    expect(snap.currentTrack?.title).toBe("");
    expect(snap.currentTrack?.artist).toBe("");
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

    expect(nextRevealStep(ROOM)).toBe("scores");
    expect(nextRevealStep(ROOM)).toBe("next");
    state = startNextRound(ROOM)!;
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

    expect(nextRevealStep(ROOM)).toBe("next");
    state = startNextRound(ROOM)!;
    expect(state.phase).toBe("FINISHED");

    // Player 1 should have highest score (2 correct, with streak)
    expect(state.players[1].score).toBeGreaterThan(state.players[3].score);
  });
});

describe("gameStateSnapshot : rien de la piste avant le reveal", () => {
  it("ni l'ISRC ni le reste de metadata ne partent pendant la manche", () => {
    const tracks = makeTracks(2).map(t => ({ ...t, metadata: { isrc: "JPZ921607277", album: "OST secret" } }));
    setupGame({ tracks });
    startNextRound(ROOM);
    const raw = JSON.stringify(gameStateSnapshot(ROOM));
    expect(raw).not.toContain("JPZ921607277");
    expect(raw).not.toContain("OST secret");
  });
});

// Relais de l'hote d'un salon Discord : l'etat en memoire suit la base hors
// manche, jamais en pleine manche.
describe("setHostUser", () => {
  const { bootstrapGameState, setHostUser, getGameState, clearGame } = jest.requireActual("../../src/services/realtimeGame");
  const track = (round: number) => ({ round, trackId: `t${round}`, title: `T${round}`, artist: `A${round}`, previewUrl: null, albumCover: null, metadata: null });

  it("au lobby ou au podium : l'hote change et redevient connecte", () => {
    bootstrapGameState({ roomCode: "RELAI1", hostUserId: 1, tracks: [track(1)], participants: [{ userId: 1, username: "a" }, { userId: 2, username: "b" }] });
    setHostUser("RELAI1", 2);
    expect(getGameState("RELAI1")).toMatchObject({ hostUserId: 2, hostConnected: true });
    clearGame("RELAI1");
  });

  it("salle sans partie en memoire : rien", () => {
    expect(setHostUser("AUCUNE", 2)).toBeUndefined();
  });
});

// Lien « Ecouter sur Spotify » du reveal (guidelines Spotify, T10) : la source
// et l'identifiant du morceau SONT la reponse. Ils ne sortent qu'au reveal.
describe("gameStateSnapshot : source du morceau seulement au reveal", () => {
  const SPOTIFY_ID = "4uLU6hMCjMI75M1A2tKUQC";

  it("ni la source ni l'identifiant Spotify pendant la manche", () => {
    const tracks = makeTracks(2).map(t => ({ ...t, trackId: SPOTIFY_ID, provider: "spotify" }));
    setupGame({ tracks });
    startNextRound(ROOM);
    const snap = gameStateSnapshot(ROOM);
    expect(snap?.currentTrack?.provider).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain(SPOTIFY_ID);
  });

  it("au reveal : la source et l'identifiant, pour le lien vers Spotify", () => {
    const tracks = makeTracks(2).map(t => ({ ...t, trackId: SPOTIFY_ID, provider: "spotify" }));
    setupGame({ tracks });
    startNextRound(ROOM);
    revealRound(ROOM);
    const snap = gameStateSnapshot(ROOM);
    expect(snap?.currentTrack).toMatchObject({ provider: "spotify", trackId: SPOTIFY_ID });
  });
});
