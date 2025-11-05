/**
 * =============================================================================
 * BLINDIFY BACKEND — COMPLETE STABLE VERSION
 * =============================================================================
 */

import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
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
import { initSocket } from "./socket";
import roomsRoutes from "./routes/rooms";
import likesRouter from "./routes/likes";
import { getSessionContext, clearSession } from "./utils/session";
import type { AuthenticatedUser } from "./types/user";

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

const FALLBACK_PLAYLISTS = [
  "37i9dQZF1DXcBWIGoYBM5M", // Today's Top Hits
  "37i9dQZF1DX0XUsuxWHRQd", // All Out 00s
  "37i9dQZF1DX4VzleG8lP50", // Pop Sauce
];

const FALLBACK_GENRES = ["pop", "rock", "edm", "hip-hop", "indie"];

const STATIC_FALLBACK_TRACKS: SpotifyTrack[] = [
  {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    name: "Blinding Lights",
    artists: [{ name: "The Weeknd" }],
    album: {
      name: "After Hours",
      images: [{ url: "https://i.scdn.co/image/ab67616d0000b273a4de26a2a0cf0f962d9a389d" }],
    },
    preview_url:
      "https://p.scdn.co/mp3-preview/4f3d8f8cda146cccea62e7e0349395fac5761b1c?cid=1",
    duration_ms: 200040,
    popularity: 95,
  },
  {
    id: "2Fxmhks0bxGSBdJ92vM42m",
    name: "bad guy",
    artists: [{ name: "Billie Eilish" }],
    album: {
      name: "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?",
      images: [{ url: "https://i.scdn.co/image/ab67616d0000b273fd77a7080f8335a7b94439c6" }],
    },
    preview_url:
      "https://p.scdn.co/mp3-preview/0cbb6a421be2858e577f93c7cdd11abbd88abee5?cid=1",
    duration_ms: 194087,
    popularity: 91,
  },
  {
    id: "7qiZfU4dY1lWllzX7mPBI3",
    name: "Shape of You",
    artists: [{ name: "Ed Sheeran" }],
    album: {
      name: "÷ (Deluxe)",
      images: [{ url: "https://i.scdn.co/image/ab67616d0000b2732f5d6d203c49b1115c3a1e75" }],
    },
    preview_url:
      "https://p.scdn.co/mp3-preview/6a2c7f85d0e5aed0881c9f1c3d4b63a5e0b1ed4b?cid=1",
    duration_ms: 233712,
    popularity: 95,
  },
  {
    id: "35mvY5S1H3J2QZyna3TFe0",
    name: "Levitating",
    artists: [{ name: "Dua Lipa" }],
    album: {
      name: "Future Nostalgia",
      images: [{ url: "https://i.scdn.co/image/ab67616d0000b2737206019b2ff6f7f02e97142c" }],
    },
    preview_url:
      "https://p.scdn.co/mp3-preview/1bb547652004e3d037fad0a9d6236551cc4036d1?cid=1",
    duration_ms: 203064,
    popularity: 89,
  },
  {
    id: "24JygzOLM0EmRQeGtFcIcG",
    name: "Hey Ya!",
    artists: [{ name: "Outkast" }],
    album: {
      name: "Speakerboxxx/The Love Below",
      images: [{ url: "https://i.scdn.co/image/ab67616d0000b273d1a3cd95528ca9f63753ce7a" }],
    },
    preview_url:
      "https://p.scdn.co/mp3-preview/64b4e2f2f9ce2f48abeb8491bfc2c0b2c6b81998?cid=1",
    duration_ms: 238266,
    popularity: 82,
  },
];

interface GameSession {
  id: number;
  user_id: number;
  mode: "solo" | "multiplayer";
  difficulty: "easy" | "normal" | "hard";
  source: string;
  total_questions: number;
}

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

const allowedOrigins = [
  "https://blindify-chi.vercel.app",
  "https://blindify-production.up.railway.app",
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean) as string[];

const ioServer = initSocket(server, allowedOrigins);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60000, max: 120 }));
app.use(slowDown({ windowMs: 60000, delayAfter: 60, delayMs: () => 100 }));

app.use(
  cookieSession({
    name: "blindify_session",
    secret: process.env.SESSION_SECRET || "CHANGE_ME",
    maxAge: 86400000,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  })
);

app.get("/health", (_req, res) => res.status(200).send("OK"));

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
  await pool.query(`ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_blacklist_user_track ON track_blacklist(user_id, track_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_blacklist_until ON track_blacklist(blacklisted_until);`);
  await pool.query(`
    DELETE FROM tracks a
    USING tracks b
    WHERE a.id > b.id AND a.spotify_track_id = b.spotify_track_id;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tracks_spotify_unique'
      ) THEN
        ALTER TABLE tracks ADD CONSTRAINT tracks_spotify_unique UNIQUE (spotify_track_id);
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'track_blacklist_user_track_unique'
      ) THEN
        ALTER TABLE track_blacklist
          ADD CONSTRAINT track_blacklist_user_track_unique
          UNIQUE (user_id, track_id);
      END IF;
    END $$;
  `);
}

async function blacklistTracks(userId: number, trackIds: string[], hours = 24) {
  const until = new Date(Date.now() + hours * 3600 * 1000);
  for (const spotifyId of trackIds) {
    const { rows } = await pool.query<{ id: number }>(`SELECT id FROM tracks WHERE spotify_track_id=$1`, [spotifyId]);
    if (rows[0]) {
      await pool.query(
        `INSERT INTO track_blacklist (user_id, track_id, blacklisted_until)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id, track_id)
         DO UPDATE SET blacklisted_until=EXCLUDED.blacklisted_until`,
        [userId, rows[0].id, until]
      );
    }
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
  return new Set(rows.map(r => r.spotify_track_id));
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  preview_url: string | null;
  duration_ms: number;
  popularity: number;
};

async function fetchSavedTracks(
  spotify: ReturnType<typeof makeSpotify>,
  desired: number,
  blacklist: Set<string>
): Promise<SpotifyTrack[]> {
  const collected: SpotifyTrack[] = [];
  const pageSize = 50;
  for (let offset = 0; offset < 250 && collected.length < desired * 3; offset += pageSize) {
    const data = await spotify.getMySavedTracks({ limit: pageSize, offset });
    for (const item of data.body.items ?? []) {
      const track: SpotifyTrack | undefined = item?.track;
      if (!track || !track.preview_url || blacklist.has(track.id)) continue;
      if (!collected.find(t => t.id === track.id)) {
        collected.push(track);
      }
    }
    if (!data.body.items || data.body.items.length < pageSize) break;
  }
  return collected;
}

async function fetchTopTracks(
  spotify: ReturnType<typeof makeSpotify>,
  desired: number,
  blacklist: Set<string>
): Promise<SpotifyTrack[]> {
  const collected: SpotifyTrack[] = [];
  for (const range of ["short_term", "medium_term", "long_term"] as const) {
    if (collected.length >= desired * 3) break;
    const data = await spotify.getMyTopTracks({ limit: 50, time_range: range });
    for (const track of data.body.items ?? []) {
      if (!track.preview_url || blacklist.has(track.id)) continue;
      if (!collected.find(t => t.id === track.id)) {
        collected.push(track as SpotifyTrack);
      }
    }
  }
  return collected;
}

async function fetchRecentTracks(
  spotify: ReturnType<typeof makeSpotify>,
  desired: number,
  blacklist: Set<string>
): Promise<SpotifyTrack[]> {
  const collected: SpotifyTrack[] = [];
  const data = await spotify.getMyRecentlyPlayedTracks({ limit: 50 });
  for (const item of data.body.items ?? []) {
    const track: SpotifyTrack | undefined = item?.track as SpotifyTrack | undefined;
    if (!track || !track.preview_url || blacklist.has(track.id)) continue;
    if (!collected.find(t => t.id === track.id)) {
      collected.push(track);
    }
    if (collected.length >= desired * 3) break;
  }
  return collected;
}

async function fetchFromPlaylists(
  spotify: ReturnType<typeof makeSpotify>,
  desired: number,
  blacklist: Set<string>
): Promise<SpotifyTrack[]> {
  const collected: SpotifyTrack[] = [];
  for (const playlistId of FALLBACK_PLAYLISTS) {
    if (collected.length >= desired * 3) break;
    const data = await spotify.getPlaylistTracks(playlistId, { limit: 100, market: "from_token" });
    for (const item of data.body.items ?? []) {
      const track = item?.track as SpotifyTrack | undefined;
      if (!track || !track.preview_url || blacklist.has(track.id)) continue;
      if (!collected.find(t => t.id === track.id)) {
        collected.push(track);
      }
      if (collected.length >= desired * 3) break;
    }
  }
  return collected;
}

async function fetchRecommendations(
  spotify: ReturnType<typeof makeSpotify>,
  desired: number,
  blacklist: Set<string>
): Promise<SpotifyTrack[]> {
  const collected: SpotifyTrack[] = [];
  for (const genre of FALLBACK_GENRES) {
    if (collected.length >= desired * 3) break;
    const data = await spotify.getRecommendations({
      seed_genres: [genre],
      limit: 50,
    });
    for (const track of data.body.tracks ?? []) {
      if (!track.preview_url || blacklist.has(track.id)) continue;
      if (!collected.find(t => t.id === track.id)) {
        collected.push(track as SpotifyTrack);
      }
      if (collected.length >= desired * 3) break;
    }
  }
  return collected;
}

async function gatherTracks(
  spotify: ReturnType<typeof makeSpotify>,
  source: string,
  desired: number,
  blacklist: Set<string>
): Promise<{ sourceUsed: string; tracks: SpotifyTrack[] }> {
  async function tryFetch(label: string, fetcher: () => Promise<SpotifyTrack[]>): Promise<SpotifyTrack[]> {
    try {
      return await fetcher();
    } catch (err) {
      console.error(`fetch_${label}_failed`, err);
      return [];
    }
  }

  const attempts: string[] = [];
  switch (source) {
    case "top_tracks":
      attempts.push("top_tracks", "liked_tracks", "recent_tracks");
      break;
    case "recent_tracks":
    case "recently_played":
      attempts.push("recent_tracks", "liked_tracks", "top_tracks");
      break;
    case "playlist":
      attempts.push("liked_tracks", "top_tracks", "recent_tracks");
      break;
    default:
      attempts.push("liked_tracks", "top_tracks", "recent_tracks");
      break;
  }

  for (const attempt of attempts) {
    let fetched: SpotifyTrack[] = [];
    if (attempt === "liked_tracks") {
      fetched = await tryFetch("saved_tracks", () => fetchSavedTracks(spotify, desired, blacklist));
    } else if (attempt === "top_tracks") {
      fetched = await tryFetch("top_tracks", () => fetchTopTracks(spotify, desired, blacklist));
    } else {
      fetched = await tryFetch("recent_tracks", () => fetchRecentTracks(spotify, desired, blacklist));
    }

    if (fetched.length) {
      return { sourceUsed: attempt, tracks: fetched };
    }
  }

  const curatedTracks = await tryFetch("curated", () => fetchFromPlaylists(spotify, desired, blacklist));
  if (curatedTracks.length) {
    return { sourceUsed: "curated", tracks: curatedTracks };
  }

  const recommendedTracks = await tryFetch("recommendations", () => fetchRecommendations(spotify, desired, blacklist));
  if (recommendedTracks.length) {
    return { sourceUsed: "recommendations", tracks: recommendedTracks };
  }

  const staticTracks = STATIC_FALLBACK_TRACKS.filter(track => !blacklist.has(track.id));
  if (staticTracks.length) {
    return { sourceUsed: "static", tracks: staticTracks };
  }

  return { sourceUsed: source, tracks: [] };
}

/**
 * AUTH
 */
app.get("/auth/login", (req, res) => {
  const api = makeSpotify();
  const state = crypto.randomUUID();
  if (!req.session) {
    req.session = {};
  }
  req.session.oauthState = state;
  const url = api.createAuthorizeURL(SPOTIFY_SCOPES, state);
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const storedState = req.session?.oauthState;

    if (!code) {
      res.status(400).send("Missing Spotify code");
      return;
    }

    if (!storedState || !state || storedState !== state) {
      clearSession(req);
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
      res.redirect(`${frontendUrl}/auth/login?error=state_mismatch`);
      return;
    }

    const api = makeSpotify();
    const grant = await api.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = grant.body;

    const { data: profile } = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { rows } = await pool.query<AuthenticatedUser>(
      `INSERT INTO users (spotify_id, username, email, access_token, refresh_token, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
       ON CONFLICT (spotify_id)
       DO UPDATE SET username=EXCLUDED.username, access_token=EXCLUDED.access_token,
                     refresh_token=COALESCE(EXCLUDED.refresh_token, users.refresh_token), updated_at=NOW()
       RETURNING id, spotify_id, username, email, access_token, refresh_token, level, xp`,
      [profile.id, profile.display_name || "Unknown", profile.email || null, access_token, refresh_token]
    );

    const user = rows[0];
    const session = req.session || {};
    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;

    session.userId = user.id;
    session.spotifyId = user.spotify_id;
    session.accessToken = access_token;
    session.refreshToken = user.refresh_token || refresh_token || null;
    session.expiresAt = expiresAt;
    session.oauthState = undefined;

    req.session = session;

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const redirect = new URL(`${frontendUrl}/auth/callback`);
    redirect.searchParams.set("access_token", access_token);
    if (refresh_token) {
      redirect.searchParams.set("refresh_token", refresh_token);
    }
    redirect.searchParams.set("expires_in", String(expires_in ?? 3600));

    res.redirect(redirect.toString());
  } catch (err) {
    console.error("spotify_callback_failed", err);
    res.status(500).send("Auth failed");
  }
});

/**
 * AUTH + PROFILE
 */
app.get("/api/auth/me", async (req, res) => {
  const context = await getSessionContext(req, res, { refresh: false });
  if (!context) return;

  const { user } = context;
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    spotify_id: user.spotify_id,
  });
});

app.get("/api/profile", async (req, res) => {
  const context = await getSessionContext(req, res, { refresh: false });
  if (!context) return;
  const { user } = context;

  const stats = await pool.query(
    `SELECT COUNT(*)::int AS games_played FROM game_sessions WHERE user_id=$1`,
    [user.id]
  );

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      spotify_id: user.spotify_id,
    },
    stats: stats.rows[0],
  });
});

/**
 * HISTORY
 */
app.get("/api/history", async (req, res) => {
  const context = await getSessionContext(req, res, { refresh: false });
  if (!context) return;
  const { user } = context;

  const r = await pool.query(
    `SELECT id, mode, difficulty, source, total_questions, created_at
     FROM game_sessions
     WHERE user_id=$1
     ORDER BY created_at DESC
     LIMIT 50`,
    [user.id]
  );

  res.json({ history: r.rows });
});

app.post("/api/auth/logout", (req, res) => {
  clearSession(req);
  res.status(204).end();
});

app.post("/api/auth/refresh", async (req, res) => {
  const context = await getSessionContext(req, res, { forceRefresh: true });
  if (!context) return;
  res.json({ expiresAt: req.session?.expiresAt ?? null });
});

/**
 * SOLO
 */
app.post("/api/games/solo/start", async (req, res) => {
  try {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { user, accessToken, refreshToken } = context;
    const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "normal";
    const source = typeof req.body?.source === "string" ? req.body.source : "liked_tracks";
    const count = Number.isFinite(Number(req.body?.count)) ? Math.max(1, Math.min(Number(req.body.count), 20)) : 10;

    const spotify = makeSpotify(accessToken, refreshToken || undefined);
    const blacklisted = await getBlacklistedSpotifyIds(user.id);

    const { sourceUsed, tracks: available } = await gatherTracks(spotify, source, count, blacklisted);

    if (available.length === 0) {
      res.status(400).json({ error: "No tracks available" });
      return;
    }

    const tracks = pickRandom(available, count).map(track => ({
      spotify_track_id: track.id,
      title: track.name,
      artist: track.artists.map(artist => artist.name).join(", "),
      album: track.album.name,
      preview_url: track.preview_url,
      album_cover: track.album.images?.[0]?.url || null,
      duration_ms: track.duration_ms,
      popularity: track.popularity,
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
        [track.spotify_track_id, track.title, track.artist, track.album, track.preview_url, track.album_cover, track.duration_ms, track.popularity, user.id]
      );
    }

    await blacklistTracks(user.id, tracks.map(track => track.spotify_track_id), 24);

    res.json({ sessionId: session.id, tracks, sourceUsed });
  } catch (err) {
    console.error("solo_game_failed", err);
    const message = err instanceof Error ? err.message : "Failed to start game";
    res.status(500).json({ error: "Failed to start game", details: message });
  }
});

/**
 * LIKES + ROOMS
 */
app.use("/api/likes", likesRouter);
app.use("/api/rooms", roomsRoutes);

/**
 * SOCKETS
 */
ioServer.on("connection", socket => {
  socket.on("join-room", roomCode => {
    socket.join(roomCode);
    ioServer.to(roomCode).emit("player-joined", { socketId: socket.id });
  });
});

/**
 * ERRORS
 */
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("❌ Internal error:", err);
  res.status(500).json({ error: "Internal error" });
});

/**
 * BOOT
 */
const PORT = Number(process.env.PORT) || 8080;
(async () => {
  const db = await testConnection();
  if (!db) process.exit(1);
  await ensureSchema();
  server.listen(PORT, "0.0.0.0", () => console.log(`🚀 BLINDIFY API ready on ${PORT}`));
})();
