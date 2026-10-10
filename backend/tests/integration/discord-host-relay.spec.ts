/**
 * Relais de l'hote d'un salon Discord, de bout en bout sur le vrai serveur
 * socket.io et la base jetable (decision de Tym du 10/10/2026) :
 *   - l'hote quitte le lobby : le plus ancien joueur encore present devient
 *     hote, en base, et la salle recoit room:host ;
 *   - l'hote quitte en pleine partie : meme comportement que le site, l'hote
 *     ne change pas ;
 *   - le dernier joueur part : rien a relayer, la salle garde son hote.
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
  type TestUser,
  type GameClient,
} from "./helpers/socket-test-harness";
import { ensureDiscordSchema } from "../../src/services/discordRooms";

jest.setTimeout(30000);

let server: TestServer;

type HostEvent = { roomCode: string; hostUserId: number };

async function openSalon(players: number, status = "waiting"): Promise<{ users: TestUser[]; roomCode: string; clients: GameClient[]; hostEvents: HostEvent[][] }> {
  const users = await seedUsers(players, "D");
  const roomCode = await seedRoom(users, status);
  await pool.query(`UPDATE multiplayer_rooms SET discord_instance_id=$1 WHERE room_code=$2`, [`i-${roomCode}`, roomCode]);
  const clients: GameClient[] = [];
  const hostEvents: HostEvent[][] = [];
  for (const u of users) {
    const c = await connectClient(server.port, u);
    const seen: HostEvent[] = [];
    c.socket.on("room:host", (e: HostEvent) => seen.push(e));
    clients.push(c);
    hostEvents.push(seen);
  }
  await joinRoom(server.io, roomCode, clients);
  return { users, roomCode, clients, hostEvents };
}

async function hostOf(roomCode: string): Promise<number> {
  const { rows } = await pool.query<{ host_user_id: number }>(`SELECT host_user_id FROM multiplayer_rooms WHERE room_code=$1`, [roomCode]);
  return rows[0].host_user_id;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeAll(async () => {
  await ensureDiscordSchema();
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await closePool();
});

describe("relais de l'hote dans un salon Discord", () => {
  it("l'hote quitte le lobby : le plus ancien present devient hote et la salle le sait", async () => {
    const t = await openSalon(3);
    try {
      t.clients[0].socket.emit("room:leave", { roomCode: t.roomCode });
      await waitFor(() => t.hostEvents[1].length > 0 && t.hostEvents[2].length > 0, 4000, "room:host chez les deux restants");

      expect(await hostOf(t.roomCode)).toBe(t.users[1].id);
      expect(t.hostEvents[1][0]).toMatchObject({ roomCode: t.roomCode, hostUserId: t.users[1].id });
    } finally {
      t.clients.forEach(c => c.socket.close());
      cleanupGame(t.roomCode);
      await cleanupUsers(t.users);
    }
  });

  it("l'hote quitte en pleine partie : comme sur le site, l'hote ne change pas", async () => {
    const t = await openSalon(3, "in_progress");
    try {
      startGame(server.io, t.roomCode, t.users, 2, 20_000);
      await waitFor(() => t.clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING");
      t.clients[0].socket.emit("room:leave", { roomCode: t.roomCode });
      await sleep(600);

      expect(await hostOf(t.roomCode)).toBe(t.users[0].id);
      expect(t.hostEvents[1]).toHaveLength(0);
    } finally {
      t.clients.forEach(c => c.socket.close());
      cleanupGame(t.roomCode);
      await cleanupUsers(t.users);
    }
  });

  it("le dernier joueur part : la salle garde son hote", async () => {
    const t = await openSalon(1);
    try {
      t.clients[0].socket.emit("room:leave", { roomCode: t.roomCode });
      await sleep(600);

      expect(await hostOf(t.roomCode)).toBe(t.users[0].id);
    } finally {
      t.clients.forEach(c => c.socket.close());
      cleanupGame(t.roomCode);
      await cleanupUsers(t.users);
    }
  });

  it("une salle du site n'est jamais relayee", async () => {
    const users = await seedUsers(2, "W");
    const roomCode = await seedRoom(users, "waiting");
    const clients: GameClient[] = [];
    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      await joinRoom(server.io, roomCode, clients);
      clients[0].socket.emit("room:leave", { roomCode });
      await sleep(600);

      expect(await hostOf(roomCode)).toBe(users[0].id);
    } finally {
      clients.forEach(c => c.socket.close());
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });
});
