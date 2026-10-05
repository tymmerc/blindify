/**
 * Grace de reconnexion (decision de Tym du 02/10/2026), de bout en bout sur le
 * vrai serveur socket.io : un joueur coupe du reseau en pleine manche, sans
 * avoir repondu, a quelques secondes pour revenir avant que la manche soit
 * revelee en avance. "Quitter" reste immediat.
 *
 * La grace est raccourcie ici (reconnectGraceMs) pour que la suite reste
 * rapide ; sa vraie valeur (5 s) est verifiee dans
 * tests/services/realtimeGame-grace.spec.ts.
 *
 * Requires Postgres (blindz_test) reachable. See tests/setup.ts.
 */
import {
  startTestServer,
  seedUsers,
  seedRoom,
  seedSession,
  cleanupSession,
  connectClient,
  joinRoom,
  startGame,
  cleanupGame,
  cleanupUsers,
  closePool,
  pool,
  waitFor,
  type TestServer,
  type TestUser,
  type GameClient,
} from "./helpers/socket-test-harness";
import { getGameState } from "../../src/services/realtimeGame";
import { clearRevealTimer } from "../../src/services/realtimeOrchestrator";

jest.setTimeout(30000);

const GRACE = 1_500;
const sleep = (ms: number) => new Promise(r => setTimeout(r, Math.max(0, ms)));

type Ack = { ok: boolean; reason?: string };
type Table = { users: TestUser[]; roomCode: string; clients: GameClient[]; sessionId?: number };
type ResponseRow = { user_id: number; verdict: string | null; guess_title: string | null };

let server: TestServer;

async function openTable(
  players: number,
  opts: { rounds?: number; roundMs?: number; grace?: number; session?: boolean } = {},
): Promise<Table> {
  const users = await seedUsers(players, "G");
  const roomCode = await seedRoom(users);
  const rounds = opts.rounds ?? 2;
  const sessionId = opts.session ? await seedSession(roomCode, users, rounds) : undefined;
  const clients: GameClient[] = [];
  for (const u of users) clients.push(await connectClient(server.port, u));
  await joinRoom(server.io, roomCode, clients);
  startGame(server.io, roomCode, users, rounds, opts.roundMs ?? 20_000, sessionId, {
    reconnectGraceMs: opts.grace ?? GRACE,
  });
  await waitFor(
    () => clients.every(c => c.lastState()?.phase === "GUESSING" && c.lastState()?.currentRound === 1),
    5000,
    "GUESSING round 1",
  );
  return { users, roomCode, clients, sessionId };
}

async function closeTable(t: Table, extra: Array<GameClient | undefined> = []): Promise<void> {
  [...t.clients, ...extra].forEach(c => c?.socket.close());
  cleanupGame(t.roomCode);
  await cleanupSession(t.sessionId);
  await cleanupUsers(t.users);
}

function answer(c: GameClient, roomCode: string, round: number): Promise<Ack> {
  return c.socket
    .timeout(4000)
    .emitWithAck("game:answer", { roomCode, guessTitle: `Title ${round}`, guessArtist: `Artist ${round}`, round });
}

async function answerAll(clients: GameClient[], roomCode: string, round: number): Promise<void> {
  const acks = await Promise.all(clients.map(c => answer(c, roomCode, round)));
  expect(acks.every(a => a.ok)).toBe(true);
}

/** Heure d'arrivee de chaque revelation chez ce client (meme machine que le serveur). */
function revealClock(c: GameClient): Map<number, number> {
  const at = new Map<number, number>();
  c.socket.on("game:round:reveal", (p: { round: number }) => {
    if (!at.has(p.round)) at.set(p.round, Date.now());
  });
  return at;
}

const inPhase = (clients: GameClient[], phase: string) => () =>
  clients.every(c => c.lastState()?.phase === phase);

async function responsesFor(sessionId: number, round: number, expected: number): Promise<ResponseRow[]> {
  const read = async () => {
    const { rows } = await pool.query<ResponseRow>(
      `SELECT rr.user_id, rr.verdict, rr.guess_title FROM round_responses rr
       JOIN game_rounds gr ON gr.id = rr.round_id WHERE gr.session_id = $1 AND gr.round_index = $2`,
      [sessionId, round],
    );
    return rows;
  };
  // Ecriture lancee sans attendre a la revelation : on attend l'etat reel de la base.
  for (const deadline = Date.now() + 3000; Date.now() < deadline; ) {
    const rows = await read();
    if (rows.length >= expected) return rows;
    await sleep(100);
  }
  return read();
}

describe("grace de reconnexion apres une coupure reseau", () => {
  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
    await closePool();
  });

  it("attend la fin de la grace quand le dernier joueur sans reponse coupe, puis revele, ecrit la manche et finit la partie", async () => {
    const t = await openTable(3, { rounds: 1, session: true });
    const [a, b, late] = t.clients;
    const clock = revealClock(a);
    try {
      await answerAll([a, b], t.roomCode, 1);
      const dropAt = Date.now();
      late.socket.close();

      await sleep(GRACE / 2);
      expect(a.lastState()?.phase).toBe("GUESSING");
      expect(a.reveals).toHaveLength(0);

      await waitFor(inPhase([a, b], "REVEAL"), GRACE + 3000, "REVEAL after the grace");
      expect((clock.get(1) ?? 0) - dropAt).toBeGreaterThanOrEqual(GRACE - 50);
      for (const c of [a, b]) expect(c.reveals.filter(r => r.round === 1)).toHaveLength(1);

      // Derniere manche : les presents cliquent "pret", la partie se termine.
      for (const c of [a, b]) c.socket.emit("game:ready", { roomCode: t.roomCode });
      await waitFor(() => [a, b].every(c => c.gameOver !== null), 5000, "game over");

      // Une ligne par joueur, celle du joueur parti comprise (vide).
      const rows = await responsesFor(t.sessionId ?? 0, 1, 3);
      expect(rows).toHaveLength(3);
      expect(rows.find(r => r.user_id === late.user.id)?.guess_title ?? null).toBeNull();
      expect(rows.find(r => r.user_id === a.user.id)?.verdict).toBe("correct");
    } finally {
      await closeTable(t);
    }
  });

  it("un joueur revenu pendant la grace peut encore repondre : la manche continue et sa reponse compte", async () => {
    const t = await openTable(3, { session: true });
    const [a, b, late] = t.clients;
    let back: GameClient | undefined;
    try {
      await answerAll([a, b], t.roomCode, 1);
      const dropAt = Date.now();
      late.socket.close();

      await sleep(GRACE / 3);
      const rejoined = await connectClient(server.port, late.user);
      back = rejoined;
      rejoined.socket.emit("room:join", { roomCode: t.roomCode });
      await waitFor(() => rejoined.states.length >= 1, 5000, "state after rejoin");

      // Bien apres la fin de sa grace : il est revenu, la manche l'attend.
      await sleep(dropAt + GRACE + 500 - Date.now());
      expect(a.lastState()?.phase).toBe("GUESSING");
      expect(a.reveals).toHaveLength(0);

      expect((await answer(rejoined, t.roomCode, 1)).ok).toBe(true);
      await waitFor(inPhase([a, b, rejoined], "REVEAL"), 5000, "REVEAL after his answer");
      const seen = rejoined.reveals.find(r => r.round === 1);
      expect(seen?.players?.[late.user.id]?.lastVerdict).toBe("correct");

      const rows = await responsesFor(t.sessionId ?? 0, 1, 3);
      expect(rows.find(r => r.user_id === late.user.id)?.verdict).toBe("correct");
    } finally {
      await closeTable(t, [back]);
    }
  });

  it("le minuteur de manche qui finit pendant la grace revele a l'heure, une seule fois", async () => {
    const t = await openTable(3, { roundMs: 1_500, grace: 4_000 });
    const [a, b, late] = t.clients;
    const clock = revealClock(a);
    try {
      const revealAt = Number(a.roundStarts[0]?.timing?.revealAt);
      await answerAll([a, b], t.roomCode, 1);
      const dropAt = Date.now();
      late.socket.close();

      await waitFor(inPhase([a, b], "REVEAL"), 6000, "REVEAL by the round timer");
      // A l'heure du minuteur de manche : ni a la coupure, ni a la fin de la grace.
      expect(clock.get(1) ?? 0).toBeGreaterThanOrEqual(revealAt - 50);
      expect((clock.get(1) ?? 0) - dropAt).toBeLessThan(4_000);

      await sleep(dropAt + 4_000 + 500 - Date.now());
      for (const c of [a, b]) {
        expect(c.reveals.filter(r => r.round === 1)).toHaveLength(1);
        expect(c.lastState()?.currentRound).toBe(1);
      }
    } finally {
      await closeTable(t);
    }
  });

  it("pause de l'hote pendant la grace : aucune revelation en pause, elle part a la reprise", async () => {
    const t = await openTable(3, { grace: 1_000 });
    const [host, b, late] = t.clients;
    try {
      await answerAll([host, b], t.roomCode, 1);
      late.socket.close();
      host.socket.emit("game:pause", { roomCode: t.roomCode });
      await waitFor(() => host.lastState()?.paused === true, 5000, "paused");

      // La grace (1 s) finit pendant la pause.
      await sleep(2_000);
      for (const c of [host, b]) {
        expect(c.lastState()?.phase).toBe("GUESSING");
        expect(c.lastState()?.paused).toBe(true);
        expect(c.reveals).toHaveLength(0);
      }

      host.socket.emit("game:resume", { roomCode: t.roomCode });
      await waitFor(
        () => [host, b].every(c => c.lastState()?.phase === "REVEAL" && c.lastState()?.paused !== true),
        5000,
        "REVEAL at resume",
      );
      expect(host.lastState()?.currentRound).toBe(1);
    } finally {
      await closeTable(t);
    }
  });

  it("plusieurs coupures : la revelation attend la fin de la derniere grace", async () => {
    const t = await openTable(4);
    const [a, b, c3, d4] = t.clients;
    const clock = revealClock(a);
    try {
      await answerAll([a, b], t.roomCode, 1);
      const firstDrop = Date.now();
      c3.socket.close();
      await sleep(1_000);
      const lastDrop = Date.now();
      d4.socket.close();

      // La grace du premier est finie, pas celle du second.
      await sleep(firstDrop + GRACE + 300 - Date.now());
      expect(a.lastState()?.phase).toBe("GUESSING");

      await waitFor(inPhase([a, b], "REVEAL"), GRACE + 3000, "REVEAL after the last grace");
      expect((clock.get(1) ?? 0) - lastDrop).toBeGreaterThanOrEqual(GRACE - 50);
    } finally {
      await closeTable(t);
    }
  });

  it("un joueur qui avait deja repondu ne retient pas la manche quand il coupe", async () => {
    const t = await openTable(3, { grace: 4_000 });
    const [a, b, early] = t.clients;
    const clock = revealClock(a);
    try {
      await answerAll([a, early], t.roomCode, 1);
      early.socket.close();
      await waitFor(() => server.io.sockets.adapter.rooms.get(t.roomCode)?.size === 2, 5000, "server sees the drop");
      expect(a.lastState()?.phase).toBe("GUESSING");

      const lastAnswerAt = Date.now();
      await answerAll([b], t.roomCode, 1);
      await waitFor(inPhase([a, b], "REVEAL"), 2000, "immediate REVEAL");
      expect((clock.get(1) ?? 0) - lastAnswerAt).toBeLessThan(1_000);
    } finally {
      await closeTable(t);
    }
  });

  it("revenu puis recoupe : une grace neuve part de la seconde coupure", async () => {
    const t = await openTable(3);
    const [a, b, late] = t.clients;
    const clock = revealClock(a);
    let back: GameClient | undefined;
    try {
      await answerAll([a, b], t.roomCode, 1);
      const firstDrop = Date.now();
      late.socket.close();

      await sleep(300);
      const rejoined = await connectClient(server.port, late.user);
      back = rejoined;
      rejoined.socket.emit("room:join", { roomCode: t.roomCode });
      await waitFor(() => rejoined.states.length >= 1, 5000, "state after rejoin");
      await sleep(firstDrop + 1_000 - Date.now());
      const secondDrop = Date.now();
      rejoined.socket.close();

      // La premiere grace est finie, la seconde court encore.
      await sleep(firstDrop + GRACE + 300 - Date.now());
      expect(a.lastState()?.phase).toBe("GUESSING");

      await waitFor(inPhase([a, b], "REVEAL"), GRACE + 3000, "REVEAL after the second grace");
      expect((clock.get(1) ?? 0) - secondDrop).toBeGreaterThanOrEqual(GRACE - 50);
    } finally {
      await closeTable(t, [back]);
    }
  });

  it("\"Quitter\" garde la revelation immediate, sans grace, et le joueur reste au classement", async () => {
    const t = await openTable(3, { grace: 4_000 });
    const [a, b, leaver] = t.clients;
    try {
      await answerAll([a, b], t.roomCode, 1);
      // Comme le client web (handleLeaveRoom) : room:leave puis game:leave, socket ouvert.
      leaver.socket.emit("room:leave", { roomCode: t.roomCode });
      leaver.socket.emit("game:leave", { roomCode: t.roomCode });

      await waitFor(inPhase([a, b], "REVEAL"), 1_500, "immediate REVEAL after Quitter");
      expect(Object.keys(a.lastState()?.players ?? {})).toContain(String(leaver.user.id));
    } finally {
      await closeTable(t);
    }
  });

  it("l'ancien socket d'un joueur deja revenu peut mourir sans le faire partir", async () => {
    // Coupure reseau franche cote telephone : le client revient sur un nouveau
    // socket, et le serveur ne voit mourir l'ancien que plus tard.
    const t = await openTable(3, { grace: 1_000 });
    const [a, b, late] = t.clients;
    let fresh: GameClient | undefined;
    try {
      await answerAll([a, b], t.roomCode, 1);
      const second = await connectClient(server.port, late.user);
      fresh = second;
      second.socket.emit("room:join", { roomCode: t.roomCode });
      await waitFor(() => second.states.length >= 1, 5000, "second socket joined");

      late.socket.close();
      await sleep(1_000 + 700);
      expect(a.lastState()?.phase).toBe("GUESSING");
      expect(getGameState(t.roomCode)?.players[late.user.id]?.disconnected).toBeFalsy();

      expect((await answer(second, t.roomCode, 1)).ok).toBe(true);
      await waitFor(inPhase([a, b, second], "REVEAL"), 5000, "REVEAL after his answer");
    } finally {
      await closeTable(t, [fresh]);
    }
  });

  it("game:sync qui revele une manche en retard ecrit ses reponses et ne revele qu'une fois", async () => {
    const t = await openTable(3, { roundMs: 1_000, session: true });
    const [a, b] = t.clients;
    try {
      const revealAt = Number(a.roundStarts[0]?.timing?.revealAt);
      // Minuteur de manche perdu : c'est le cas que le filet game:sync rattrape.
      clearRevealTimer(t.roomCode);
      await answerAll([a, b], t.roomCode, 1);
      await sleep(revealAt + 300 - Date.now());
      expect(a.lastState()?.phase).toBe("GUESSING");

      a.socket.emit("game:sync", { roomCode: t.roomCode });
      await waitFor(inPhase(t.clients, "REVEAL"), 3000, "REVEAL through game:sync");

      const rows = await responsesFor(t.sessionId ?? 0, 1, 3);
      expect(rows).toHaveLength(3);
      for (const c of t.clients) expect(c.reveals.filter(r => r.round === 1)).toHaveLength(1);
    } finally {
      await closeTable(t);
    }
  });
});
