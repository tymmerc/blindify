/**
 * Spectateur (T18) sur le vrai serveur socket.io : Tym regarde une partie par
 * le lien signe du mail.
 *
 * - il recoit exactement les trames des joueurs, caviardees : aucune reponse
 *   avant le reveal ;
 * - il n'est jamais dans les joueurs, ne retient pas la revelation, ne peut
 *   ni repondre, ni ecrire dans le chat, ni rien piloter ;
 * - les joueurs voient le compteur de spectateurs, qui retombe a 0 quand il part ;
 * - jeton expire, d'une autre salle ou falsifie : refus net a la connexion.
 *
 * Requires Postgres (blindz_test) reachable. See tests/setup.ts.
 */
import { io as ClientIO, type Socket as ClientSocket } from "socket.io-client";
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
import { SPECTATOR_TTL_MS, signSpectatorToken } from "../../src/services/spectatorToken";
import { resetSpectatorAttemptsForTests } from "../../src/services/spectators";
import { getGameState } from "../../src/services/realtimeGame";

jest.setTimeout(30000);

const SECRET = "t".repeat(48);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Trame recue telle quelle (JSON du serveur), lue champ par champ dans les assertions.
type Payload = Record<string, unknown> & { track?: { title?: string }; count?: number; members?: Array<{ userId: number }> };
type Frame = { event: string; payload: Payload };
type Watcher = { socket: ClientSocket; frames: Frame[]; spectators: number[]; init: Payload | null };

let server: TestServer;

beforeAll(async () => {
  process.env.SPECTATEUR_SECRET = SECRET;
  server = await startTestServer();
});

afterAll(async () => {
  delete process.env.SPECTATEUR_SECRET;
  await server.close();
  await closePool();
});

beforeEach(() => resetSpectatorAttemptsForTests());

async function roomId(roomCode: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM multiplayer_rooms WHERE room_code=$1`, [roomCode]);
  return rows[0].id;
}

function tokenFor(roomCode: string, id: number, expiresAt = Date.now() + SPECTATOR_TTL_MS, secret = SECRET): string {
  return signSpectatorToken({ roomCode, roomId: id, expiresAt }, secret);
}

function openSpectator(port: number, salle: string, jeton: string): ClientSocket {
  return ClientIO(`http://127.0.0.1:${port}`, {
    auth: { spectateur: { salle, jeton } },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
}

async function connectSpectator(port: number, salle: string, jeton: string): Promise<Watcher> {
  const socket = openSpectator(port, salle, jeton);
  const watcher: Watcher = { socket, frames: [], spectators: [], init: null };
  socket.onAny((event: string, payload: Payload) => {
    watcher.frames.push({ event, payload });
    if (event === "spectator:init") watcher.init = payload;
    if (event === "room:spectators") watcher.spectators.push(Number(payload.count));
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("spectator connect timeout")), 4000);
    socket.on("connect", () => { clearTimeout(t); resolve(); });
    socket.on("connect_error", err => { clearTimeout(t); reject(err); });
  });
  return watcher;
}

async function refusal(port: number, salle: string, jeton: string): Promise<string> {
  const socket = openSpectator(port, salle, jeton);
  try {
    return await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("no refusal")), 4000);
      socket.on("connect", () => { clearTimeout(t); reject(new Error("connected, refusal expected")); });
      socket.on("connect_error", err => { clearTimeout(t); resolve(err.message); });
    });
  } finally {
    socket.close();
  }
}

/** Trames de jeu, comparables d'un client a l'autre (horodatage serveur retire). */
function gameFrames(frames: Frame[]): string[] {
  return frames
    .filter(f => f.event.startsWith("game:"))
    .map(f => JSON.stringify({ event: f.event, payload: { ...f.payload, serverTimestamp: undefined } }));
}

function recordAll(c: GameClient): Frame[] {
  const frames: Frame[] = [];
  c.socket.onAny((event: string, payload: Payload) => frames.push({ event, payload }));
  return frames;
}

describe("spectateur d'une partie", () => {
  it("memes trames que les joueurs, caviardees, et jamais dans les joueurs", async () => {
    const users = await seedUsers(2, "S");
    const roomCode = await seedRoom(users, "waiting");
    const clients: GameClient[] = [];
    let spectator: Watcher | undefined;
    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      const playerFrames = recordAll(clients[1]);
      const playerSpectators: number[] = [];
      clients[0].socket.on("room:spectators", (p: Payload) => playerSpectators.push(Number(p.count)));
      await joinRoom(server.io, roomCode, clients);

      spectator = await connectSpectator(server.port, roomCode, tokenFor(roomCode, await roomId(roomCode)));
      await waitFor(() => spectator!.init !== null, 3000, "spectator:init");
      expect(spectator.init).toEqual(expect.objectContaining({ roomCode, mode: "friends" }));
      expect((spectator.init?.members ?? []).map(m => m.userId).sort()).toEqual(users.map(u => u.id).sort());
      await waitFor(() => playerSpectators.at(-1) === 1, 3000, "les joueurs voient 1 spectateur");

      startGame(server.io, roomCode, users, 2, 8000);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING manche 1");

      // Il ne compte pas pour la revelation : les deux joueurs repondent, la
      // manche est revelee tout de suite.
      for (const c of clients) {
        c.socket.emit("game:answer", { roomCode, guessTitle: "Title 1", guessArtist: "Artist 1", round: 1 });
      }
      await waitFor(() => spectator!.frames.some(f => f.event === "game:round:reveal"), 4000, "reveal chez le spectateur");
      await sleep(200);

      // Jamais dans les joueurs, ni dans l'etat interne.
      const ids = Object.keys(getGameState(roomCode)!.players).map(Number).sort();
      expect(ids).toEqual(users.map(u => u.id).sort());

      // Exactement les memes trames de jeu que le joueur 2. Le joueur recoit
      // en plus un double de l'etat apres sa propre reponse (filet de
      // game:answer, meme contenu) : on compare les trames distinctes.
      const distinct = (frames: Frame[]) => [...new Set(gameFrames(frames))].sort();
      expect(distinct(spectator.frames)).toEqual(distinct(playerFrames));
      expect(gameFrames(spectator.frames).length).toBeGreaterThanOrEqual(4);

      // Aucune reponse avant le reveal.
      const revealAt = spectator.frames.findIndex(f => f.event === "game:round:reveal");
      const before = JSON.stringify(spectator.frames.slice(0, revealAt));
      expect(before).not.toContain("Title 1");
      expect(before).not.toContain("Artist 1");
      expect(spectator.frames[revealAt].payload.track?.title).toBe("Title 1");

      // Il part : le compteur retombe a 0 chez les joueurs.
      spectator.socket.close();
      await waitFor(() => playerSpectators.at(-1) === 0, 3000, "compteur a 0");
    } finally {
      spectator?.socket.close();
      for (const c of clients) c.socket.close();
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });

  it("ne peut ni repondre, ni ecrire dans le chat, ni piloter", async () => {
    const users = await seedUsers(2, "T");
    const roomCode = await seedRoom(users, "waiting");
    const clients: GameClient[] = [];
    let spectator: Watcher | undefined;
    try {
      for (const u of users) clients.push(await connectClient(server.port, u));
      const chat: unknown[] = [];
      clients[0].socket.on("room:chat", (m: unknown) => chat.push(m));
      await joinRoom(server.io, roomCode, clients);
      startGame(server.io, roomCode, users, 2, 8000);
      await waitFor(() => clients.every(c => c.lastState()?.phase === "GUESSING"), 5000, "GUESSING");

      spectator = await connectSpectator(server.port, roomCode, tokenFor(roomCode, await roomId(roomCode)));
      const acks: unknown[] = [];
      spectator.socket.emit("game:answer", { roomCode, guessTitle: "x", guessArtist: "y", round: 1 }, (res: unknown) => acks.push(res));
      spectator.socket.emit("room:chat", { roomCode, message: "coucou" });
      spectator.socket.emit("game:pause", { roomCode });
      spectator.socket.emit("game:ready", { roomCode });
      spectator.socket.emit("room:join", { roomCode });
      spectator.socket.emit("lobby:rps:challenge", { roomCode, targetUserId: users[0].id });
      await sleep(500);

      const state = getGameState(roomCode)!;
      expect(state.paused).toBeFalsy();
      expect(state.phase).toBe("GUESSING");
      expect(Object.keys(state.players)).toHaveLength(2);
      expect(Object.values(state.players).some(p => p.hasAnswered)).toBe(false);
      expect(acks).toEqual([]);
      expect(chat).toEqual([]);
    } finally {
      spectator?.socket.close();
      for (const c of clients) c.socket.close();
      cleanupGame(roomCode);
      await cleanupUsers(users);
    }
  });

  it("refus net : jeton expire, autre salle, falsifie, absent", async () => {
    const users = await seedUsers(2, "U");
    const roomA = await seedRoom(users, "waiting");
    const roomB = await seedRoom(users, "waiting");
    try {
      const idA = await roomId(roomA);
      const idB = await roomId(roomB);
      expect(await refusal(server.port, roomA, tokenFor(roomA, idA, Date.now() - 1000))).toBe("spectateur_expire");
      expect(await refusal(server.port, roomA, tokenFor(roomB, idB))).toBe("spectateur_refuse");
      expect(await refusal(server.port, roomA, tokenFor(roomA, idA, undefined, "f".repeat(48)))).toBe("spectateur_refuse");
      const good = tokenFor(roomA, idA);
      expect(await refusal(server.port, roomA, `${Number(good.split(".")[0]) + 1}.${good.split(".")[1]}`)).toBe("spectateur_refuse");
      expect(await refusal(server.port, roomA, "")).toBe("spectateur_refuse");
      expect(await refusal(server.port, "ZZZZZZ", good)).toBe("spectateur_refuse");
    } finally {
      await cleanupUsers(users);
    }
  });

  it("limite de debit des connexions spectateur", async () => {
    const users = await seedUsers(2, "V");
    const roomCode = await seedRoom(users, "waiting");
    try {
      const bad = tokenFor(roomCode, -1);
      for (let i = 0; i < 20; i++) expect(await refusal(server.port, roomCode, bad)).toBe("spectateur_refuse");
      expect(await refusal(server.port, roomCode, tokenFor(roomCode, await roomId(roomCode)))).toBe("spectateur_limite");
    } finally {
      await cleanupUsers(users);
    }
  });

  it("le lien coupe a son expiration", async () => {
    const users = await seedUsers(2, "W");
    const roomCode = await seedRoom(users, "waiting");
    let spectator: Watcher | undefined;
    try {
      spectator = await connectSpectator(server.port, roomCode, tokenFor(roomCode, await roomId(roomCode), Date.now() + 600));
      await waitFor(() => spectator!.frames.some(f => f.event === "spectator:expired"), 3000, "spectator:expired");
      await waitFor(() => !spectator!.socket.connected, 3000, "socket coupe");
    } finally {
      spectator?.socket.close();
      await cleanupUsers(users);
    }
  });
});
