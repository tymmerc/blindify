/**
 * game:sync sur le vrai serveur socket.io : la resynchro d'un client (onglet
 * recharge, coupure reseau, filets anti-gel) est reservee aux membres de la
 * salle. Trouve en relecture le 05/10/2026 : le handler faisait socket.join
 * sans controle, n'importe quel compte qui connaissait le code d'une partie
 * en cours recevait ses reveals (reponse complete, scores) et pouvait forcer
 * un reveal ou solder la room.
 *
 * Requires Postgres (blindz_test) reachable. See tests/setup.ts.
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
  pool,
  waitFor,
  type TestServer,
  type GameClient,
} from "./helpers/socket-test-harness";
import { clearRevealTimer } from "../../src/services/realtimeOrchestrator";
import { getGameState } from "../../src/services/realtimeGame";

jest.setTimeout(30000);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Tous les evenements de partie recus par un client, game:lost compris. */
function eventCount(c: GameClient, lost: unknown[]): number {
  return c.states.length + c.reveals.length + c.roundStarts.length + (c.gameOver ? 1 : 0) + lost.length;
}

function inIoRoom(server: TestServer, roomCode: string, c: GameClient): boolean {
  return server.io.sockets.adapter.rooms.get(roomCode)?.has(c.socket.id as string) === true;
}

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await closePool();
});

describe("game:sync : reserve aux membres de la salle", () => {
  it("un compte hors de la salle ne rejoint pas la partie et ne recoit rien", async () => {
    const users = await seedUsers(2);
    const [outsiderUser] = await seedUsers(1, "X");
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];
    let outsider: GameClient | undefined;

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 2, 8000);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING round 1");

      outsider = await connectClient(server.port, outsiderUser);
      const lost: unknown[] = [];
      outsider.socket.on("game:lost", (p: unknown) => lost.push(p));
      outsider.socket.emit("game:sync", { roomCode });
      await sleep(300);
      expect(inIoRoom(server, roomCode, outsider)).toBe(false);

      // Les membres revelent la manche : le reveal porte la reponse complete,
      // il ne doit arriver qu'aux membres.
      for (const c of clients) {
        c.socket.emit("game:answer", { roomCode, guessTitle: "Title 1", guessArtist: "Artist 1" });
      }
      await waitFor(() => clients.every(c => c.reveals.length >= 1), 5000, "members got the reveal");
      expect(clients[0].reveals[0].track.title).toBe("Title 1");
      await sleep(200);

      expect(eventCount(outsider, lost)).toBe(0);
    } finally {
      outsider?.socket.close();
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers([...users, outsiderUser]);
    }
  });

  it("un compte hors de la salle ne peut pas forcer le reveal, un membre si", async () => {
    const users = await seedUsers(2);
    const [outsiderUser] = await seedUsers(1, "X");
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];
    let outsider: GameClient | undefined;

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 2, 400);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING round 1");
      // Minuteur de reveal perdu : la manche reste en GUESSING apres l'heure,
      // seul game:sync peut la debloquer (c'est son role de filet).
      clearRevealTimer(roomCode);
      const revealAt = getGameState(roomCode)?.timing.revealAt ?? 0;
      await waitFor(() => Date.now() > revealAt + 100, 5000, "revealAt passed");

      outsider = await connectClient(server.port, outsiderUser);
      outsider.socket.emit("game:sync", { roomCode });
      await sleep(300);
      expect(getGameState(roomCode)?.phase).toBe("GUESSING");
      expect(clients.every(c => c.reveals.length === 0)).toBe(true);
      expect(outsider.reveals).toHaveLength(0);

      // Le meme filet, declenche par un membre, revele bien la manche.
      clients[1].socket.emit("game:sync", { roomCode });
      await waitFor(() => clients.every(c => c.reveals.length >= 1), 5000, "member sync forced the reveal");
      expect(getGameState(roomCode)?.phase).toBe("REVEAL");
      expect(outsider.reveals).toHaveLength(0);
    } finally {
      outsider?.socket.close();
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers([...users, outsiderUser]);
    }
  });

  it("un compte hors de la salle ne peut pas declarer la partie perdue", async () => {
    // Backend redemarre en pleine partie : plus d'etat memoire, la room est
    // encore in_progress en base. Seul un membre peut la solder.
    const users = await seedUsers(2);
    const [outsiderUser] = await seedUsers(1, "X");
    const roomCode = await seedRoom(users, "in_progress");
    await pool.query(
      `UPDATE multiplayer_rooms SET started_at = NOW() - INTERVAL '5 minutes' WHERE room_code = $1`,
      [roomCode],
    );
    const roomStatus = async () =>
      (await pool.query(`SELECT status FROM multiplayer_rooms WHERE room_code = $1`, [roomCode])).rows[0].status;
    let outsider: GameClient | undefined;
    let member: GameClient | undefined;

    try {
      outsider = await connectClient(server.port, outsiderUser);
      const outsiderLost: unknown[] = [];
      outsider.socket.on("game:lost", (p: unknown) => outsiderLost.push(p));
      outsider.socket.emit("game:sync", { roomCode });
      await sleep(300);
      expect(await roomStatus()).toBe("in_progress");
      expect(outsiderLost).toHaveLength(0);

      member = await connectClient(server.port, users[1]);
      const memberLost: unknown[] = [];
      member.socket.on("game:lost", (p: unknown) => memberLost.push(p));
      member.socket.emit("game:sync", { roomCode });
      await waitFor(() => memberLost.length === 1, 5000, "member told the game is lost");
      expect(await roomStatus()).toBe("finished");
    } finally {
      outsider?.socket.close();
      member?.socket.close();
      await cleanupUsers([...users, outsiderUser]);
    }
  });

  it("un joueur qui revient (nouvelle socket, game:sync seul) se resynchronise sans voir la reponse", async () => {
    const users = await seedUsers(3);
    const roomCode = await seedRoom(users);
    const clients: GameClient[] = [];
    let back: GameClient | undefined;

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 2, 8000);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING round 1");

      // Coupure reseau du joueur 3, puis retour sur une socket neuve qui
      // n'emet que game:sync (le room:join peut se perdre ou arriver apres).
      clients[2].socket.close();
      await waitFor(() => server.io.sockets.adapter.rooms.get(roomCode)?.size === 2, 5000, "server sees 2 sockets");
      back = await connectClient(server.port, users[2]);
      back.socket.emit("game:sync", { roomCode });
      await waitFor(() => back!.states.length >= 1, 5000, "resynced state");
      expect(inIoRoom(server, roomCode, back)).toBe(true);

      // Contrat anti-triche : pendant la manche, l'etat renvoye est caviarde.
      const st = back.lastState();
      expect(st.phase).toBe("GUESSING");
      expect(st.currentRound).toBe(1);
      expect(st.currentTrack.title).toBe("");
      expect(st.currentTrack.artist).toBe("");
      expect(st.currentTrack.trackId).toBe("hidden");

      // Il recoit bien la suite de la partie.
      for (const c of [clients[0], clients[1], back]) {
        c.socket.emit("game:answer", { roomCode, guessTitle: "Title 1", guessArtist: "Artist 1" });
      }
      await waitFor(() => back!.reveals.length >= 1, 5000, "returning player got the reveal");
      expect(back.reveals[0].track.title).toBe("Title 1");
    } finally {
      back?.socket.close();
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });

  it("l'ecran de l'hote en mode event (presentateur) se resynchronise aussi", async () => {
    const users = await seedUsers(3);
    const roomCode = await seedRoom(users);
    await pool.query(`UPDATE multiplayer_rooms SET mode = 'event', host_plays = FALSE WHERE room_code = $1`, [roomCode]);
    const clients: GameClient[] = [];
    let screen: GameClient | undefined;

    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 2, 8000);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING round 1");

      // L'ecran TV (hote) recharge la page.
      clients[0].socket.close();
      await waitFor(() => server.io.sockets.adapter.rooms.get(roomCode)?.size === 2, 5000, "server sees 2 sockets");
      screen = await connectClient(server.port, users[0]);
      screen.socket.emit("game:sync", { roomCode });
      await waitFor(() => screen!.states.length >= 1, 5000, "screen resynced");
      expect(screen.lastState().currentRound).toBe(1);
      expect(inIoRoom(server, roomCode, screen)).toBe(true);
    } finally {
      screen?.socket.close();
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });
});
