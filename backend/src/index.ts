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
import { fail, ok } from "./utils/response";
import { getRoomState, touchRoomState, updateRoomRound } from "./services/gameState";
import { getSessionContextFromToken, type SessionContext } from "./utils/session";

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

type ReadyState = {
  round: number;
  ready: Set<number>;
};

const readyStates = new Map<string, ReadyState>();

function resetReadyState(roomCode: string, round: number): void {
  readyStates.set(roomCode, { round, ready: new Set() });
}

function markReady(roomCode: string, round: number, userId: number): void {
  const current = readyStates.get(roomCode);
  if (!current || current.round !== round) {
    readyStates.set(roomCode, { round, ready: new Set([userId]) });
    return;
  }
  current.ready.add(userId);
}

function isEveryoneReady(roomCode: string, round: number, participants: number[]): boolean {
  const state = readyStates.get(roomCode);
  if (!state || state.round !== round) return false;
  return participants.every(p => state.ready.has(p));
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
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", "*"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", "https://api.spotify.com", ...allowedOrigins],
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
    req.path?.startsWith("/api/auth") ||
    req.path?.startsWith("/socket.io"),
});

app.use(apiLimiter);

app.use(
  slowDown({
    windowMs: 60_000,
    delayAfter: 120,
    delayMs: () => 50,
    skip: req =>
      req.path?.startsWith("/api/rooms") ||
      req.path?.startsWith("/api/auth") ||
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

app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/games", gamesRoutes);
app.use("/api/likes", likesRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/audio-sources", audioSourcesRoutes);

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

  const rejectState = (roomCode: string, state?: { stateHash: string; round: number; totalRounds: number }, message?: string) => {
    socket.emit("state:invalid", {
      roomCode,
      currentState: state ?? null,
      message: message ?? "Game state mismatch. Refreshing...",
    });
  };

  const requireState = (roomCode: string, incomingHash?: string) => {
    const state = getRoomState(roomCode);
    if (!state) {
      rejectState(roomCode, undefined, "Missing game state for this room. Please refresh.");
      return null;
    }
    if (!incomingHash || incomingHash !== state.stateHash) {
      rejectState(roomCode, state);
      return null;
    }
    return state;
  };

  socket.on("room:join", async ({ roomCode }: { roomCode: string }) => {
    if (!roomCode) return;
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) {
      emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
      return;
    }
    socket.join(roomCode);
    io.to(roomCode).emit("room:presence", {
      type: "joined",
      roomCode,
      user: { id: currentUser.id, username: currentUser.username ?? undefined },
      serverTimestamp: Date.now(),
    });
  });

  socket.on("room:leave", async ({ roomCode }: { roomCode: string }) => {
    if (!roomCode) return;
    socket.leave(roomCode);
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) return;
    io.to(roomCode).emit("room:presence", {
      type: "left",
      roomCode,
      userId: currentUser.id,
      serverTimestamp: Date.now(),
    });
  });

  socket.on(
    "round:start",
    async (payload: { roomCode: string; round: number; audioSourceId: string; revealAt: number; stateHash?: string }) => {
      if (!payload?.roomCode) return;
      const access = await requireRoomAccess(payload.roomCode, currentUser.id);
      if (!access) {
        emitRoomError(socket, payload.roomCode, "Accès refusé à cette salle.");
        return;
      }
      if (!access.isHost) {
        emitRoomError(socket, payload.roomCode, "Seul l'hôte peut démarrer un round.", "host_only");
        return;
      }
      const state = requireState(payload.roomCode, payload.stateHash);
      if (!state) return;
      touchRoomState(payload.roomCode);
      io.to(payload.roomCode).emit("round:start", {
        ...payload,
        stateHash: state.stateHash,
        serverTimestamp: Date.now(),
      });
    }
  );

  socket.on(
    "round:end",
    async (payload: { roomCode: string; round: number; leaderboard: unknown; stateHash?: string }) => {
      if (!payload?.roomCode) return;
      const access = await requireRoomAccess(payload.roomCode, currentUser.id);
      if (!access) {
        emitRoomError(socket, payload.roomCode, "Accès refusé à cette salle.");
        return;
      }
      if (!access.isHost) {
        emitRoomError(socket, payload.roomCode, "Seul l'hôte peut arrêter un round.", "host_only");
        return;
      }
      const state = requireState(payload.roomCode, payload.stateHash);
      if (!state) return;
      if (payload.round !== state.round) {
        rejectState(payload.roomCode, state, "Round index mismatch. Refreshing room state.");
        return;
      }
      touchRoomState(payload.roomCode);
      io.to(payload.roomCode).emit("round:end", {
        ...payload,
        stateHash: state.stateHash,
        serverTimestamp: Date.now(),
      });
    }
  );

  socket.on(
    "score:update",
    async (payload: { roomCode: string; userId: number; score: number; accuracy: number; stateHash?: string }) => {
      if (!payload?.roomCode) return;
      const access = await requireRoomAccess(payload.roomCode, currentUser.id);
      if (!access) {
        emitRoomError(socket, payload.roomCode, "Accès refusé à cette salle.");
        return;
      }
      if (payload.userId !== currentUser.id) {
        emitRoomError(socket, payload.roomCode, "Mise à jour de score refusée pour un autre joueur.", "invalid_score");
        return;
      }
      const state = requireState(payload.roomCode, payload.stateHash);
      if (!state) return;
      const score = Number.isFinite(payload.score) ? Math.max(0, Math.floor(payload.score)) : 0;
      const accuracy = Number.isFinite(payload.accuracy) ? Math.max(0, Math.min(100, Math.floor(payload.accuracy))) : 0;
      io.to(payload.roomCode).emit("score:update", {
        roomCode: payload.roomCode,
        userId: currentUser.id,
        score,
        accuracy,
        stateHash: state.stateHash,
        serverTimestamp: Date.now(),
      });
    }
  );

  socket.on("round:ready", async ({ roomCode, round }: { roomCode: string; round: number }) => {
    if (!roomCode || typeof round !== "number") return;
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) {
      emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
      return;
    }
    markReady(roomCode, round, currentUser.id);
    io.to(roomCode).emit("round:ready:update", {
      roomCode,
      round,
      userId: currentUser.id,
      serverTimestamp: Date.now(),
    });
  });

  socket.on("round:next", async (payload: { roomCode: string; round?: number; revealAt?: number; stateHash?: string }) => {
    if (!payload?.roomCode) return;
    const access = await requireRoomAccess(payload.roomCode, currentUser.id);
    if (!access) {
      emitRoomError(socket, payload.roomCode, "Accès refusé à cette salle.");
      return;
    }
    if (!access.isHost) {
      emitRoomError(socket, payload.roomCode, "Seul l'hôte peut avancer les rounds.", "host_only");
      return;
    }
    const targetRound = typeof payload.round === "number" ? payload.round : null;
    const state = requireState(payload.roomCode, payload.stateHash);
    if (!state) return;
    const nextRound = targetRound ?? state.round + 1;
    if (nextRound <= state.round || nextRound > state.totalRounds) {
      rejectState(payload.roomCode, state, "Invalid round transition.");
      return;
    }
    // Gating: ensure all participants have marked ready for the current round before advancing
    const { rows: participantRows } = await pool.query<{ user_id: number }>(
      `SELECT user_id FROM room_participants WHERE room_id=$1`,
      [access.room.id]
    );
    const participantIds = participantRows.map(r => r.user_id);
    if (participantIds.length) {
      const everyoneReady = isEveryoneReady(payload.roomCode, state.round, participantIds);
      if (!everyoneReady) {
        emitRoomError(socket, payload.roomCode, "Tous les joueurs n'ont pas confirmé la manche.", "waiting_players");
        return;
      }
    }
    const { rows: nextTrackRows } = await pool.query<{
      round: number;
      audioSourceId: number | string;
      trackId: string;
      provider: string | null;
      title: string | null;
      artist: string | null;
      audioUrl: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT gr.round_index AS round,
              s.id AS "audioSourceId",
              COALESCE(s.external_id, s.id::text) AS "trackId",
              s.provider AS provider,
              s.title,
              s.artist,
              s.audio_url AS "audioUrl",
              s.metadata
       FROM game_rounds gr
       LEFT JOIN audio_sources s ON s.id = gr.audio_source_id
       WHERE gr.session_id=$1 AND gr.round_index=$2
       LIMIT 1`,
      [state.sessionId, nextRound]
    );
    const nextTrack = nextTrackRows[0];
    if (!nextTrack) {
      rejectState(payload.roomCode, state, "Track introuvable pour la prochaine manche.");
      return;
    }
    const updated = updateRoomRound(payload.roomCode, nextRound) ?? state;
    resetReadyState(payload.roomCode, nextRound);
    const now = Date.now();
    const revealAt = payload.revealAt && Number.isFinite(payload.revealAt) ? payload.revealAt : now + 45000;
    const startPayload = {
      roomCode: payload.roomCode,
      round: nextRound,
      trackId: nextTrack.trackId,
      audioSourceId: nextTrack.audioSourceId,
      revealAt,
      stateHash: updated.stateHash,
      serverTimestamp: now,
      provider: nextTrack.provider,
    };
    // Canonical event for synchronising all players (host + invités)
    io.to(payload.roomCode).emit("round:started", startPayload);
    // Backwards compatibility with older clients still listening to round:next
    io.to(payload.roomCode).emit("round:next", startPayload);
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    for (const roomCode of rooms) {
      io.to(roomCode).emit("room:presence", {
        type: "disconnected",
        roomCode,
        socketId: socket.id,
        userId: currentUser.id,
        serverTimestamp: Date.now(),
      });
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
