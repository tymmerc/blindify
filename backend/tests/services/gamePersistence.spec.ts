// Ecriture des reponses d'une manche en base. persistRoundResponses est lancee
// sans attendre a la revelation, avec l'etat VIVANT de la partie. Si les joueurs
// enchainent avant que la base ait repondu, la manche suivante remet les
// reponses a zero dans ce meme objet : il ne faut ecrire que ce qui etait vrai
// a la revelation. Trouve par la CI le 01/10/2026 (5 ou 4 reponses sur 6 dans
// le test d'integration multiplayer-socket). Aucune base ici : pool est un faux.

jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { pool } from "../../src/config/db";
import { persistGameResults, persistRoundResponses } from "../../src/services/gamePersistence";
import {
  bootstrapGameState,
  clearGame,
  recordAnswer,
  revealRound,
  startNextRound,
  type RoundTrack,
} from "../../src/services/realtimeGame";

const ROOM = "PERSIST_ROOM";
const SESSION_ID = 42;
const ROUND1_ROW_ID = 7;
const query = pool.query as jest.Mock;

const tracks: RoundTrack[] = [
  { round: 1, trackId: "t1", title: "Song One", artist: "Artist One", previewUrl: "https://example.com/1.mp3", metadata: { owner_user_id: 2 } },
  { round: 2, trackId: "t2", title: "Song Two", artist: "Artist Two", previewUrl: "https://example.com/2.mp3", metadata: { owner_user_id: 3 } },
] as RoundTrack[];

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

/** Lignes INSERT envoyees a la base, sous forme lisible. */
function insertedRows() {
  return query.mock.calls
    .filter(([sql]) => String(sql).includes("INSERT INTO round_responses"))
    .map(([, p]) => ({
      roundId: p[0], userId: p[1], guessTitle: p[2], guessArtist: p[3], isCorrect: p[4],
      responseTimeMs: p[5], scoreDelta: p[6], verdict: p[7], sourceGuess: p[8], sourceOwner: p[9], sourceCorrect: p[10],
    }))
    .sort((a, b) => a.userId - b.userId);
}

/** Manche 1 jouee par 3 joueurs puis revelee ; rend ce que la base doit recevoir. */
function playRoundOne() {
  clearGame(ROOM);
  bootstrapGameState({
    roomCode: ROOM,
    hostUserId: 1,
    tracks,
    participants: [
      { userId: 1, username: "Hote" },
      { userId: 2, username: "Bea" },
      { userId: 3, username: "Chloe" },
    ],
    sessionId: SESSION_ID,
  });
  const startAt = Date.now() - 4000;
  startNextRound(ROOM, { startAt });
  recordAnswer(ROOM, 1, "Song One Artist One", 2, "Song One", "Artist One");
  recordAnswer(ROOM, 2, "Rien a voir", 3, "Rien", "a voir");
  recordAnswer(ROOM, 3, "Song One", 2, "Song One", "");
  const revealed = revealRound(ROOM)!;
  const expected = Object.values(revealed.players)
    .map(p => ({
      roundId: ROUND1_ROW_ID,
      userId: p.userId,
      guessTitle: p.lastGuessTitle ?? null,
      guessArtist: p.lastGuessArtist ?? null,
      isCorrect: p.lastVerdict === "correct",
      responseTimeMs: p.answerAt ? Math.max(0, p.answerAt - startAt) : null,
      scoreDelta: p.lastGained ?? 0,
      verdict: p.lastVerdict ?? null,
      sourceGuess: p.lastSourceGuess ?? null,
      sourceOwner: 2,
      sourceCorrect: (p.lastSourceGuess ?? null) === null ? null : p.lastSourceGuess === 2,
    }))
    .sort((a, b) => a.userId - b.userId);
  return { revealed, expected };
}

beforeEach(() => {
  query.mockReset();
});

afterAll(() => clearGame(ROOM));

describe("persistRoundResponses", () => {
  it("ecrit une ligne par joueur, avec ce qui etait vrai a la revelation", async () => {
    const { revealed, expected } = playRoundOne();
    query.mockImplementation(async (sql: string) => (String(sql).includes("FROM game_rounds") ? { rows: [{ id: ROUND1_ROW_ID }] } : { rows: [] }));

    await persistRoundResponses(revealed, SESSION_ID);

    expect(query.mock.calls[0][1]).toEqual([SESSION_ID, 1]);
    expect(insertedRows()).toEqual(expected);
  });

  it("n'oublie personne si la manche suivante demarre avant la reponse de la base", async () => {
    const { revealed, expected } = playRoundOne();
    const roundLookup = deferred<{ rows: Array<{ id: number }> }>();
    query.mockImplementation((sql: string) => (String(sql).includes("FROM game_rounds") ? roundLookup.promise : Promise.resolve({ rows: [] })));

    // Lancee sans attendre, comme dans le jeu...
    const pending = persistRoundResponses(revealed, SESSION_ID);
    // ...et les joueurs enchainent : la manche 2 remet les reponses a zero.
    startNextRound(ROOM, { startAt: Date.now() });
    roundLookup.resolve({ rows: [{ id: ROUND1_ROW_ID }] });
    await pending;

    expect(query.mock.calls[0][1]).toEqual([SESSION_ID, 1]);
    expect(insertedRows()).toEqual(expected);
  });

  it("garde les reponses de la manche 1 meme si un joueur repond deja a la manche 2", async () => {
    const { revealed, expected } = playRoundOne();
    const roundLookup = deferred<{ rows: Array<{ id: number }> }>();
    query.mockImplementation((sql: string) => (String(sql).includes("FROM game_rounds") ? roundLookup.promise : Promise.resolve({ rows: [] })));

    const pending = persistRoundResponses(revealed, SESSION_ID);
    startNextRound(ROOM, { startAt: Date.now() });
    recordAnswer(ROOM, 2, "Song Two", 3, "Song Two", "Artist Two");
    roundLookup.resolve({ rows: [{ id: ROUND1_ROW_ID }] });
    await pending;

    expect(insertedRows()).toEqual(expected);
  });

  it("morceau partage : deviner n'importe lequel de ses importeurs presents est juste", async () => {
    clearGame(ROOM);
    bootstrapGameState({
      roomCode: ROOM,
      hostUserId: 1,
      tracks: [{ ...tracks[0], metadata: { owner_user_id: 2, owner_user_ids: [2, 3] } }],
      participants: [
        { userId: 1, username: "Hote" },
        { userId: 2, username: "Bea" },
        { userId: 3, username: "Chloe" },
      ],
      sessionId: SESSION_ID,
    });
    startNextRound(ROOM, { startAt: Date.now() - 4000 });
    recordAnswer(ROOM, 1, "", 3, "", "");
    recordAnswer(ROOM, 2, "", 1, "", "");
    recordAnswer(ROOM, 3, "", 2, "", "");
    const revealed = revealRound(ROOM)!;
    query.mockImplementation(async (sql: string) => (String(sql).includes("FROM game_rounds") ? { rows: [{ id: ROUND1_ROW_ID }] } : { rows: [] }));

    await persistRoundResponses(revealed, SESSION_ID);

    expect(insertedRows().map(r => [r.userId, r.sourceGuess, r.sourceOwner, r.sourceCorrect])).toEqual([
      [1, 3, 2, true],
      [2, 1, 2, false],
      [3, 2, 2, true],
    ]);
  });
});

describe("persistGameResults", () => {
  // Meme piege, sur la fin de partie : broadcastGameOver passe l'objet VIVANT
  // (gameStateSnapshot ne copie qu'en phase GUESSING). Rien ne le modifie en
  // phase FINISHED aujourd'hui, mais l'ecriture ne doit pas en dependre.
  it("ecrit les scores tels qu'au game over, meme si l'etat bouge pendant l'ecriture", async () => {
    const { revealed } = playRoundOne();
    const final = Object.values(revealed.players).map(p => ({ userId: p.userId, score: p.score, correct: p.correct }))
    const first = deferred<{ rows: [] }>();
    let calls = 0;
    query.mockImplementation(() => (calls++ === 0 ? first.promise : Promise.resolve({ rows: [] })));

    const pending = persistGameResults(revealed, SESSION_ID);
    for (const p of Object.values(revealed.players)) { p.score += 100; p.correct += 5; }
    revealed.totalRounds = 99;
    first.resolve({ rows: [] });
    await pending;

    const participantUpdates = query.mock.calls
      .filter(([sql]) => String(sql).includes("UPDATE game_participants"))
      .map(([, p]) => ({ userId: p[1], score: p[2] }))
      .sort((a, b) => a.userId - b.userId);
    expect(participantUpdates).toEqual(final.map(f => ({ userId: f.userId, score: f.score })).sort((a, b) => a.userId - b.userId));
    const stats = query.mock.calls
      .filter(([sql]) => String(sql).includes("INSERT INTO user_stats"))
      .map(([, p]) => ({ userId: p[0], correct: p[1] }))
      .sort((a, b) => a.userId - b.userId);
    expect(stats).toEqual(final.map(f => ({ userId: f.userId, correct: f.correct })).sort((a, b) => a.userId - b.userId));
    const session = query.mock.calls.find(([sql]) => String(sql).includes("UPDATE game_sessions"));
    expect(session?.[1]).toEqual([SESSION_ID, 2]);
  });

  it("ne leve jamais d'erreur : un echec de la base est seulement journalise", async () => {
    const { revealed } = playRoundOne();
    query.mockRejectedValue(new Error("base indisponible"));
    await expect(persistGameResults(revealed, SESSION_ID)).resolves.toBeUndefined();
    await expect(persistRoundResponses(revealed, SESSION_ID)).resolves.toBeUndefined();
  });

  it("ne fait rien sans session en base", async () => {
    const { revealed } = playRoundOne();
    await persistGameResults(revealed, undefined);
    await persistRoundResponses(revealed, undefined);
    expect(query).not.toHaveBeenCalled();
  });
});
