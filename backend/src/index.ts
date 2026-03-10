// Minimal File polyfill for Node 18 (used by undici dependencies)
if (!(globalThis as any).File) {
  // Local type shims to avoid relying on DOM lib in tsconfig
  type PolyfillBlobPart = any;
  type PolyfillFileOptions = { lastModified?: number; type?: string };
  class PolyfillFile extends Blob {
    name: string;
    lastModified: number;
    constructor(bits: PolyfillBlobPart[] = [], name: string, options: PolyfillFileOptions = {}) {
      super(bits, options);
      this.name = name;
      this.lastModified = options.lastModified ?? Date.now();
    }
  }
  (globalThis as any).File = PolyfillFile as unknown as typeof File;
}

import express, { type NextFunction, type Request, type Response } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import type { Socket } from "socket.io";

import { pool } from "./config/db";
import { initSocket } from "./socket";
import authRoutes from "./routes/auth";
import gamesRoutes from "./routes/games";
import likesRoutes from "./routes/likes";
import roomsRoutes from "./routes/rooms";
import statsRoutes from "./routes/stats";
import audioSourcesRoutes from "./routes/audioSources";
import friendsRoutes from "./routes/friends";
import invitationsRoutes from "./routes/invitations";
import importRoutes from "./routes/import";
import quickPlayRoutes from "./routes/quickPlay";
import { fail, ok } from "./utils/response";
import {
  gameStateSnapshot,
  getGameState as getRealtimeState,
  allAnswerablePlayers,
  markReady as markReadyState,
  recordAnswer,
  revealRound,
  removePlayer,
  upsertPlayer,
  markDisconnected,
  getGameMode,
} from "./services/realtimeGame";
import {
  broadcastGameOver,
  broadcastState,
  clearRevealTimer,
  scheduleReveal,
} from "./services/realtimeOrchestrator";
import { getSessionContext, getSessionContextFromToken, type SessionContext } from "./utils/session";
import {
  getPresence,
  getPresenceForUsers,
  emitToUser,
  registerSocket,
  recordHeartbeat,
  findStalePresences,
  PRESENCE_HEARTBEAT_TTL_MS,
  setPresence,
  getUserSockets,
  unregisterSocket,
} from "./services/presence";
import { expireOldInvitations, getAcceptedFriendIds, type ExpiredInvitation } from "./services/social";
import {
  handleStreamerGuess,
  advanceStreamerRound,
  getStreamerSnapshot,
  cleanupStreamer,
} from "./services/streamerOrchestrator";
import { GameMode } from "./types/game";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === "CHANGE_ME") {
  console.error("❌ SESSION_SECRET is not set. Please define a strong secret in the environment.");
  process.exit(1);
}

const server = http.createServer(app);

const frontendBase = (process.env.FRONTEND_URL || "https://tymmerc.eu/blindify").replace(/\/$/, "");
const isProd = process.env.NODE_ENV === "production";
const isFrontendHttps = frontendBase.startsWith("https://");
const secureCookies = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === "true"
  : isProd && isFrontendHttps;
const sameSite = secureCookies ? "none" : "lax";
const cookieDomain = process.env.COOKIE_DOMAIN || (isProd ? "tymmerc.eu" : undefined);

const allowedOrigins = [
  frontendBase,
  "https://tymmerc.eu",
  "https://tymmerc.eu/blindify",
  "https://blindify-chi.vercel.app",
  "https://blindify-production.up.railway.app",
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean) as string[];

const lastKnownUsername = new Map<number, string | null>();
const PRESENCE_SWEEP_INTERVAL_MS = 5_000;

// Background cleanup for expired invitations (every 30s) + user feedback.
setInterval(() => {
  expireOldInvitations()
    .then((expired: ExpiredInvitation[]) => {
      expired.forEach(invite => {
        const payload = {
          invitationId: invite.id,
          roomCode: invite.room_code,
        };
        emitToUser(invite.to_user, "room:invite:expired", payload);
        emitToUser(invite.from_user, "room:invite:expired", payload);
      });
    })
    .catch(err => console.error("invitation_cleanup_failed", err));
}, 30_000);

// Heartbeat-based presence expiry sweep
setInterval(() => {
  const staleUsers = findStalePresences(PRESENCE_HEARTBEAT_TTL_MS);
  staleUsers.forEach(userId => {
    const before = getPresence(userId);
    const sockets = getUserSockets(userId);
    const hasLiveSockets = Boolean(sockets && sockets.size);

    // Distinguish missing heartbeat (keep online if socket alive) vs true disconnect (offline).
    const after = hasLiveSockets
      ? setPresence(userId, { online: true, activity: before.activity === "playing" ? "playing" : "idle", context: before.context })
      : setPresence(userId, "offline", null);

    const contextChanged =
      before.context?.id !== after.context?.id || before.context?.type !== after.context?.type || before.roomCode !== after.roomCode;
    const stateChanged = before.status !== after.status || before.online !== after.online || before.activity !== after.activity;

    if (stateChanged || contextChanged) {
      const username = lastKnownUsername.get(userId) ?? null;
      broadcastFriendPresence(userId, username).catch(err => console.error("presence_sweep_broadcast_failed", err));
    }
  });
}, PRESENCE_SWEEP_INTERVAL_MS);

function parseCookies(header: string | string[] | undefined): Record<string, string> {
  if (!header) return {};
  const raw = Array.isArray(header) ? header.join(";") : header;
  return raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    const value = rest.join("=");
    try {
      acc[key] = decodeURIComponent(value || "");
    } catch {
      acc[key] = value || "";
    }
    return acc;
  }, {});
}

function extractSessionToken(socket: Socket): string | null {
  const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
  const headerAuth = socket.handshake.headers.authorization;
  const bearer =
    typeof headerAuth === "string" && headerAuth.toLowerCase().startsWith("bearer ")
      ? headerAuth.slice(7).trim()
      : null;
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const cookieToken = cookies["blindify_session_token"] ?? null;
  return authToken || bearer || cookieToken || null;
}

type RoomAccess = {
  id: number;
  room_code: string;
  host_user_id: number;
  status: string;
  session_id: number | null;
};

async function requireRoomAccess(roomCode: string, userId: number): Promise<{ room: RoomAccess; isHost: boolean } | null> {
  const { rows: roomRows } = await pool.query<RoomAccess>(
    `SELECT id, room_code, host_user_id, status, session_id
     FROM multiplayer_rooms
     WHERE room_code=$1
     LIMIT 1`,
    [roomCode]
  );
  const room = roomRows[0];
  if (!room) return null;
  const membership = await pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [
    room.id,
    userId,
  ]);
  if (!membership.rows.length) return null;
  return { room, isHost: room.host_user_id === userId };
}

function emitRoomError(socket: Socket, roomCode: string, message: string, code = "forbidden"): void {
  socket.emit("room:error", {
    roomCode,
    code,
    message,
    serverTimestamp: Date.now(),
  });
}

const io = initSocket(server, allowedOrigins);

io.use(async (socket, next) => {
  try {
    const token = extractSessionToken(socket);
    if (!token) return next(new Error("unauthorized"));
    const context = await getSessionContextFromToken(token, { autoExtend: true });
    if (!context) return next(new Error("unauthorized"));
    (socket.data as { auth?: SessionContext }).auth = context;
    return next();
  } catch (err) {
    return next(new Error("unauthorized"));
  }
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", "*"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", "https://api.spotify.com", "https://api.deezer.com", "https://*.dzcdn.net", ...allowedOrigins],
        "media-src": ["'self'", "https://*.scdn.co", "https://*.dzcdn.net", "blob:", "data:"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": allowedOrigins.length ? allowedOrigins : ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req =>
    req.path?.startsWith("/api/rooms") ||
    req.path?.startsWith("/socket.io"),
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "rate_limited", message: "Trop de requêtes. Réessaye dans 1 minute." } },
});
app.use("/api/auth", authLimiter);

app.use(apiLimiter);

app.use(
  slowDown({
    windowMs: 60_000,
    delayAfter: 120,
    delayMs: () => 50,
    skip: req =>
      req.path?.startsWith("/api/rooms") ||
      req.path?.startsWith("/socket.io"),
  })
);

app.use(
  cookieSession({
    name: "blindify_session",
    secret: sessionSecret,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite,
    secure: secureCookies,
    domain: cookieDomain,
    httpOnly: true,
  })
);

app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const allowed = allowedOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
  if (!allowed) {
    return fail(res, "forbidden", "Requête refusée (origine non autorisée)", 403);
  }
  next();
});

app.get("/health", (_req, res) => {
  ok(res, { status: "ok" });
});
app.get("/api/health", (_req, res) => {
  ok(res, { status: "ok" });
});

app.get("/api/friends/activity", async (req, res) => {
  const context = await getSessionContext(req, res);
  if (!context) return;
  // Deprecated: kept for debug/admin visibility. Presence source of truth stays on socket events.
  res.setHeader("X-Deprecated-Endpoint", "true");
  res.setHeader("X-Endpoint-Usage", "debug-only");
  const friendIds = await getAcceptedFriendIds(context.user.id);
  if (!friendIds.length) {
    ok(res, { friends: [] });
    return;
  }
  const presence = getPresenceForUsers(friendIds);
  const { rows: userRows } = await pool.query<{ id: number; username: string | null }>(
    `SELECT id, username FROM users WHERE id = ANY($1::int[])`,
    [friendIds]
  );
  const nameMap = new Map<number, string | null>();
  userRows.forEach(u => nameMap.set(u.id, u.username));

  const friends = friendIds.map(id => ({
    userId: id,
    username: nameMap.get(id) ?? null,
    online: presence[id]?.online ?? false,
    activity: presence[id]?.activity ?? "idle",
    context: presence[id]?.context ?? null,
    roomCode: presence[id]?.roomCode ?? null,
    state: presence[id]?.status ?? "offline",
    updatedAt: presence[id]?.updatedAt ?? Date.now(),
  }));

  ok(res, { friends });
});

app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/games", gamesRoutes);
app.use("/api/likes", likesRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/audio-sources", audioSourcesRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/invitations", invitationsRoutes);
app.use("/api/import", importRoutes);
app.use("/api/quick-play", quickPlayRoutes);

async function broadcastFriendPresence(userId: number, username: string | null) {
  const friendIds = await getAcceptedFriendIds(userId);
  if (!friendIds.length) return;
  const state = getPresence(userId);
  const payload = {
    userId,
    username,
    online: state.online,
    activity: state.activity,
    context: state.context ?? null,
    roomCode: state.roomCode,
    status: state.status,
    updatedAt: state.updatedAt,
  };
  for (const fid of friendIds) {
    emitToUser(fid, "friends:status:update", payload);
  }
}

async function pushFriendPresenceSnapshot(userId: number, socketId: string) {
  const friendIds = await getAcceptedFriendIds(userId);
  if (!friendIds.length) return;
  const presence = getPresenceForUsers(friendIds);
  const { rows } = await pool.query<{ id: number; username: string | null }>(
    `SELECT id, username FROM users WHERE id = ANY($1::int[])`,
    [friendIds]
  );
  const nameMap = new Map<number, string | null>();
  rows.forEach(u => nameMap.set(u.id, u.username));
  const snapshot = friendIds.map(id => ({
    userId: id,
    username: nameMap.get(id) ?? null,
    online: presence[id]?.online ?? false,
    activity: presence[id]?.activity ?? "idle",
    context: presence[id]?.context ?? null,
    roomCode: presence[id]?.roomCode ?? null,
    status: presence[id]?.status ?? "offline",
    updatedAt: presence[id]?.updatedAt ?? Date.now(),
  }));
  io.to(socketId).emit("friends:status:init", snapshot);
}

io.on("connection", socket => {
  const auth = (socket.data as { auth?: SessionContext }).auth;
  if (!auth?.user) {
    socket.emit("room:error", {
      code: "unauthorized",
      message: "Authentification requise",
      serverTimestamp: Date.now(),
    });
    socket.disconnect(true);
    return;
  }

  const currentUser = auth.user;
  lastKnownUsername.set(currentUser.id, currentUser.username ?? null);

  const beforePresence = getPresence(currentUser.id);
  const presence = registerSocket(currentUser.id, socket.id);
  const contextChanged =
    beforePresence.context?.id !== presence.context?.id || beforePresence.context?.type !== presence.context?.type;
  const stateChanged =
    beforePresence.status !== presence.status ||
    beforePresence.online !== presence.online ||
    beforePresence.activity !== presence.activity ||
    beforePresence.roomCode !== presence.roomCode;
  if (stateChanged || contextChanged) {
    broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
  }
  pushFriendPresenceSnapshot(currentUser.id, socket.id).catch(() => {});

  socket.on("presence:heartbeat", () => {
    const before = getPresence(currentUser.id);
    const after = recordHeartbeat(currentUser.id);
    const contextChanged =
      before.context?.id !== after.context?.id || before.context?.type !== after.context?.type;
    const stateChanged =
      before.status !== after.status ||
      before.online !== after.online ||
      before.activity !== after.activity ||
      before.roomCode !== after.roomCode;
    if (stateChanged || contextChanged) {
      broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
    }
  });

  const sendStateToSocket = (roomCode: string) => {
    const snapshot = gameStateSnapshot(roomCode);
    if (snapshot) {
      socket.emit("game:state", snapshot);
    }
  };

  socket.on("room:join", async ({ roomCode }: { roomCode: string }) => {
    console.log(`[socket] room:join request from user ${currentUser.id} (${currentUser.username}) for room ${roomCode}, socketId=${socket.id}`);
    if (!roomCode) return;
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) {
      console.log(`[socket] room:join DENIED for user ${currentUser.id} - no access`);
      emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
      return;
    }
    socket.join(roomCode);
    console.log(`[socket] user ${currentUser.id} joined socket room ${roomCode}, rooms now: ${Array.from(socket.rooms).join(", ")}`);
    // In event mode, the host is a spectator/presenter — don't add them as a player
    const roomGameMode = getGameMode(roomCode);
    const roomGameState = getRealtimeState(roomCode);
    const isEventHost = roomGameMode === "event" && roomGameState?.hostUserId === currentUser.id;
    if (!isEventHost) {
      upsertPlayer(roomCode, {
        userId: currentUser.id,
        username: currentUser.username ?? null,
        avatar: (currentUser as any).avatar ?? null,
      });
    }
    io.to(roomCode).emit("room:presence", {
      type: "joined",
      roomCode,
      user: { id: currentUser.id, username: currentUser.username ?? undefined },
      serverTimestamp: Date.now(),
    });
    sendStateToSocket(roomCode);

    setPresence(currentUser.id, { online: true, activity: "playing", context: { type: "room", id: roomCode } });
    broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
  });

  socket.on("room:leave", async ({ roomCode }: { roomCode: string }) => {
    if (!roomCode) return;
    socket.leave(roomCode);
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) return;
    removePlayer(roomCode, currentUser.id);
    io.to(roomCode).emit("room:presence", {
      type: "left",
      roomCode,
      userId: currentUser.id,
      serverTimestamp: Date.now(),
    });
    broadcastState(io, roomCode);

    setPresence(currentUser.id, { online: true, activity: "idle", context: null });
    broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
  });

  socket.on(
    "game:answer",
    async ({ roomCode, guess, guessTitle, guessArtist, sourceUserId }: {
      roomCode: string;
      guess?: string;
      guessTitle?: string;
      guessArtist?: string;
      sourceUserId?: number | null;
    }) => {
      console.log(`[answer] received from user ${currentUser.id} for room ${roomCode}`, { guess, guessTitle, guessArtist });
      if (!roomCode) return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) {
        console.log(`[answer] DENIED - no access for user ${currentUser.id}`);
        emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
        return;
      }
      // Ensure this socket is still in the room (may have lost membership on reconnect)
      if (!socket.rooms.has(roomCode)) {
        console.log(`[answer] socket ${socket.id} not in room ${roomCode}, re-joining`);
        socket.join(roomCode);
      }
      const state = getRealtimeState(roomCode);
      if (!state) {
        console.log(`[answer] DENIED - no game state for room ${roomCode}`);
        emitRoomError(socket, roomCode, "Partie introuvable pour cette salle.");
        return;
      }
      // Build combined guess for legacy compatibility
      const combinedGuess = guess ?? `${guessTitle ?? ""} ${guessArtist ?? ""}`.trim();
      console.log(`[answer] recording answer for user ${currentUser.id}: "${combinedGuess}"`);
      recordAnswer(roomCode, currentUser.id, combinedGuess, sourceUserId, guessTitle, guessArtist);

      // Check if all answerable players have answered BEFORE broadcasting state,
      // so clients receive a single consistent state update instead of a GUESSING→REVEAL flicker.
      const currentPhase = getRealtimeState(roomCode)?.phase;
      const answerable = allAnswerablePlayers(roomCode);
      const everyoneAnswered =
        currentPhase === "GUESSING" &&
        answerable.length > 0 &&
        answerable.every(p => p.hasAnswered);

      console.log(`[answer] check: phase=${currentPhase}, answerable=${answerable.length}, answered=[${answerable.map(p => `${p.userId}:${p.hasAnswered}`).join(",")}], everyoneAnswered=${everyoneAnswered}`);

      if (everyoneAnswered) {
        console.log(`[answer] triggering early reveal for ${roomCode}`);
        clearRevealTimer(roomCode);
        const revealed = revealRound(roomCode);
        console.log(`[answer] revealRound result: phase=${revealed?.phase}`);
        if (revealed) {
          io.to(roomCode).emit("game:round:reveal", {
            roomCode,
            round: revealed.currentRound,
            timing: revealed.timing,
            players: revealed.players,
          });
          if (revealed.phase === "FINISHED") {
            broadcastGameOver(io, roomCode);
          }
        }
      }
      // Broadcast state AFTER the reveal decision so clients see the final phase.
      broadcastState(io, roomCode);
      // Also send directly to the answering socket as a fallback, in case
      // the socket temporarily lost room membership (brief reconnect).
      const snapshot = gameStateSnapshot(roomCode);
      if (snapshot) {
        socket.emit("game:state", snapshot);
      }
    });

  socket.on("game:ready", async ({ roomCode }: { roomCode: string }) => {
    if (!roomCode) return;
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) {
      emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
      return;
    }
    // Ensure this socket is still in the room
    if (!socket.rooms.has(roomCode)) {
      socket.join(roomCode);
    }
    const existing = getRealtimeState(roomCode);
    if (!existing) {
      emitRoomError(socket, roomCode, "Aucune partie en cours.");
      return;
    }
    const before = getRealtimeState(roomCode);
    const state = markReadyState(roomCode, currentUser.id);
    if (!state) return;
    if (state.phase === "GUESSING" && state.currentTrack && state.timing.revealAt && state.currentRound !== before?.currentRound) {
      io.to(roomCode).emit("game:round:start", {
        roomCode,
        round: state.currentRound,
        track: state.currentTrack,
        timing: state.timing,
      });
      scheduleReveal(io, roomCode, state.timing.revealAt);
    } else if (state.phase === "FINISHED") {
      broadcastGameOver(io, roomCode);
      clearRevealTimer(roomCode);
    }
    broadcastState(io, roomCode);
  });

  socket.on("game:sync", async ({ roomCode }: { roomCode: string }) => {
    if (!roomCode) return;
    const state = getRealtimeState(roomCode);
    if (!state) return;
    // Ensure this socket is still in the room (may have lost membership on reconnect)
    if (!socket.rooms.has(roomCode)) {
      console.log(`[game:sync] socket ${socket.id} not in room ${roomCode}, re-joining`);
      socket.join(roomCode);
    }
    // If the game is stuck in GUESSING with an expired revealAt, trigger reveal now
    if (state.phase === "GUESSING" && state.timing.revealAt && state.timing.revealAt <= Date.now()) {
      console.log(`[game:sync] forcing reveal for ${roomCode} (revealAt was ${state.timing.revealAt}, now=${Date.now()})`);
      const updated = revealRound(roomCode);
      if (updated) {
        io.to(roomCode).emit("game:round:reveal", {
          roomCode,
          round: updated.currentRound,
          timing: updated.timing,
          players: updated.players,
        });
        broadcastState(io, roomCode);
        if (updated.phase === "FINISHED") {
          broadcastGameOver(io, roomCode);
          clearRevealTimer(roomCode);
        }
      }
    } else {
      broadcastState(io, roomCode);
    }
    // Also send directly to the requesting socket as a fallback
    const snapshot = gameStateSnapshot(roomCode);
    if (snapshot) {
      socket.emit("game:state", snapshot);
    }
  });

  // Chat messages
  socket.on("room:chat", ({ roomCode, message }: { roomCode: string; message: string }) => {
    if (!roomCode || typeof message !== "string") return;
    const text = message.trim().slice(0, 200);
    if (!text) return;
    io.to(roomCode).emit("room:chat", {
      userId: currentUser.id,
      username: currentUser.username ?? `Joueur ${currentUser.id}`,
      message: text,
      timestamp: Date.now(),
    });
  });

  socket.on("game:leave", async ({ roomCode }: { roomCode: string }) => {
    if (!roomCode) return;
    socket.leave(roomCode);
    removePlayer(roomCode, currentUser.id);
    broadcastState(io, roomCode);
  });

  // Streamer mode: game:guess (chat or host submits a guess)
  socket.on("game:guess", async ({ roomCode, guess }: { roomCode: string; guess: string }) => {
    if (!roomCode || typeof guess !== "string") return;
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) {
      emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
      return;
    }
    const streamerState = getStreamerSnapshot(roomCode);
    if (!streamerState) {
      emitRoomError(socket, roomCode, "Partie streamer introuvable.");
      return;
    }
    handleStreamerGuess(io, roomCode, currentUser.id, guess, GameMode.STREAMER);
  });

  // Streamer mode: host:start (host advances to next round)
  socket.on("host:start", async ({ roomCode }: { roomCode: string }) => {
    if (!roomCode) return;
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access || !access.isHost) {
      emitRoomError(socket, roomCode, "Seul l'hôte peut lancer la manche.");
      return;
    }
    const streamerState = getStreamerSnapshot(roomCode);
    if (!streamerState) {
      emitRoomError(socket, roomCode, "Partie streamer introuvable.");
      return;
    }
    advanceStreamerRound(io, roomCode);
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    for (const roomCode of rooms) {
      const state = getRealtimeState(roomCode);
      if (state && state.phase === "GUESSING") {
        // Mark the player as disconnected instead of recording an empty answer.
        // This way they are excluded from allAnswerablePlayers() and won't
        // trigger a premature reveal that steals time from other players.
        markDisconnected(roomCode, currentUser.id);
        // Re-check if remaining answerable players have all answered
        const answerable = allAnswerablePlayers(roomCode);
        const everyoneAnswered = answerable.length > 0 && answerable.every(p => p.hasAnswered);
        if (everyoneAnswered) {
          clearRevealTimer(roomCode);
          const revealed = revealRound(roomCode);
          if (revealed) {
            io.to(roomCode).emit("game:round:reveal", {
              roomCode,
              round: revealed.currentRound,
              timing: revealed.timing,
              players: revealed.players,
            });
            if (revealed.phase === "FINISHED") {
              broadcastGameOver(io, roomCode);
            }
          }
        }
        broadcastState(io, roomCode);
      } else if (state && state.phase === "REVEAL") {
        // During REVEAL, mark disconnected so they don't block ready-check
        markDisconnected(roomCode, currentUser.id);
        broadcastState(io, roomCode);
      } else {
        // Not in active game: remove player entirely
        removePlayer(roomCode, currentUser.id);
      }
      io.to(roomCode).emit("room:presence", {
        type: "disconnected",
        roomCode,
        socketId: socket.id,
        userId: currentUser.id,
        serverTimestamp: Date.now(),
      });

      // Cleanup streamer game if the host disconnects
      const streamerState = getStreamerSnapshot(roomCode);
      if (streamerState && streamerState.hostUserId === currentUser.id) {
        cleanupStreamer(roomCode);
        io.to(roomCode).emit("state:sync", { ...streamerState, phase: "GAME_OVER" });
      }
    }
  });

  const tick = setInterval(() => {
    socket.emit("server:tick", { serverTimestamp: Date.now() });
  }, 5000);

  socket.on("disconnect", () => {
    clearInterval(tick);
    const before = getPresence(currentUser.id);
    const state = unregisterSocket(currentUser.id, socket.id);
    const contextChanged =
      before.context?.id !== state.context?.id || before.context?.type !== state.context?.type || before.roomCode !== state.roomCode;
    const stateChanged =
      before.status !== state.status ||
      before.online !== state.online ||
      before.activity !== state.activity;
    if (stateChanged || contextChanged) {
      broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
    }
  });

  // Always publish the current server time to help clients sync timers
});

app.use((_req, res) => {
  fail(res, "not_found", "Ressource introuvable", 404);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("internal_error", err);
  fail(res, "internal_error", "Erreur interne du serveur", 500);
});

const PORT = Number(process.env.PORT) || 8080;

async function bootstrap() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ PostgreSQL ready");
  } catch (error) {
    console.error("❌ Database connection failed", error);
    process.exit(1);
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Blindify API listening on port ${PORT}`);
  });
}

bootstrap();
