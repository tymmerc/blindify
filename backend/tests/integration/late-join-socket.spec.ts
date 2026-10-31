/**
 * Arrivee en cours de partie (T19) sur le vrai serveur socket.io, partie de
 * 3 manches, 3 joueurs, un retardataire qui entre pendant la manche 2 :
 *
 * - il recoit les trames de la salle, caviardees : aucune reponse avant son
 *   reveal, jamais (contrat anti-triche) ;
 * - les autres le voient arriver (game:waiting) ;
 * - sa reponse de la manche 2 est refusee ("waiting"), il ne retient pas la
 *   revelation anticipee ;
 * - il joue la manche 3, et son score est ecrit dans game_participants ;
 * - il peut ecrire dans le chat ;
 * - il n'est pas compte dans « 👀 N spectateurs ».
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
  type GameClient,
} from "./helpers/socket-test-harness";
import { getGameState } from "../../src/services/realtimeGame";

jest.setTimeout(30000);

const ROUNDS = 3;
type Payload = Record<string, unknown>;
type Frame = { event: string; payload: Payload };

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await closePool();
});

function recordAll(c: GameClient): Frame[] {
  const frames: Frame[] = [];
  c.socket.onAny((event: string, payload: Payload) => frames.push({ event, payload }));
  return frames;
}

async function addParticipant(roomCode: string, userId: number): Promise<void> {
  // Ce que fait POST /rooms/:code/join (REST) avant le room:join du socket.
  await pool.query(
    `INSERT INTO room_participants (room_id, user_id)
     SELECT id, $2 FROM multiplayer_rooms WHERE room_code=$1
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [roomCode, userId],
  );
}

function answerAll(clients: GameClient[], roomCode: string, round: number): void {
  for (const c of clients) {
    c.socket.emit("game:answer", { roomCode, guessTitle: `Title ${round}`, guessArtist: `Artist ${round}`, round });
  }
}

function readyAll(clients: GameClient[], roomCode: string): void {
  for (const c of clients) c.socket.emit("game:ready", { roomCode });
}

/**
 * Contrat anti-triche : avant le reveal de la manche N, aucune trame ne porte
 * le titre ni l'artiste de la manche N.
 */
function leakedAnswers(frames: Frame[]): string[] {
  const revealed = new Set<number>();
  const leaks: string[] = [];
  for (const f of frames) {
    // La trame du reveal porte la reponse de SA manche : c'est son role.
    if (f.event === "game:round:reveal") revealed.add(Number(f.payload.round));
    if (f.event === "game:over") for (let r = 1; r <= ROUNDS; r++) revealed.add(r);
    const text = JSON.stringify(f.payload);
    for (let r = 1; r <= ROUNDS; r++) {
      if (revealed.has(r)) continue;
      if (text.includes(`Title ${r}`) || text.includes(`Artist ${r}`)) leaks.push(`${f.event} manche ${r}`);
    }
  }
  return leaks;
}

describe("arrivee en cours de partie", () => {
  it("regarde la manche 2 sans la reponse, joue la 3, score enregistre", async () => {
    const users = await seedUsers(4, "LJ");
    const players = users.slice(0, 3);
    const late = users[3];
    const roomCode = await seedRoom(players, "in_progress");
    const sessionId = await seedSession(roomCode, players, ROUNDS);
    const clients: GameClient[] = [];
    let lateClient: GameClient | undefined;
    try {
      for (const u of players) clients.push(await connectClient(server.port, u));
      const arrivals: Payload[] = [];
      clients[0].socket.on("game:waiting", (p: Payload) => arrivals.push(p));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, players, ROUNDS, 8000, sessionId);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING manche 1");

      answerAll(clients, roomCode, 1);
      await waitFor(() => getGameState(roomCode)?.phase === "REVEAL", 4000, "reveal manche 1");
      readyAll(clients, roomCode);
      await waitFor(() => getGameState(roomCode)?.currentRound === 2, 4000, "manche 2");

      // Le retardataire entre pendant la manche 2.
      await addParticipant(roomCode, late.id);
      lateClient = await connectClient(server.port, late);
      const lateFrames = recordAll(lateClient);
      const spectatorCounts: number[] = [];
      lateClient.socket.on("room:spectators", (p: Payload) => spectatorCounts.push(Number(p.count)));
      lateClient.socket.emit("room:join", { roomCode });
      await waitFor(() => lateClient!.lastState()?.waiting?.length === 1, 3000, "etat avec la liste d'attente");
      await waitFor(() => arrivals.length === 1, 3000, "les autres le voient arriver");
      expect(arrivals[0]).toEqual(expect.objectContaining({ roomCode, userId: late.id }));
      expect(lateClient.lastState().phase).toBe("GUESSING");
      expect(lateClient.lastState().currentTrack.title).toBe("");
      expect(lateClient.lastState().players[late.id]).toBeUndefined();
      expect(spectatorCounts.at(-1)).toBe(0);

      // Sa reponse de la manche 2 est refusee.
      const ack = await new Promise<{ ok: boolean; reason?: string }>(resolve =>
        lateClient!.socket.emit("game:answer", { roomCode, guessTitle: "Title 2", guessArtist: "Artist 2", round: 2 }, resolve),
      );
      expect(ack).toEqual({ ok: false, reason: "waiting" });

      // Il peut parler dans le chat.
      const chat: Payload[] = [];
      clients[1].socket.on("room:chat", (m: Payload) => chat.push(m));
      lateClient.socket.emit("room:chat", { roomCode, message: "salut, j'arrive" });
      await waitFor(() => chat.length === 1, 3000, "chat du retardataire");

      // Les 3 joueurs repondent : la manche 2 est revelee sans l'attendre.
      answerAll(clients, roomCode, 2);
      await waitFor(() => getGameState(roomCode)?.phase === "REVEAL", 4000, "reveal anticipe manche 2");
      expect(getGameState(roomCode)!.players[late.id]).toBeUndefined();

      // Manche 3 : il est joueur, a 0 point.
      readyAll(clients, roomCode);
      await waitFor(() => getGameState(roomCode)?.currentRound === 3, 4000, "manche 3");
      await waitFor(() => lateClient!.lastState()?.players?.[late.id] !== undefined, 3000, "promu dans l'etat diffuse");
      expect(lateClient.lastState().players[late.id].score).toBe(0);
      expect(lateClient.lastState().waiting).toEqual([]);

      answerAll([...clients, lateClient], roomCode, 3);
      await waitFor(() => getGameState(roomCode)?.phase === "REVEAL", 4000, "reveal manche 3");
      expect(getGameState(roomCode)!.players[late.id].score).toBe(2);
      readyAll([...clients, lateClient], roomCode);
      await waitFor(() => lateClient!.gameOver !== null, 4000, "fin de partie");

      // Score ecrit en base, alors qu'aucune ligne n'avait ete posee au lancement.
      let row: { score: number } | undefined;
      for (let i = 0; i < 100 && !row; i++) {
        const { rows } = await pool.query<{ score: number }>(
          `SELECT score FROM game_participants WHERE session_id=$1 AND user_id=$2`,
          [sessionId, late.id],
        );
        row = rows[0];
        if (!row) await new Promise(r => setTimeout(r, 30));
      }
      expect(row?.score).toBe(2);

      // Jamais la reponse avant son reveal, sur tout ce qu'il a recu.
      expect(leakedAnswers(lateFrames)).toEqual([]);
      expect(lateFrames.some(f => f.event === "game:round:reveal" && f.payload.round === 2)).toBe(true);
    } finally {
      lateClient?.socket.close();
      for (const c of clients) c.socket.close();
      cleanupGame(roomCode);
      await cleanupSession(sessionId);
      await cleanupUsers(users);
    }
  });
});
