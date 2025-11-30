// Minimal File polyfill for Node 18 (used by undici dependencies)
if (!(globalThis as any).File) {
  class PolyfillFile extends Blob {
    name: string;
    lastModified: number;
    constructor(bits: BlobPart[], name: string, options: FilePropertyBag = {}) {
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
import { fail, ok } from "./utils/response";

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

const io = initSocket(server, allowedOrigins);

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
  max: 600, // higher burst
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

// Simple Origin/Referer check for state-changing requests
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
  socket.on("room:join", ({ roomCode, user }: { roomCode: string; user?: { id?: number; username?: string } }) => {
    if (!roomCode) return;
    socket.join(roomCode);
    io.to(roomCode).emit("room:presence", {
      type: "joined",
      roomCode,
      user,
      serverTimestamp: Date.now(),
    });
  });

  socket.on("room:leave", ({ roomCode, userId }: { roomCode: string; userId?: number }) => {
    if (!roomCode) return;
    socket.leave(roomCode);
    io.to(roomCode).emit("room:presence", {
      type: "left",
      roomCode,
      userId,
      serverTimestamp: Date.now(),
    });
  });

  socket.on(
    "game:start",
    (payload: {
      roomCode: string;
      sessionId: number;
      hostId: number;
      trackIds: string[];
    }) => {
      if (!payload?.roomCode) return;
      io.to(payload.roomCode).emit("game:start", {
        ...payload,
        serverTimestamp: Date.now(),
      });
    }
  );

  socket.on(
    "round:start",
    (payload: { roomCode: string; round: number; audioSourceId: string; revealAt: number }) => {
      if (!payload?.roomCode) return;
      io.to(payload.roomCode).emit("round:start", {
        ...payload,
        serverTimestamp: Date.now(),
      });
    }
  );

  socket.on(
    "round:end",
    (payload: { roomCode: string; round: number; leaderboard: unknown }) => {
      if (!payload?.roomCode) return;
      io.to(payload.roomCode).emit("round:end", {
        ...payload,
        serverTimestamp: Date.now(),
      });
    }
  );

  socket.on(
    "score:update",
    (payload: { roomCode: string; userId: number; score: number; accuracy: number }) => {
      if (!payload?.roomCode) return;
      io.to(payload.roomCode).emit("score:update", {
        ...payload,
        serverTimestamp: Date.now(),
      });
    }
  );

  socket.on("round:next", (payload: { roomCode: string; round?: number; revealAt?: number }) => {
    if (!payload?.roomCode) return;
    const now = Date.now();
    const revealAt = payload.revealAt && Number.isFinite(payload.revealAt) ? payload.revealAt : now + 45000;
    io.to(payload.roomCode).emit("round:next", {
      roomCode: payload.roomCode,
      round: payload.round,
      revealAt,
      serverTimestamp: now,
    });
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    for (const roomCode of rooms) {
      io.to(roomCode).emit("room:presence", {
        type: "disconnected",
        roomCode,
        socketId: socket.id,
        serverTimestamp: Date.now(),
      });
    }
  });
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
