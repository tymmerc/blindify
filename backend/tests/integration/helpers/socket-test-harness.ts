import http from "http";
import crypto from "crypto";
import { io as ClientIO, Socket as ClientSocket } from "socket.io-client";
import { AddressInfo } from "net";

import { initSocket } from "../../../src/socket";
import { registerSocketHandlers } from "../../../src/socketHandlers";
import { createSessionToken } from "../../../src/utils/session";
import { pool } from "../../../src/config/db";
import {
  bootstrapGameState,
  clearGame,
  type RoundTrack,
} from "../../../src/services/realtimeGame";
import { startRoundAndBroadcast, clearRevealTimer } from "../../../src/services/realtimeOrchestrator";

export type TestServer = {
  httpServer: http.Server;
  io: ReturnType<typeof initSocket>;
  port: number;
  close: () => Promise<void>;
};

export type TestUser = { id: number; username: string; token: string };

/**
 * Boots the REAL socket.io server (handlers + game machine) on an ephemeral
 * port, without importing src/index.ts (which auto-listens and connects to the
 * production DB). DATABASE_URL is pointed at blindify_test by tests/setup.ts.
 */
export async function startTestServer(): Promise<TestServer> {
  const httpServer = http.createServer();
  const io = initSocket(httpServer, ["*"]);
  const lastKnownUsername = new Map<number, string | null>();
  registerSocketHandlers(io, lastKnownUsername);

  await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    httpServer,
    io,
    port,
    close: async () => {
      io.close();
      await new Promise<void>(resolve => httpServer.close(() => resolve()));
    },
  };
}

/** Creates N real users + session tokens in the test DB. */
export async function seedUsers(count: number, prefix = "P"): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (let i = 1; i <= count; i++) {
    const username = `${prefix}${i}_${crypto.randomUUID().slice(0, 8)}`;
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (provider, provider_id, username)
       VALUES ('guest', $1, $2)
       RETURNING id`,
      [crypto.randomUUID(), username],
    );
    const userId = rows[0].id;
    const session = await createSessionToken(userId);
    users.push({ id: userId, username, token: session.token });
  }
  return users;
}

/** Creates a room with the given users as participants (first is host). */
export async function seedRoom(users: TestUser[], status = "in_progress"): Promise<string> {
  const roomCode = crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO multiplayer_rooms (room_code, host_user_id, status, max_players, question_count)
     VALUES ($1, $2, $3, 10, 3)
     RETURNING id`,
    [roomCode, users[0].id, status],
  );
  const roomId = rows[0].id;
  for (const u of users) {
    await pool.query(
      `INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [roomId, u.id],
    );
  }
  return roomCode;
}

/**
 * Creates a real game_sessions row + game_rounds + game_participants for the
 * room, so persistence (round_responses, final scores) has FK targets.
 * Returns the session id to thread into startGame.
 */
export async function seedSession(roomCode: string, users: TestUser[], rounds: number): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO game_sessions (host_user_id, mode, difficulty, total_rounds, state, room_code)
     VALUES ($1, 'friends', 'normal', $2, 'in_progress', $3)
     RETURNING id`,
    [users[0].id, rounds, roomCode],
  );
  const sessionId = rows[0].id;
  for (let r = 1; r <= rounds; r++) {
    await pool.query(
      `INSERT INTO game_rounds (session_id, round_index, correct_title, correct_artist)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, r, `Title ${r}`, `Artist ${r}`],
    );
  }
  for (const u of users) {
    await pool.query(
      `INSERT INTO game_participants (session_id, user_id, score) VALUES ($1, $2, 0)
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [sessionId, u.id],
    );
  }
  await pool.query(`UPDATE multiplayer_rooms SET session_id = $2 WHERE room_code = $1`, [roomCode, sessionId]);
  return sessionId;
}

/** Removes a seeded session (cascades rounds/responses/participants). */
export async function cleanupSession(sessionId: number | undefined): Promise<void> {
  if (!sessionId) return;
  await pool.query(`DELETE FROM game_sessions WHERE id = $1`, [sessionId]);
}

/** Synthetic tracks for N rounds (no Deezer/DB dependency). */
export function makeTracks(rounds: number): RoundTrack[] {
  return Array.from({ length: rounds }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Title ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.test/preview-${i + 1}.mp3`,
    albumCover: null,
    metadata: null,
  }));
}

export type GameClient = {
  user: TestUser;
  socket: ClientSocket;
  states: any[];
  reveals: any[];
  roundStarts: any[];
  gameOver: any | null;
  errors: any[];
  lastState: () => any | undefined;
};

/** Connects a real socket.io client and records every state-bearing event. */
export async function connectClient(port: number, user: TestUser): Promise<GameClient> {
  const socket = ClientIO(`http://127.0.0.1:${port}`, {
    auth: { token: user.token },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });

  const client: GameClient = {
    user,
    socket,
    states: [],
    reveals: [],
    roundStarts: [],
    gameOver: null,
    errors: [],
    lastState: () => client.states[client.states.length - 1],
  };

  socket.on("game:state", (s: any) => client.states.push(s));
  socket.on("game:round:start", (s: any) => client.roundStarts.push(s));
  socket.on("game:round:reveal", (s: any) => client.reveals.push(s));
  socket.on("game:over", (s: any) => { client.gameOver = s; });
  socket.on("room:error", (e: any) => client.errors.push(e));

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`connect timeout for ${user.username}`)), 4000);
    socket.on("connect", () => { clearTimeout(t); resolve(); });
    socket.on("connect_error", err => { clearTimeout(t); reject(err); });
  });

  return client;
}

/** Joins all clients to the room and waits until the server has them in the io room. */
export async function joinRoom(io: TestServer["io"], roomCode: string, clients: GameClient[]): Promise<void> {
  for (const c of clients) {
    c.socket.emit("room:join", { roomCode });
  }
  await waitFor(() => {
    const room = io.sockets.adapter.rooms.get(roomCode);
    return !!room && room.size >= clients.length;
  }, 4000, `all ${clients.length} sockets in io room ${roomCode}`);
}

/** Starts a game state machine for the room with synthetic tracks. */
export function startGame(io: TestServer["io"], roomCode: string, users: TestUser[], rounds: number, roundDurationMs = 1500, sessionId?: number): void {
  bootstrapGameState({
    roomCode,
    hostUserId: users[0].id,
    tracks: makeTracks(rounds),
    participants: users.map(u => ({ userId: u.id, username: u.username, avatar: null })),
    mode: "friends",
    config: { roundDurationMs, autoAdvance: false },
    sessionId,
  });
  startRoundAndBroadcast(io, roomCode);
}

/** Direct DB access for persistence assertions in tests. */
export { pool };

export function cleanupGame(roomCode: string): void {
  clearRevealTimer(roomCode);
  clearGame(roomCode);
}

/** Polls a predicate until true or timeout. */
export async function waitFor(predicate: () => boolean, timeoutMs = 4000, label = "condition"): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`waitFor timeout: ${label}`);
}

/** Closes the shared DB pool so jest can exit cleanly. */
export async function closePool(): Promise<void> {
  await pool.end();
}

/** Removes seeded rows for a clean DB after a test. */
export async function cleanupUsers(users: TestUser[]): Promise<void> {
  const ids = users.map(u => u.id);
  if (!ids.length) return;
  // FK cascades from users handle sessions/rooms/participants.
  await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids]);
}
