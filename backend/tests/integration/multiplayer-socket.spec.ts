/**
 * Full multiplayer socket integration test — the safety net for "N players,
 * no desync". Spins up the REAL socket.io server + game state machine and
 * drives N real clients through complete games, asserting every client's view
 * of the game state stays converged with the server's broadcast.
 *
 * Requires Postgres (blindify_test) reachable. See tests/setup.ts.
 */
import {
  startTestServer,
  seedUsers,
  seedRoom,
  connectClient,
  joinRoom,
  startGame,
  cleanupGame,
  cleanupUsers,
  closePool,
  seedSession,
  cleanupSession,
  pool,
  waitFor,
  type TestServer,
  type TestUser,
  type GameClient,
} from "./helpers/socket-test-harness";

jest.setTimeout(30000);

// ---- convergence helpers ---------------------------------------------------

function scoreMap(players: Record<number, { userId: number; score: number; streak: number }>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of Object.values(players)) out[p.userId] = p.score;
  return out;
}

/** Asserts all clients agree with each other on phase, round and scores. */
function assertConverged(clients: GameClient[], expectedPhase?: string, expectedRound?: number): void {
  const ref = clients[0].lastState();
  expect(ref).toBeDefined();
  if (expectedPhase) expect(ref.phase).toBe(expectedPhase);
  if (expectedRound !== undefined) expect(ref.currentRound).toBe(expectedRound);

  const refScores = scoreMap(ref.players);
  for (const c of clients) {
    const s = c.lastState();
    expect(s).toBeDefined();
    expect(s.phase).toBe(ref.phase);
    expect(s.currentRound).toBe(ref.currentRound);
    expect(s.totalRounds).toBe(ref.totalRounds);
    expect(scoreMap(s.players)).toEqual(refScores);
  }
}

async function allAnswer(clients: GameClient[], roomCode: string, round: number): Promise<void> {
  for (const c of clients) {
    c.socket.emit("game:answer", {
      roomCode,
      guessTitle: `Title ${round}`,
      guessArtist: `Artist ${round}`,
    });
  }
}

async function allReady(clients: GameClient[], roomCode: string): Promise<void> {
  for (const c of clients) c.socket.emit("game:ready", { roomCode });
}

// ---- tests -----------------------------------------------------------------

describe("multiplayer socket integration — N players, no desync", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
    await closePool();
  });

  it("5 players play 3 full rounds, all answer + ready, stay converged the whole game", async () => {
    const users = await seedUsers(5);
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);

      startGame(server.io, roomCode, users, 3, 5000);

      for (let round = 1; round <= 3; round++) {
        // Round started for everyone
        await waitFor(
          () => clients.every(c => c.roundStarts.some(r => r.round === round)),
          5000,
          `round ${round} start on all clients`,
        );
        await waitFor(
          () => clients.every(c => c.lastState()?.phase === "GUESSING" && c.lastState()?.currentRound === round),
          5000,
          `all clients GUESSING round ${round}`,
        );
        assertConverged(clients, "GUESSING", round);

        // Everyone answers → early reveal
        await allAnswer(clients, roomCode, round);
        await waitFor(
          () => clients.every(c => c.reveals.some(r => r.round === round)),
          5000,
          `reveal round ${round} on all clients`,
        );
        await waitFor(
          () => clients.every(c => c.lastState()?.phase === "REVEAL"),
          5000,
          `all clients REVEAL round ${round}`,
        );
        assertConverged(clients, "REVEAL", round);

        // Reveal payload identical across clients
        const revealScores = clients.map(c => scoreMap(c.reveals.find(r => r.round === round).players));
        for (const rs of revealScores) expect(rs).toEqual(revealScores[0]);

        // Everyone ready → advance (or finish after round 3)
        await allReady(clients, roomCode);
      }

      // Game finished, all clients get game:over with identical scores
      await waitFor(() => clients.every(c => c.gameOver !== null), 5000, "game over on all clients");
      const overScores = clients.map(c => scoreMap(c.gameOver.players));
      for (const os of overScores) expect(os).toEqual(overScores[0]);

      // Every player actually scored across the game (proves rounds were played)
      for (const [, score] of Object.entries(overScores[0])) {
        expect(score).toBeGreaterThan(0);
      }
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });

  it("reveal fires via timer when some players never answer, all stay converged", async () => {
    const users = await seedUsers(5);
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);

      // Short round so the reveal timer fires quickly
      startGame(server.io, roomCode, users, 1, 600);

      await waitFor(() => clients.every(c => c.roundStarts.length >= 1), 5000, "round 1 start");

      // Only the first 2 answer; the other 3 stay silent
      await allAnswer(clients.slice(0, 2), roomCode, 1);

      // Timer must still drive everyone to REVEAL
      await waitFor(
        () => clients.every(c => c.lastState()?.phase === "REVEAL"),
        5000,
        "timer-driven reveal reaches all clients",
      );
      assertConverged(clients, "REVEAL", 1);
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });

  it("a disconnected player does not block the round for the other 4", async () => {
    const users = await seedUsers(5);
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);

      startGame(server.io, roomCode, users, 1, 8000); // long round; rely on all-answered, not timer

      await waitFor(() => clients.every(c => c.roundStarts.length >= 1), 5000, "round start");

      // Player 5 drops
      const dropped = clients[4];
      dropped.socket.close();
      const survivors = clients.slice(0, 4);
      await waitFor(
        () => {
          const room = server.io.sockets.adapter.rooms.get(roomCode);
          return !!room && room.size === 4;
        },
        5000,
        "server sees 4 sockets after disconnect",
      );

      // The 4 survivors answer — reveal must trigger without the 5th
      await allAnswer(survivors, roomCode, 1);
      await waitFor(
        () => survivors.every(c => c.lastState()?.phase === "REVEAL"),
        5000,
        "survivors reach REVEAL despite a disconnected player",
      );
      assertConverged(survivors, "REVEAL", 1);
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });

  it("stays converged under concurrency: double-answers, double-readies, interleaved order", async () => {
    const users = await seedUsers(5);
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 3, 5000);

      for (let round = 1; round <= 3; round++) {
        await waitFor(
          () => clients.every(c => c.lastState()?.phase === "GUESSING" && c.lastState()?.currentRound === round),
          5000,
          `GUESSING round ${round}`,
        );

        // Each player fires its answer TWICE (double-submit) in shuffled order.
        // The recordAnswer guard must keep only the first; reveal must fire once.
        const order = [...clients].sort((a, b) => (a.user.id % 2) - (b.user.id % 2));
        for (const c of order) {
          c.socket.emit("game:answer", { roomCode, guessTitle: `Title ${round}`, guessArtist: `Artist ${round}` });
          c.socket.emit("game:answer", { roomCode, guessTitle: "DUPLICATE", guessArtist: "DUPLICATE" });
        }

        await waitFor(() => clients.every(c => c.lastState()?.phase === "REVEAL"), 5000, `REVEAL round ${round}`);
        assertConverged(clients, "REVEAL", round);

        // Exactly one reveal event per round per client (no double reveal).
        for (const c of clients) {
          expect(c.reveals.filter(r => r.round === round)).toHaveLength(1);
        }

        // Everyone readies TWICE in shuffled order.
        const readyOrder = [...clients].reverse();
        for (const c of readyOrder) {
          c.socket.emit("game:ready", { roomCode });
          c.socket.emit("game:ready", { roomCode });
        }
      }

      await waitFor(() => clients.every(c => c.gameOver !== null), 5000, "game over");
      // The room advanced exactly 3 rounds — no round was skipped or repeated.
      for (const c of clients) {
        expect(c.roundStarts.map(r => r.round).filter(r => r === 1)).toHaveLength(1);
        expect(new Set(c.reveals.map(r => r.round))).toEqual(new Set([1, 2, 3]));
      }
      const overScores = clients.map(c => scoreMap(c.gameOver.players));
      for (const os of overScores) expect(os).toEqual(overScores[0]);
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });

  it("persists final scores, round responses and finished state to the DB", async () => {
    const users = await seedUsers(3);
    const roomCode = await seedRoom(users);
    const sessionId = await seedSession(roomCode, users, 2);
    const clients: GameClient[] = [];

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 2, 5000, sessionId);

      for (let round = 1; round <= 2; round++) {
        await waitFor(
          () => clients.every(c => c.lastState()?.phase === "GUESSING" && c.lastState()?.currentRound === round),
          5000,
          `GUESSING round ${round}`,
        );
        await allAnswer(clients, roomCode, round);
        await waitFor(() => clients.every(c => c.lastState()?.phase === "REVEAL"), 5000, `REVEAL round ${round}`);
        await allReady(clients, roomCode);
      }

      await waitFor(() => clients.every(c => c.gameOver !== null), 5000, "game over");
      // Persistence is fire-and-forget; give the async writes a beat to land.
      await new Promise(r => setTimeout(r, 500));

      // 1. Session flipped to finished
      const sess = await pool.query(`SELECT state, ended_at FROM game_sessions WHERE id = $1`, [sessionId]);
      expect(sess.rows[0].state).toBe("finished");
      expect(sess.rows[0].ended_at).not.toBeNull();

      // 2. Final participant scores match what clients saw at game over
      const finalScores = scoreMap(clients[0].gameOver.players);
      const parts = await pool.query(`SELECT user_id, score FROM game_participants WHERE session_id = $1`, [sessionId]);
      expect(parts.rows.length).toBe(3);
      for (const row of parts.rows) {
        expect(row.score).toBe(finalScores[row.user_id]);
        expect(row.score).toBeGreaterThan(0);
      }

      // 3. Round responses written for every player in both rounds
      const resp = await pool.query(
        `SELECT COUNT(*)::int AS n FROM round_responses rr
         JOIN game_rounds gr ON gr.id = rr.round_id WHERE gr.session_id = $1`,
        [sessionId],
      );
      expect(resp.rows[0].n).toBe(3 * 2); // 3 players × 2 rounds

      // 4. Lifetime stats incremented
      const stats = await pool.query(
        `SELECT COUNT(*)::int AS n FROM user_stats WHERE user_id = ANY($1::int[]) AND total_games >= 1`,
        [users.map(u => u.id)],
      );
      expect(stats.rows[0].n).toBe(3);
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupSession(sessionId);
      await cleanupUsers(users);
    }
  });

  it("a reconnecting player receives the current game state", async () => {
    const users = await seedUsers(3);
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 2, 8000);
      await waitFor(() => clients.every(c => c.roundStarts.length >= 1), 5000, "round 1 start");

      // Player 3 reconnects with a fresh socket and re-joins
      clients[2].socket.close();
      await waitFor(() => {
        const room = server.io.sockets.adapter.rooms.get(roomCode);
        return !!room && room.size === 2;
      }, 5000, "server sees 2 sockets");

      const rejoined = await connectClient(server.port, users[2]);
      rejoined.socket.emit("room:join", { roomCode });

      await waitFor(() => rejoined.states.length >= 1, 5000, "rejoined client received state");
      const st = rejoined.lastState();
      expect(st.roomCode).toBe(roomCode);
      expect(st.currentRound).toBe(1);
      expect(Object.keys(st.players)).toHaveLength(3);

      rejoined.socket.close();
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });
});
