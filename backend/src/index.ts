import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import session from "cookie-session";
import { json, urlencoded } from "body-parser";
import { Pool } from "pg";
import { Server } from "socket.io";
import http from "http";
import axios from "axios";
import querystring from "querystring";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

// CORS configuration for production deployment
const allowedOrigins = [
  "https://blindify.vercel.app",
  "https://blindify-zeta.vercel.app",
  "https://blindify-git-main-tymmercier-gmailcoms-projects.vercel.app",
  process.env.FRONTEND_URL || ""
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.use(json());
app.use(urlencoded({ extended: true }));

// Rate limiting: 120 requests per minute
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// Slow down requests after 60 per minute (FIXED)
app.use(slowDown({ 
  windowMs: 60_000, 
  delayAfter: 60, 
  delayMs: () => 100,
  validate: { delayMs: false }
}));

// Session configuration for secure cookies
app.use(
  session({
    name: "session",
    secret: process.env.SESSION_SECRET!,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "none",
    secure: true
  })
);

// PostgreSQL connection pool
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool
  .connect()
  .then(() => console.log("✅ PostgreSQL connected"))
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    console.error("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING");
  });

// Type definitions
interface AuthenticatedUser {
  id: number;
  spotify_id: string;
  username: string | null;
  access_token: string | null;
  refresh_token: string | null;
}

interface SpotifyTrack {
  spotify_track_id: string;
  title: string;
  artist: string;
  preview_url: string | null;
  album_cover: string | null;
}

interface DatabaseTrack {
  id: number;
  spotify_track_id: string;
  title: string;
  artist: string;
  preview_url: string;
  album_cover: string | null;
}

interface FormattedTrack {
  id: string;
  title: string;
  artist: string;
  preview_url: string;
  album_cover: string | null;
}

/**
 * Retrieve authenticated user from database using Bearer token
 */
async function getUserByAccessToken(bearer?: string): Promise<AuthenticatedUser | null> {
  if (!bearer) return null;
  const token = bearer.replace(/^Bearer\s+/i, "");
  
  const { rows } = await pool.query(
    `SELECT id, spotify_id, username, access_token, refresh_token
     FROM users WHERE access_token = $1 LIMIT 1`,
    [token]
  );
  
  return rows[0] || null;
}

/**
 * Transform Spotify API response item to normalized track object
 */
function mapSpotifyItemToTrack(item: any): SpotifyTrack {
  const track = item.track || item;
  
  return {
    spotify_track_id: track.id,
    title: track.name,
    artist: (track.artists || []).map((a: any) => a.name).join(", "),
    preview_url: track.preview_url,
    album_cover: track.album?.images?.[0]?.url || null
  };
}

// ==================== AUTHENTICATION ROUTES ====================

/**
 * Redirect user to Spotify authorization page
 */
app.get("/auth/login", (_req, res) => {
  const params = querystring.stringify({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: [
      "user-read-private",
      "user-read-email",
      "user-library-read",
      "user-top-read"
    ].join(" "),
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI
  });
  
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

/**
 * Handle Spotify OAuth callback
 * Exchange authorization code for access tokens and create/update user in database
 */
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string;
  
  if (!code) {
    console.error("❌ Missing authorization code in callback");
    return res.status(400).send("Missing authorization code");
  }

  try {
    console.log("🔄 Exchanging authorization code for tokens...");
    
    // Exchange authorization code for access and refresh tokens
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET!
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    
    const { access_token, refresh_token } = tokenResponse.data;
    console.log("✅ Tokens received from Spotify");

    // Fetch user profile from Spotify API
    console.log("🔄 Fetching user profile...");
    const profileResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const spotifyUser = profileResponse.data;
    const spotify_id = spotifyUser.id;
    const username = spotifyUser.display_name || spotifyUser.id;
    console.log(`✅ Profile fetched: ${username} (${spotify_id})`);

    // Insert or update user in database
    console.log("🔄 Saving user to database...");
    await pool.query(
      `INSERT INTO users (spotify_id, username, access_token, refresh_token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (spotify_id)
       DO UPDATE SET 
         username = EXCLUDED.username,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         updated_at = NOW()`,
      [spotify_id, username, access_token, refresh_token]
    );

    console.log(`✅ User authenticated and saved: ${username} (${spotify_id})`);

    // Redirect to frontend with tokens in URL params
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?access_token=${access_token}&refresh_token=${refresh_token}`;
    console.log(`➡️ Redirecting to: ${redirectUrl}`);
    res.redirect(redirectUrl);
    
  } catch (err: any) {
    console.error("❌ Authentication callback failed:");
    console.error("Error:", err.response?.data || err.message);
    console.error("Stack:", err.stack);
    res.status(500).send("Authentication failed. Please try again.");
  }
});

// ==================== HEALTH CHECK ROUTES ====================

/**
 * Basic health check endpoint
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Database health check with table count
 */
app.get("/health/db", async (_req, res) => {
  try {
    const userCount = await pool.query("SELECT COUNT(*) as count FROM users");
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    res.json({ 
      status: "ok",
      database: "connected",
      users_count: parseInt(userCount.rows[0].count),
      tables: tables.rows.map(r => r.table_name)
    });
  } catch (err: any) {
    console.error("❌ Database health check failed:", err.message);
    res.status(500).json({ 
      status: "error", 
      message: err.message,
      hint: "Verify DATABASE_URL environment variable"
    });
  }
});

/**
 * Root endpoint
 */
app.get("/", (_req, res) => {
  res.json({ 
    service: "Blindify API",
    status: "operational",
    version: "1.0.0"
  });
});

// ==================== USER AUTHENTICATION API ====================

/**
 * Verify user authentication status
 */
app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }
    
    res.json({ 
      authenticated: true, 
      user: { 
        id: user.id, 
        spotify_id: user.spotify_id,
        username: user.username 
      } 
    });
  } catch (err) {
    console.error("❌ Authentication check failed:", err);
    res.status(500).json({ authenticated: false, error: "Internal error" });
  }
});

// ==================== USER TRACKS MANAGEMENT ====================

/**
 * Import user's liked tracks from Spotify to database
 * Fetches up to 200 tracks (4 pages of 50) and stores them for offline access
 */
app.post("/api/user/tracks", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    
    if (!user?.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const LIMIT = 50;
    const MAX_PAGES = 4;
    let offset = 0;
    let importedCount = 0;

    // Fetch liked tracks in batches
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await axios.get("https://api.spotify.com/v1/me/tracks", {
        headers: { Authorization: `Bearer ${user.access_token}` },
        params: { limit: LIMIT, offset }
      });
      
      offset += LIMIT;

      // Filter tracks with preview URLs only
      const validTracks = (data.items || [])
        .map(mapSpotifyItemToTrack)
        .filter((t: SpotifyTrack) => t.preview_url);

      if (!validTracks.length) break;

      // Insert tracks into database
      for (const track of validTracks) {
        await pool.query(
          `INSERT INTO tracks (user_id, spotify_track_id, title, artist, preview_url, album_cover, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (user_id, spotify_track_id) DO NOTHING`,
          [user.id, track.spotify_track_id, track.title, track.artist, track.preview_url, track.album_cover]
        );
        importedCount++;
      }

      // Stop if last page returned fewer items than requested
      if (data.items.length < LIMIT) break;
    }

    console.log(`✅ Imported ${importedCount} tracks for user ${user.id}`);
    res.json({ success: true, imported: importedCount });
    
  } catch (err: any) {
    console.error("❌ Track import failed:", err.message);
    res.status(500).json({ 
      success: false, 
      error: "Failed to import tracks",
      details: err.message 
    });
  }
});

/**
 * Mark tracks as played (used to avoid repetition in future games)
 */
app.post("/api/user/tracks/played", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { trackIds } = req.body;
    
    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({ success: false, error: "Invalid track IDs" });
    }

    // TODO: Implement played_tracks table to track user history
    // For now, just acknowledge the request
    console.log(`📝 User ${user.id} played ${trackIds.length} tracks`);
    
    res.json({ success: true });
    
  } catch (err: any) {
    console.error("❌ Failed to mark tracks as played:", err.message);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ==================== GAME LOGIC ====================

/**
 * Start a solo game session
 * Returns 20 random tracks with preview URLs
 * - First tries to fetch from user's imported tracks in database
 * - Falls back to direct Spotify API call if not enough tracks in DB
 */
app.post("/api/games/solo/start", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const TRACKS_NEEDED = 20;

    // Attempt to fetch tracks from database
    const { rows: dbTracks } = await pool.query(
      `SELECT id, spotify_track_id, title, artist, preview_url, album_cover
       FROM tracks
       WHERE user_id = $1 AND preview_url IS NOT NULL
       ORDER BY RANDOM()
       LIMIT $2`,
      [user.id, TRACKS_NEEDED]
    );

    // If database has enough tracks, use them

/**
 * Start a solo game session
 * Returns 20 random tracks with preview URLs
 * Strategy:
 * - Fetch fresh tracks from Spotify on each game start
 * - Exclude tracks already cached in database (already played)
 * - Cache new tracks to avoid repetition in future games
 * - No need for full import beforehand
 */
app.post("/api/games/solo/start", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!user.access_token) {
      return res.status(400).json({ 
        error: "No Spotify access token",
        hint: "Please reconnect to Spotify"
      });
    }

    const TRACKS_NEEDED = 20;

    // Get list of already cached track IDs to exclude them
    const { rows: cachedTracks } = await pool.query(
      `SELECT DISTINCT spotify_track_id FROM tracks 
       WHERE user_id = $1 AND spotify_track_id IS NOT NULL`,
      [user.id]
    );
    const cachedIds = new Set(cachedTracks.map(t => t.spotify_track_id));

    console.log(`📝 User ${user.id} has ${cachedIds.size} tracks in cache`);

    // Fetch fresh tracks from Spotify API
    console.log(`🎵 Fetching fresh tracks from Spotify...`);
    
    const allSpotifyTracks: SpotifyTrack[] = [];
    const LIMIT = 50;
    const MAX_PAGES = 4; // Up to 200 tracks

    for (let page = 0; page < MAX_PAGES && allSpotifyTracks.length < TRACKS_NEEDED * 2; page++) {
      const offset = page * LIMIT;
      
      try {
        const { data } = await axios.get("https://api.spotify.com/v1/me/tracks", {
          headers: { Authorization: `Bearer ${user.access_token}` },
          params: { limit: LIMIT, offset }
        });

        if (!data.items || data.items.length === 0) break;

        // Filter: with preview URL AND not already cached
        const validTracks = data.items
          .map(mapSpotifyItemToTrack)
          .filter((t: SpotifyTrack) => t.preview_url && !cachedIds.has(t.spotify_track_id));

        allSpotifyTracks.push(...validTracks);

        // Stop if we have enough
        if (allSpotifyTracks.length >= TRACKS_NEEDED) break;
        
        // Stop if last page was incomplete
        if (data.items.length < LIMIT) break;
      } catch (err) {
        console.error(`⚠️ Error fetching page ${page}:`, err);
        break;
      }
    }

    // Deduplicate by track ID
    const uniqueTracks = new Map<string, SpotifyTrack>();
    allSpotifyTracks.forEach((track: SpotifyTrack) => {
      if (!uniqueTracks.has(track.spotify_track_id)) {
        uniqueTracks.set(track.spotify_track_id, track);
      }
    });

    // Take only what we need
    const selectedTracks = Array.from(uniqueTracks.values()).slice(0, TRACKS_NEEDED);

    if (selectedTracks.length < 10) {
      return res.status(404).json({ 
        error: "Insufficient tracks with preview URLs",
        hint: "Add more liked songs on Spotify"
      });
    }

    // Cache these tracks in database for future exclusion
    console.log(`💾 Caching ${selectedTracks.length} tracks in database...`);
    for (const track of selectedTracks) {
      try {
        await pool.query(
          `INSERT INTO tracks (user_id, spotify_track_id, title, artist, preview_url, album_cover, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (user_id, spotify_track_id) DO NOTHING`,
          [user.id, track.spotify_track_id, track.title, track.artist, track.preview_url, track.album_cover]
        );
      } catch (err) {
        console.error(`⚠️ Error caching track:`, err);
      }
    }

    const formattedTracks: FormattedTrack[] = selectedTracks.map((track: SpotifyTrack) => ({
      id: track.spotify_track_id,
      title: track.title,
      artist: track.artist,
      preview_url: track.preview_url!,
      album_cover: track.album_cover
    }));

    console.log(`✅ Game started with ${formattedTracks.length} fresh tracks (${cachedIds.size} previously cached, ${allSpotifyTracks.length} found)`);
    res.json({ tracks: formattedTracks });
    
  } catch (err: any) {
    console.error("❌ Failed to start game:", err.response?.data || err.message);
    res.status(500).json({ 
      error: "Failed to start game",
      details: err.message 
    });
  }
});
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Calculate real statistics from database
    // For now, return placeholder data
    res.json({
      totalGames: 0,
      totalScore: 0,
      averageScore: 0,
      bestScore: 0,
      tracksPlayed: 0
    });
    
  } catch (err: any) {
    console.error("❌ Failed to fetch stats:", err.message);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/**
 * Create a multiplayer room
 */
app.post("/api/rooms/create", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Implement multiplayer room creation
    // For now, return placeholder
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    res.json({
      roomCode,
      host: user.username,
      players: [user.username],
      status: "waiting"
    });
    
  } catch (err: any) {
    console.error("❌ Failed to create room:", err.message);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// ==================== WEBSOCKET CONNECTION ====================

io.on("connection", (socket) => {
  console.log(`🔌 WebSocket client connected: ${socket.id}`);
  
  socket.on("disconnect", () => {
    console.log(`❌ WebSocket client disconnected: ${socket.id}`);
  });
});

// ==================== SERVER INITIALIZATION ====================

const PORT = Number(process.env.PORT) || 8080;

server.listen(PORT, () => {
  console.log(`🚀 Blindify API server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`✅ Server ready to accept connections`);
});