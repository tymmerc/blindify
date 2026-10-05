/**
 * Fin de partie sur le vrai serveur socket.io : les resultats (scores, stats a
 * vie, room et session soldees) sont ecrits une fois et une seule.
 * Trouve en relecture le 05/10/2026 : quand personne ne cliquait "pret" apres
 * la derniere manche, le filet anti-AFK terminait la partie sans rien ecrire ;
 * et un "pret" tardif sur une partie finie la comptait une deuxieme fois.
 *
 * Requires Postgres (blindz_test) reachable. See tests/setup.ts.
 */
import {
  startTestServer,
  seedUsers,
  seedRoom,
  seedSession,
  connectClient,
  joinRoom,
  startGame,
  cleanupGame,
  cleanupSession,
  cleanupUsers,
  closePool,
  pool,
  waitFor,
  type TestServer,
  type GameClient,
} from "./helpers/socket-test-harness";
import { getGameState } from "../../src/services/realtimeGame";

jest.setTimeout(30000);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await closePool();
});

describe("fin de partie : resultats ecrits une seule fois", () => {
  it("ecrit les resultats quand personne ne clique pret apres la derniere manche, une seule fois", async () => {
    const users = await seedUsers(2);
    const roomCode = await seedRoom(users);
    const sessionId = await seedSession(roomCode, users, 1);
    const clients: GameClient[] = [];

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 1, 8000, sessionId);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING round 1");
      for (const c of clients) {
        c.socket.emit("game:answer", { roomCode, guessTitle: "Title 1", guessArtist: "Artist 1" });
      }
      await waitFor(() => clients.every(c => c.reveals.length >= 1), 5000, "REVEAL round 1");

      // Personne ne clique "pret" : le filet (10 s) termine la partie.
      await waitFor(() => clients.every(c => c.gameOver !== null), 14_000, "game over by the anti-AFK net");

      const persisted = async () => {
        const { rows } = await pool.query(
          `SELECT
             (SELECT state FROM game_sessions WHERE id = $1) AS state,
             (SELECT status FROM multiplayer_rooms WHERE room_code = $3) AS room_status,
             (SELECT COALESCE(SUM(total_games), 0)::int FROM user_stats WHERE user_id = ANY($2::int[])) AS games`,
          [sessionId, users.map(u => u.id), roomCode],
        );
        return rows[0] as { state: string; room_status: string; games: number };
      };
      // Ecriture en tache de fond : la session et la room sont soldees APRES les
      // stats des joueurs, on attend donc les trois (sur CI, games arrivait a 2
      // avant que la session soit passee a finished).
      const done = (p: { state: string; room_status: string; games: number }) =>
        p.state === "finished" && p.room_status === "finished" && p.games >= 2;
      for (const deadline = Date.now() + 5000; Date.now() < deadline && !done(await persisted()); ) {
        await sleep(100);
      }
      expect(await persisted()).toEqual({ state: "finished", room_status: "finished", games: 2 });

      // Un "pret" tardif sur la partie finie n'ecrit rien de plus.
      clients[0].socket.emit("game:ready", { roomCode });
      await sleep(500);
      expect((await persisted()).games).toBe(2);
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupSession(sessionId);
      await cleanupUsers(users);
    }
  });

  it("un pret tardif, apres le garde de 10 s, ne compte pas la partie une deuxieme fois", async () => {
    // L'etat FINISHED reste une minute en memoire (ecran de resultats), le garde
    // anti double fin de partie (finishedRooms) seulement 10 s : un game:ready
    // dans cet intervalle repassait par la fin de partie et rajoutait une
    // partie et l'XP a chaque joueur dans user_stats.
    const users = await seedUsers(2);
    const roomCode = await seedRoom(users);
    const sessionId = await seedSession(roomCode, users, 1);
    const clients: GameClient[] = [];
    const totalGames = async () =>
      (await pool.query(
        `SELECT COALESCE(SUM(total_games), 0)::int AS n FROM user_stats WHERE user_id = ANY($1::int[])`,
        [users.map(u => u.id)],
      )).rows[0].n as number;

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 1, 8000, sessionId);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING round 1");
      for (const c of clients) {
        c.socket.emit("game:answer", { roomCode, guessTitle: "Title 1", guessArtist: "Artist 1" });
      }
      await waitFor(() => clients.every(c => c.reveals.length >= 1), 5000, "REVEAL round 1");
      for (const c of clients) c.socket.emit("game:ready", { roomCode });
      await waitFor(() => clients.every(c => c.gameOver !== null), 5000, "game over");
      for (const deadline = Date.now() + 5000; Date.now() < deadline && (await totalGames()) < 2; ) {
        await sleep(100);
      }
      expect(await totalGames()).toBe(2);

      await sleep(10_500);
      expect(getGameState(roomCode)?.phase).toBe("FINISHED");
      clients[0].socket.emit("game:ready", { roomCode });
      await sleep(500);
      expect(await totalGames()).toBe(2);
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupSession(sessionId);
      await cleanupUsers(users);
    }
  });
});
