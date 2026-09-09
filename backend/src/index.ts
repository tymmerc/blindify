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
import reportsRoutes from "./routes/reports";
import statsRoutes from "./routes/stats";
import audioSourcesRoutes from "./routes/audioSources";
import friendsRoutes from "./routes/friends";
import invitationsRoutes from "./routes/invitations";
import importRoutes from "./routes/import";
import linksRoutes from "./routes/links";
import { ensureLinksSchema } from "./controllers/linksController";
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
  "https://blindz.app",
  "https://tymmerc.eu",
  "https://tymmerc.eu/blindify",
  // Origine nue obligatoire : le header Origin n'a jamais de chemin
  // (l'entree avec /blindify ne sert que pour le referer).
  "https://dev.tymmerc.eu",
  "https://dev.tymmerc.eu/blindify",
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
  // 60/min et non 15 : derriere sslh tous les clients partagent 127.0.0.1,
  // la limite est donc GLOBALE (2 soirees simultanees depassaient 15 invites/min).
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "rate_limited", message: "Trop de requêtes. Réessaye dans 1 minute." } },
  // Bypass E2E par secret partagé (E2E_BYPASS_KEY) : la suite sérielle crée
  // >15 sessions invité/min et cascadait en 429. Un header d'origine IP est
  // impossible ici : sslh (non-transparent) est devant nginx, donc TOUTES les
  // requêtes arrivent en 127.0.0.1. Le secret n'est connu que des tests locaux.
  skip: req => {
    const key = process.env.E2E_BYPASS_KEY;
    return Boolean(key) && req.headers["x-e2e-key"] === key;
  },
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
  // Comparaison STRICTE : egalite exacte, ou prefixe borne par un "/".
  // Un simple startsWith laissait passer https://blindz.app.evil.com (CSRF).
  const matchesAllowed = (value: string): boolean =>
    allowedOrigins.some(o => value === o || value.startsWith(o.endsWith("/") ? o : `${o}/`));
  const allowed = matchesAllowed(origin) || matchesAllowed(referer);
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
app.use("/api/links", linksRoutes);
app.use("/api/quick-play", quickPlayRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/reports", reportsRoutes);

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

  // Schema de la bibliotheque de liens des le BOOT : le poll room details y fait
// reference, un premier deploiement sans la table crash-loopait le serveur.
ensureLinksSchema().catch(err => logger.error("links_schema_boot_failed", { error: err }));

// Index manquants sur les colonnes FK les plus sollicitees : sans eux, chaque
// suppression en cascade (sessions, rooms, invites) declenche des seq scans.
// IF NOT EXISTS : idempotent, tables petites, cout de creation negligeable.
async function ensurePerformanceIndexes(): Promise<void> {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_audio_sources_link_id ON audio_sources(link_id)`,
    `CREATE INDEX IF NOT EXISTS idx_game_rounds_audio_source ON game_rounds(audio_source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_game_participants_user ON game_participants(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_round_responses_user ON round_responses(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_multiplayer_rooms_host ON multiplayer_rooms(host_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_multiplayer_rooms_status ON multiplayer_rooms(status)`,
    `CREATE INDEX IF NOT EXISTS idx_multiplayer_rooms_session ON multiplayer_rooms(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_room_invitations_from ON room_invitations(from_user)`,
    `CREATE INDEX IF NOT EXISTS idx_likes_audio_source ON likes(audio_source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_uploads_audio_source ON uploads(audio_source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id)`,
  ];
  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (err) {
      logger.error("ensure_index_failed", { sql, error: err });
    }
  }
}
ensurePerformanceIndexes().catch(err => logger.error("ensure_indexes_boot_failed", { error: err }));

// ── Janitor periodique : la base ne doit plus gonfler sans fin ──
// Sessions expirees, rooms zombies, historique de jeu ancien, et invites morts
// qui gardaient la propriete de morceaux partages (une ligne audio_sources est
// unique par chanson pour TOUTE la plateforme : on DETACHE, on ne supprime
// jamais physiquement, pour que le prochain importeur reclame le morceau).
const JANITOR_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEAD_GUEST_FILTER = `
      SELECT u.id FROM users u
      WHERE u.provider = 'guest'
        AND u.created_at < NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM user_sessions s
          WHERE s.user_id = u.id AND s.expires_at > NOW())
        AND NOT EXISTS (
          SELECT 1 FROM room_participants rp
          JOIN multiplayer_rooms r ON r.id = rp.room_id
          WHERE rp.user_id = u.id AND r.created_at > NOW() - INTERVAL '30 days')
        AND NOT EXISTS (
          SELECT 1 FROM multiplayer_rooms mr
          WHERE mr.host_user_id = u.id AND mr.created_at > NOW() - INTERVAL '30 days')
      LIMIT 500`;

async function runJanitor(): Promise<void> {
  const step = async (label: string, sql: string): Promise<void> => {
    try {
      const res = await pool.query(sql);
      if (res.rowCount) logger.info("janitor", { step: label, rows: res.rowCount });
    } catch (err) {
      logger.error("janitor_step_failed", { step: label, error: err });
    }
  };
  await step("expired_sessions",
    `DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '1 day'`);
  await step("zombie_rooms",
    `UPDATE multiplayer_rooms
     SET status='finished', completed_at=COALESCE(completed_at, NOW())
     WHERE status='in_progress'
       AND COALESCE(started_at, created_at) < NOW() - INTERVAL '24 hours'`);
  await step("old_rooms",
    `DELETE FROM multiplayer_rooms
     WHERE status IN ('finished', 'waiting')
       AND created_at < NOW() - INTERVAL '7 days'`);
  await step("stale_game_sessions",
    `UPDATE game_sessions
     SET state='abandoned', ended_at=COALESCE(ended_at, NOW())
     WHERE state='in_progress'
       AND started_at < NOW() - INTERVAL '24 hours'`);
  // La FAQ promet un historique retrouvable pendant UN AN avec un compte
  // (/games/history lit game_sessions) : retention 400 jours, pas moins.
  await step("old_game_sessions",
    `DELETE FROM game_sessions
     WHERE started_at < NOW() - INTERVAL '400 days'`);
  await step("dead_guest_tracks",
    `UPDATE audio_sources SET user_id = NULL, link_id = NULL
     WHERE user_id IN (${DEAD_GUEST_FILTER})`);
  await step("dead_guests",
    `DELETE FROM users
     WHERE id IN (${DEAD_GUEST_FILTER})
       AND NOT EXISTS (SELECT 1 FROM audio_sources a WHERE a.user_id = users.id)`);
}
setInterval(() => { void runJanitor(); }, JANITOR_INTERVAL_MS).unref?.();
// Premiere passe peu apres le boot (laisse la creation des index passer avant).
setTimeout(() => { void runJanitor(); }, 2 * 60 * 1000).unref?.();

// Filet : une rejection non geree ne doit pas tuer le serveur d'une soiree
// (Node 22 crash par defaut). On logge fort, on continue.
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", { reason: String(reason) });
});

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
