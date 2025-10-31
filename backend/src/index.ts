/**
 * =============================================================================
 * BLINDIFY BACKEND — COMPLETE STABLE VERSION
 * =============================================================================
 * - auto-migration (source_id)
 * - solo mode non-répétitif (blacklist)
 * - socket.io ready
 * - rooms routes intégrées
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import cookieSession from "cookie-session";
import http from "http";
import axios from "axios";
import { pool } from "./config/db";
import { makeSpotify } from "./config/spotify";
import { initSocket} from "./socket";
import roomsRoutes from "./routes/rooms";

dotenv.config();

const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "user-top-read",
  "playlist-read-private",
  "user-read-recently-played",
  "user-library-modify",
];

interface AuthenticatedUser {
  id: number;
  spotify_id: string;
  username: string | null;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  level: number;
  xp: number;
}

interface GameSession {
  id: number;
  user_id: number;
  mode: "solo" | "multiplayer";
  difficulty: "easy" | "normal" | "hard";
  source: string;
  total_questions: number;
}

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "https://blindify-chi.vercel.app",
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean) as string[];

const ioServer = initSocket(server, allowedOrigins);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(slowDown({ windowMs: 60_000, delayAfter: 60, delayMs: () => 100 }));
app.use(
  cookieSession({
    name: "blindify_session",
    secret: process.env.SESSION_SECRET || "CHANGE_ME",
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  })
);
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});


// --- DB Setup ----------------------------------------------------------------
async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT NOW()");
    client.release();
    console.log("✅ PostgreSQL connected");
    return true;
  } catch (err) {
    console.error("❌ PostgreSQL failed:", err);
    return false;
  }
}

async function ensureSchema() {
  await pool.query(`
    ALTER TABLE game_sessions
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blacklist_user_track ON track_blacklist(user_id, track_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blacklist_until ON track_blacklist(blacklisted_until);
  `);
  console.log("✅ Schema verified / updated");
}

// --- Helpers -----------------------------------------------------------------
async function getUserByAccessToken(authHeader?: string) {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { rows } = await pool.query<AuthenticatedUser>(
    `SELECT * FROM users WHERE access_token=$1 LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

async function blacklistTracks(userId: number, trackIds: string[], hours = 24) {
  const until = new Date(Date.now() + hours * 3600 * 1000);
  for (const spotifyId of trackIds) {
    const { rows } = await pool.query<{ id: number }>(
      "SELECT id FROM tracks WHERE spotify_track_id=$1",
      [spotifyId]
    );
    if (rows[0])
      await pool.query(
        `INSERT INTO track_blacklist (user_id, track_id, blacklisted_until)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id, track_id)
         DO UPDATE SET blacklisted_until=EXCLUDED.blacklisted_until`,
        [userId, rows[0].id, until]
      );
  }
}

async function getBlacklistedSpotifyIds(userId: number): Promise<Set<string>> {
  const { rows } = await pool.query<{ spotify_track_id: string }>(
    `SELECT t.spotify_track_id
     FROM track_blacklist b
     JOIN tracks t ON t.id=b.track_id
     WHERE b.user_id=$1 AND b.blacklisted_until>NOW()`,
    [userId]
  );
  return new Set(rows.map((r) => r.spotify_track_id));
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// --- Routes ------------------------------------------------------------------
app.get("/auth/login", (_req: Request, res: Response) => {
  const api = makeSpotify();
  const state = Math.random().toString(36).substring(7);
  const url = api.createAuthorizeURL(SPOTIFY_SCOPES, state);
  res.redirect(url);
});

app.get("/auth/callback", async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || "");
    const api = makeSpotify();
    const grant = await api.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = grant.body;
    const { data: profile } = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    await pool.query(
      `INSERT INTO users (spotify_id, username, email, access_token, refresh_token, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
       ON CONFLICT (spotify_id)
       DO UPDATE SET username=EXCLUDED.username, access_token=EXCLUDED.access_token,
                     refresh_token=EXCLUDED.refresh_token, updated_at=NOW()`,
      [
        profile.id,
        profile.display_name || "Unknown",
        profile.email || null,
        access_token,
        refresh_token,
      ]
    );
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(
      `${frontendUrl}/auth/callback?access_token=${access_token}&expires_in=${expires_in}`
    );
  } catch (err) {
    console.error("❌ Auth callback error:", err);
    res.status(500).send("Auth failed");
  }
});

app.post("/api/games/solo/start", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { difficulty = "normal", source = "liked_tracks", count = 10 } = req.body;
    const spotify = makeSpotify(user.access_token || undefined, user.refresh_token || undefined);
    const blacklisted = await getBlacklistedSpotifyIds(user.id);

    const data = await spotify.getMySavedTracks({ limit: Math.max(count * 3, 50) });
    const available = data.body.items
      .map((i: any) => i.track)
      .filter((t: any) => t.preview_url && !blacklisted.has(t.id));

    if (available.length === 0) {
      res.status(400).json({ error: "No tracks available" });
      return;
    }

    const tracks = pickRandom(available, count).map((t: any) => ({
      spotify_track_id: t.id,
      title: t.name,
      artist: t.artists.map((a: any) => a.name).join(", "),
      album: t.album.name,
      preview_url: t.preview_url,
      album_cover: t.album.images[0]?.url || null,
      duration_ms: t.duration_ms,
      popularity: t.popularity,
    }));

    const sessionResult = await pool.query<GameSession>(
      `INSERT INTO game_sessions (user_id, mode, difficulty, source, source_id, total_questions)
       VALUES ($1,'solo',$2,$3,NULL,$4) RETURNING *`,
      [user.id, difficulty, source, count]
    );
    const session = sessionResult.rows[0];

    for (const track of tracks) {
      await pool.query(
        `INSERT INTO tracks (spotify_track_id, title, artist, album, preview_url, album_cover,
                              duration_ms, popularity, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (spotify_track_id) DO NOTHING`,
        [
          track.spotify_track_id,
          track.title,
          track.artist,
          track.album,
          track.preview_url,
          track.album_cover,
          track.duration_ms,
          track.popularity,
          user.id,
        ]
      );
    }

    await blacklistTracks(user.id, tracks.map((t) => t.spotify_track_id), 24);

    res.json({ sessionId: session.id, tracks });
    return;
  } catch (error) {
    console.error("❌ Error starting solo game:", error);
    res.status(500).json({ error: "Failed to start game" });
    return;
  }
});


// --- Routes multi ------------------------------------------------------------
app.use("/api/rooms", roomsRoutes);

// --- Sockets -----------------------------------------------------------------
ioServer.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  socket.on("join-room", (roomCode: string) => {
    socket.join(roomCode);
    ioServer.to(roomCode).emit("player-joined", { socketId: socket.id });
  });
  socket.on("disconnect", () => console.log(`❌ Disconnected: ${socket.id}`));
});

// --- Errors ------------------------------------------------------------------
app.use((_req: Request, res: Response) => res.status(404).json({ error: "Not Found" }));
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("❌ Internal error:", err);
  res.status(500).json({ error: "Internal error" });
});

// --- Start -------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  const db = await testConnection();
  if (!db) process.exit(1);
  await ensureSchema();
  server.listen(PORT, "0.0.0.0", () => console.log(`🚀 BLINDIFY API ready on ${PORT}`));
})();
