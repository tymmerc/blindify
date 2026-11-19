// Reprise des parties apres un redemarrage (ADR-001, etape 5).
// - Avec le Redis de test : relecture des copies, controle d'identite en base
//   (simulee), parties recreees avec les heures decalees, copies refusees supprimees.
// - Sans Redis, avec de faux minuteurs : le temps perdu est rendu, la manche
//   coupee ne compte personne absent, et rien n'est ecrit deux fois en base.
import type { Server } from "socket.io";
import Redis from "ioredis";

const runningSessions = new Set<number>();
const claimedSessions = new Set<number>();
const queries: Array<{ sql: string; params: unknown[] }> = [];

jest.mock("../../src/config/db", () => {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes("FROM multiplayer_rooms r")) {
      const ok = runningSessions.has(Number(params[2]));
      return { rows: ok ? [{ "?column?": 1 }] : [], rowCount: ok ? 1 : 0 };
    }
    if (sql.includes("UPDATE game_sessions") && sql.includes("RETURNING id")) {
      const id = Number(params[0]);
      if (claimedSessions.has(id)) return { rows: [], rowCount: 0 };
      claimedSessions.add(id);
      return { rows: [{ id }], rowCount: 1 };
    }
    if (sql.includes("FROM game_rounds")) return { rows: [{ id: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  // La fin de partie passe par une transaction sur un client dedie.
  return { pool: { query, connect: jest.fn(async () => ({ query, release: jest.fn() })) } };
});

import { closeRedis, connectRedis, gameStateKey, setGameState } from "../../src/config/redis";
import { deserializeGame } from "../../src/services/gameBackup";
import { persistGameResults } from "../../src/services/gamePersistence";
import { restoreGames } from "../../src/services/gameRestore";
import {
  RESTART_GRACE_MS,
  backupSnapshot,
  bootstrapGameState,
  clearGame,
  gameBackupsSettled,
  getGameState,
  nextRevealStep,
  pauseGame,
  recordAnswer,
  restoreGame,
  revealRound,
  startNextRound,
  type RoundTrack,
} from "../../src/services/realtimeGame";
import { advanceRevealStep, rescheduleAfterResume, stopGameTimers } from "../../src/services/realtimeOrchestrator";
import { ROUND_PACING } from "../../src/services/roundPacing";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const describeWithRedis = TEST_REDIS_URL ? describe : describe.skip;
const ROUND_MS = 20_000;

function fakeIo(): Server {
  return {
    to: () => ({ emit: () => undefined }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
  } as unknown as Server;
}

function tracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

let seq = 0;

/**
 * Une partie a 3 joueurs en memoire, menee jusqu'a `phase` de la manche
 * `round`, puis serialisee comme le ferait la copie de secours, et retiree de
 * la memoire (le serveur « meurt »). Le joueur 1 a repondu juste, pas les autres.
 */
function savedGame(opts: { phase: "GUESSING" | "REVEAL"; round?: number; rounds?: number; paused?: boolean; savedAt: number; sessionId: number }) {
  const roomCode = `RS${process.pid % 1000}${++seq}`;
  bootstrapGameState({
    roomCode,
    hostUserId: 1,
    tracks: tracks(opts.rounds ?? 3),
    participants: [1, 2, 3].map(id => ({ userId: id, username: `P${id}` })),
    config: { roundDurationMs: ROUND_MS },
    sessionId: opts.sessionId,
    roomId: 500 + seq,
  });
  const target = opts.round ?? 1;
  for (let r = 1; r <= target; r++) {
    startNextRound(roomCode, { startAt: opts.savedAt - 5_000 });
    recordAnswer(roomCode, 1, `Song ${r}`, null, `Song ${r}`, `Artist ${r}`);
    if (r < target || opts.phase === "REVEAL") revealRound(roomCode);
    if (r < target && nextRevealStep(roomCode) === "scores") nextRevealStep(roomCode);
  }
  if (opts.paused) pauseGame(roomCode, opts.savedAt - 1_000);
  const json = backupSnapshot(roomCode, opts.savedAt)!;
  clearGame(roomCode);
  return { roomCode, json, before: deserializeGame(json)! };
}

describeWithRedis("reprise depuis Redis", () => {
  let inspect: Redis;
  const io = fakeIo();

  beforeAll(() => {
    inspect = new Redis(TEST_REDIS_URL!);
  });
  afterAll(async () => {
    await inspect.quit();
  });
  beforeEach(async () => {
    await expect(connectRedis(TEST_REDIS_URL)).resolves.toBe(true);
    runningSessions.clear();
    queries.length = 0;
  });
  afterEach(async () => {
    for (const code of getRestored()) {
      stopGameTimers(code);
      clearGame(code);
    }
    restored.length = 0;
    await gameBackupsSettled();
    await closeRedis();
  });

  const restored: string[] = [];
  const getRestored = () => restored;

  it("reprend les parties en cours, heures decalees et joueurs coupes, et supprime les autres", async () => {
    const savedAt = Date.now() - 20_000;
    const guessing = savedGame({ phase: "GUESSING", savedAt, sessionId: 9001 });
    const reveal = savedGame({ phase: "REVEAL", savedAt, sessionId: 9002 });
    const paused = savedGame({ phase: "GUESSING", paused: true, savedAt, sessionId: 9003 });
    const ended = savedGame({ phase: "GUESSING", savedAt, sessionId: 9004 });
    // Redis lent pendant 20 min : la copie a 3 min de retard sur la partie.
    const stale = savedGame({ phase: "GUESSING", savedAt: Date.now() - 3 * 60_000, sessionId: 9005 });
    runningSessions.add(9001).add(9002).add(9003).add(9005);
    // Les copies de ces parties (creees puis effacees ci-dessus) sont parties.
    await gameBackupsSettled();
    for (const s of [guessing, reveal, paused, ended, stale]) await setGameState(s.roomCode, s.json);
    // Copie d'une autre instance sur le meme Redis (autre prefixe) : jamais vue.
    const otherKey = `blindz:autre-instance:game:state:${guessing.roomCode}X`;
    await inspect.set(otherKey, guessing.json, "EX", 60);
    const v2Code = `RSV2${seq}`;
    await setGameState(v2Code, JSON.stringify({ ...JSON.parse(guessing.json), roomCode: v2Code, v: 2 }));
    const junkCode = `RSJK${seq}`;
    await setGameState(junkCode, "{pas du json");

    const now = Date.now();
    const summary = await restoreGames(io, () => now);
    restored.push(...summary.restored);
    const shift = now - savedAt + RESTART_GRACE_MS;

    expect(summary.restored.sort()).toEqual([guessing.roomCode, reveal.roomCode, paused.roomCode].sort());
    expect(summary.skipped).toEqual(expect.arrayContaining([
      { roomCode: ended.roomCode, reason: "partie_plus_en_cours" },
      { roomCode: stale.roomCode, reason: "copie_trop_ancienne" },
      { roomCode: v2Code, reason: "illisible_ou_version_inconnue" },
      { roomCode: junkCode, reason: "illisible_ou_version_inconnue" },
    ]));
    for (const code of [ended.roomCode, stale.roomCode, v2Code, junkCode]) expect(await inspect.exists(gameStateKey(code))).toBe(0);
    expect(summary.skipped.map(x => x.roomCode)).not.toContain(`${guessing.roomCode}X`);
    expect(await inspect.exists(otherKey)).toBe(1);
    await inspect.del(otherKey);
    // Jamais KEYS : la liste vient de SCAN (aucune requete en base n'en depend).
    // La copie trop ancienne est ecartee avant toute requete en base.
    expect(queries.filter(q => q.sql.includes("FROM multiplayer_rooms r"))).toHaveLength(4);

    const g = getGameState(guessing.roomCode)!;
    const g0 = guessing.before.game.state;
    expect(g.phase).toBe("GUESSING");
    expect(g.timing.revealAt).toBe(g0.timing.revealAt! + shift);
    expect(g.timing.startAt).toBe(g0.timing.startAt! + shift);
    expect(g.players[1].answerAt).toBe(g0.players[1].answerAt! + shift);
    expect(Object.values(g.players).every(p => p.disconnected)).toBe(true);
    expect(g.hostConnected).toBe(false);

    const r = getGameState(reveal.roomCode)!;
    expect(r.phase).toBe("REVEAL");
    expect(r.pacing!.endsAt).toBe(reveal.before.game.state.pacing!.endsAt + shift);

    const p = getGameState(paused.roomCode)!;
    expect(p.paused).toBe(true);
    expect(p.timing.revealAt).toBe(paused.before.game.state.timing.revealAt! + shift);

    // Les copies suivent la memoire : reecrites avec les heures decalees.
    await gameBackupsSettled();
    const rewritten = deserializeGame((await inspect.get(gameStateKey(guessing.roomCode)))!)!;
    expect(rewritten.game.state.timing.revealAt).toBe(g.timing.revealAt);
    expect(rewritten.game.state.players[2].disconnected).toBe(true);
    expect(rewritten.game.restoredRound).toBe(1);
  });
});

describe("reprise : temps rendu, absences, base", () => {
  const io = fakeIo();

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    queries.length = 0;
    claimedSessions.clear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("la manche reprend avec le temps qu'il lui restait, plus la grace de reprise", () => {
    const savedAt = Date.now();
    const saved = savedGame({ phase: "GUESSING", savedAt, sessionId: 1 });
    const left = saved.before.game.state.timing.revealAt! - savedAt;
    // Le serveur reste arrete 40 s.
    jest.setSystemTime(savedAt + 40_000);
    restoreGame(deserializeGame(saved.json)!, Date.now());
    rescheduleAfterResume(io, saved.roomCode);

    jest.advanceTimersByTime(left + RESTART_GRACE_MS - 1);
    expect(getGameState(saved.roomCode)?.phase).toBe("GUESSING");
    jest.advanceTimersByTime(1);
    expect(getGameState(saved.roomCode)?.phase).toBe("REVEAL");

    stopGameTimers(saved.roomCode);
    clearGame(saved.roomCode);
  });

  it("une manche coupee ne compte personne absent ni silencieux", () => {
    const savedAt = Date.now();
    const saved = savedGame({ phase: "GUESSING", savedAt, sessionId: 2 });
    const game = deserializeGame(saved.json)!;
    game.game.missed = { 2: 2, 3: 2 };
    restoreGame(game, savedAt + 1_000);
    revealRound(saved.roomCode);
    const state = getGameState(saved.roomCode)!;
    // A 2 manches ratees, une 3e l'aurait marque absent.
    expect(state.players[2].absent).not.toBe(true);
    expect(state.players[3].absent).not.toBe(true);
    clearGame(saved.roomCode);
  });

  it("l'ecran de reponse reprend avec son temps restant", () => {
    const savedAt = Date.now();
    const saved = savedGame({ phase: "REVEAL", savedAt, sessionId: 3 });
    const left = saved.before.game.state.pacing!.endsAt - savedAt;
    jest.setSystemTime(savedAt + 15_000);
    restoreGame(deserializeGame(saved.json)!, Date.now());
    rescheduleAfterResume(io, saved.roomCode);
    jest.advanceTimersByTime(left + RESTART_GRACE_MS - 1);
    expect(getGameState(saved.roomCode)?.pacing?.step).toBe("answer");
    jest.advanceTimersByTime(1);
    expect(getGameState(saved.roomCode)?.pacing?.step).toBe("scores");
    stopGameTimers(saved.roomCode);
    clearGame(saved.roomCode);
  });

  it("rien n'est ecrit deux fois en base : ni les reponses a la reprise, ni les resultats", async () => {
    const savedAt = Date.now();
    // Copie prise sur l'ecran de reponse de la derniere manche : ses reponses
    // sont deja en base, le serveur est mort avant la fin de partie.
    const saved = savedGame({ phase: "REVEAL", round: 2, rounds: 2, savedAt, sessionId: 77 });
    await Promise.resolve();
    queries.length = 0;
    jest.setSystemTime(savedAt + 10_000);
    restoreGame(deserializeGame(saved.json)!, Date.now());
    rescheduleAfterResume(io, saved.roomCode);
    expect(queries.some(q => q.sql.includes("INSERT INTO round_responses"))).toBe(false);

    // L'ecran de reponse finit : fin de partie, resultats ecrits une fois.
    jest.advanceTimersByTime(ROUND_PACING.answerMs + RESTART_GRACE_MS);
    expect(getGameState(saved.roomCode)?.phase).toBe("FINISHED");
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
    const statsAfterFirst = queries.filter(q => q.sql.includes("INSERT INTO user_stats")).length;
    expect(statsAfterFirst).toBeGreaterThan(0);
    // Une seconde fin de la meme partie (reprise d'une copie restee en route) ne recompte rien.
    await persistGameResults(getGameState(saved.roomCode)!, 77);
    expect(queries.filter(q => q.sql.includes("INSERT INTO user_stats")).length).toBe(statsAfterFirst);
    expect(advanceRevealStep(io, saved.roomCode)).toBe(false);
    stopGameTimers(saved.roomCode);
    clearGame(saved.roomCode);
  });
});
