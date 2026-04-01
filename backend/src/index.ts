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
import challengeRoutes from "./routes/challenges";
import { fail, ok } from "./utils/response";
import { getSessionContext } from "./utils/session";
import {
  getPresence,
  getPresenceForUsers,
  emitToUser,
  findStalePresences,
  PRESENCE_HEARTBEAT_TTL_MS,
  setPresence,
  getUserSockets,
} from "./services/presence";
import { expireOldInvitations, getAcceptedFriendIds, type ExpiredInvitation } from "./services/social";
import { registerSocketHandlers, broadcastFriendPresence } from "./socketHandlers";
import { logger } from "./utils/logger";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === "CHANGE_ME") {
  logger.error("❌ SESSION_SECRET is not set. Please define a strong secret in the environment.");
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
    .catch(err => logger.error("invitation_cleanup_failed", { error: err }));
}, 30_000);

// Cleanup stale rooms (waiting > 30 min with no activity)
setInterval(() => {
  pool.query(
    `DELETE FROM multiplayer_rooms
     WHERE status = 'waiting'
     AND (SELECT MAX(joined_at) FROM room_participants WHERE room_id = multiplayer_rooms.id)
         < NOW() - INTERVAL '30 minutes'`
  ).then(res => {
    if (res.rowCount && res.rowCount > 0) {
      logger.info("stale_rooms_cleaned", { count: res.rowCount });
    }
  }).catch(err => logger.error("room_cleanup_failed", { error: err }));
}, 60_000);

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
      broadcastFriendPresence(userId, username).catch(err => logger.error("presence_sweep_broadcast_failed", { error: err }));
    }
  });
}, PRESENCE_SWEEP_INTERVAL_MS);

const io = initSocket(server, allowedOrigins);

registerSocketHandlers(io, lastKnownUsername);

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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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
app.use("/api/challenges", challengeRoutes);

app.use((_req, res) => {
  fail(res, "not_found", "Ressource introuvable", 404);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("internal_error", { error: err.message, stack: err.stack });
  fail(res, "internal_error", "Erreur interne du serveur", 500);
});

const PORT = Number(process.env.PORT) || 8080;

async function bootstrap() {
  try {
    await pool.query("SELECT 1");
    logger.info("✅ PostgreSQL ready");
  } catch (error) {
    logger.error("❌ Database connection failed", { error });
    process.exit(1);
  }

  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`🚀 Blindify API listening on port ${PORT}`);
  });
}

bootstrap();

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info("HTTP server closed");
    pool.end().then(() => {
      logger.info("Database pool closed");
      process.exit(0);
    }).catch(() => process.exit(1));
  });
  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
