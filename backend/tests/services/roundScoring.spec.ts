/**
 * Bareme Kahoot des modes multijoueur (T43) : le calcul seul, puis la machine
 * a etats avec une horloge serveur pilotee.
 */
import { roundPoints, speedPoints, streakBonus, SCORING } from "../../src/services/roundScoring";
import {
  bootstrapGameState,
  clearGame,
  gameStateSnapshot,
  getGameState,
  pauseGame,
  recordAnswer,
  resumeGame,
  revealRound,
  startNextRound,
  type RoundTrack,
} from "../../src/services/realtimeGame";

describe("speedPoints", () => {
  it("1000 pour une reponse immediate, 500 au dernier moment", () => {
    expect(speedPoints(0, 30_000)).toBe(1000);
    expect(speedPoints(30_000, 30_000)).toBe(500);
    expect(speedPoints(15_000, 30_000)).toBe(750);
    expect(speedPoints(3_000, 30_000)).toBe(950);
  });

  it("reste entre 500 et 1000, meme hors de la manche", () => {
    expect(speedPoints(-2_000, 30_000)).toBe(1000);
    expect(speedPoints(45_000, 30_000)).toBe(500);
    expect(speedPoints(1_000, 0)).toBe(SCORING.minPoints);
  });
});

describe("streakBonus", () => {
  it("+100 a la 2e manche d'affilee, +200 a la 3e, plafonne a +500", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(streakBonus)).toEqual([0, 0, 100, 200, 300, 400, 500, 500, 500]);
  });
});

describe("roundPoints", () => {
  const base = { titleOk: false, artistOk: false, ownerOk: false, reactionMs: 0, durationMs: 30_000, previousStreak: 0 };

  it("titre et artiste : le plein selon la rapidite", () => {
    expect(roundPoints({ ...base, titleOk: true, artistOk: true }).gained).toBe(1000);
    expect(roundPoints({ ...base, titleOk: true, artistOk: true, reactionMs: 30_000 }).gained).toBe(500);
  });

  it("un seul des deux : la moitie", () => {
    expect(roundPoints({ ...base, titleOk: true }).gained).toBe(500);
    expect(roundPoints({ ...base, artistOk: true, reactionMs: 30_000 }).gained).toBe(250);
    expect(roundPoints({ ...base, artistOk: true, reactionMs: 15_000 }).gained).toBe(375);
  });

  it("« qui a ajoute » : +200 fixe, meme lent, meme sans titre ni artiste", () => {
    expect(roundPoints({ ...base, ownerOk: true, reactionMs: 29_000 }).gained).toBe(200);
    expect(roundPoints({ ...base, titleOk: true, artistOk: true, ownerOk: true, reactionMs: 30_000 }).gained).toBe(700);
  });

  it("serie : elle monte avec titre ou artiste, le bonus est plafonne a +500", () => {
    let streak = 0;
    const bonuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = roundPoints({ ...base, titleOk: true, previousStreak: streak });
      streak = r.streak;
      bonuses.push(r.points.streak);
    }
    expect(streak).toBe(8);
    expect(bonuses).toEqual([0, 100, 200, 300, 400, 500, 500, 500]);
  });

  it("« Je sais pas », mauvaise reponse ou absence : 0 et serie remise a zero", () => {
    const r = roundPoints({ ...base, reactionMs: 1_000, previousStreak: 4 });
    expect(r.gained).toBe(0);
    expect(r.streak).toBe(0);
    expect(roundPoints({ ...base, reactionMs: null, previousStreak: 4 }).streak).toBe(0);
  });

  it("le bon « qui a ajoute » seul ne prolonge pas la serie", () => {
    const r = roundPoints({ ...base, ownerOk: true, previousStreak: 3 });
    expect(r.streak).toBe(0);
    expect(r.points.streak).toBe(0);
  });

  it("l'hote qui presente : 0, serie intacte", () => {
    const r = roundPoints({ ...base, titleOk: true, artistOk: true, ownerOk: true, previousStreak: 2, presenter: true });
    expect(r.gained).toBe(0);
    expect(r.streak).toBe(2);
  });

  it("jamais de points negatifs", () => {
    for (const reactionMs of [-50_000, 0, 10_000, 90_000, null]) {
      for (const titleOk of [true, false]) {
        expect(roundPoints({ ...base, titleOk, reactionMs }).gained).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("bareme dans la partie (horloge serveur)", () => {
  const ROOM = "TEST_SCORING_ROOM";
  const DURATION = 20_000;
  let now = 0;
  const tracks: RoundTrack[] = Array.from({ length: 4 }, (_, i) => ({
    round: i + 1,
    trackId: `t${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: null,
    metadata: { owner_user_id: 3 },
  }));

  function setup(mode = "friends", hostPlays = false) {
    clearGame(ROOM);
    bootstrapGameState({
      roomCode: ROOM,
      hostUserId: 1,
      hostPlays,
      tracks,
      participants: [1, 2, 3].map(userId => ({ userId, username: `P${userId}` })),
      mode,
      config: { roundDurationMs: DURATION },
    });
  }

  beforeEach(() => {
    now = 5_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearGame(ROOM);
  });

  it("le temps est celui du serveur, entre le debut de la manche et la reception", () => {
    setup();
    startNextRound(ROOM);
    now += 5_000;
    recordAnswer(ROOM, 2, "", null, "Song 1", "Artist 1");
    now += 10_000;
    const state = revealRound(ROOM)!;
    // 5 s sur 20 : 1000 x (1 - 0,25 / 2) = 875, quel que soit l'instant du reveal.
    expect(state.players[2].lastGained).toBe(875);
    expect(state.players[2].lastPoints).toEqual({ answer: 875, streak: 0, owner: 0, ms: 5_000 });
  });

  it("une reponse donnee avant une pause garde son temps a la reprise", () => {
    setup();
    startNextRound(ROOM);
    now += 4_000;
    recordAnswer(ROOM, 2, "", null, "Song 1", "Artist 1");
    now += 1_000;
    pauseGame(ROOM, now);
    now += 60_000;
    resumeGame(ROOM, now);
    now += 2_000;
    expect(revealRound(ROOM)!.players[2].lastPoints?.ms).toBe(4_000);
  });

  it("serie sur plusieurs manches, puis remise a zero par « Je sais pas »", () => {
    setup();
    const gained: number[] = [];
    for (const round of [1, 2, 3]) {
      startNextRound(ROOM);
      recordAnswer(ROOM, 2, "", null, `Song ${round}`, "");
      gained.push(revealRound(ROOM)!.players[2].lastGained ?? -1);
    }
    expect(gained).toEqual([500, 600, 700]);
    expect(getGameState(ROOM)!.players[2]).toEqual(expect.objectContaining({ streak: 3, bestStreak: 3, score: 1800 }));
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "");
    const after = revealRound(ROOM)!.players[2];
    expect(after.lastGained).toBe(0);
    expect(after.streak).toBe(0);
    expect(after.bestStreak).toBe(3);
  });

  it("l'hote qui presente ne marque rien, meme si une reponse lui est attribuee", () => {
    setup("event");
    startNextRound(ROOM);
    recordAnswer(ROOM, 1, "", 3, "Song 1", "Artist 1");
    recordAnswer(ROOM, 2, "", 3, "Song 1", "Artist 1");
    const state = revealRound(ROOM)!;
    expect(state.players[1].lastGained).toBe(0);
    expect(state.players[1].score).toBe(0);
    expect(state.players[2].lastGained).toBe(1200);
  });

  it("l'hote qui joue aussi marque comme les autres", () => {
    setup("event", true);
    startNextRound(ROOM);
    recordAnswer(ROOM, 1, "", null, "Song 1", "Artist 1");
    expect(revealRound(ROOM)!.players[1].lastGained).toBe(1000);
  });

  it("ni les points ni leur detail ne partent pendant la manche", () => {
    setup();
    startNextRound(ROOM);
    recordAnswer(ROOM, 2, "", 3, "Song 1", "Artist 1");
    revealRound(ROOM);
    startNextRound(ROOM);
    now += 1_000;
    recordAnswer(ROOM, 2, "", 3, "Song 2", "Artist 2");
    const snap = gameStateSnapshot(ROOM)!;
    expect(snap.players[2].lastGained).toBeUndefined();
    expect(snap.players[2].lastPoints).toBeUndefined();
    // Le score et la serie sont ceux d'avant la manche en cours.
    expect(snap.players[2].score).toBe(1200);
    expect(snap.players[2].streak).toBe(1);
  });
});
