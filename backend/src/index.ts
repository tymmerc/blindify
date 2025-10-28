// src/index.ts
import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import cookieSession from "cookie-session";
import { Pool } from "pg";
import { Server as SocketIOServer } from "socket.io";
import http from "http";
import axios from "axios";
import * as querystring from "querystring";

dotenv.config();

// ==================== CONFIGURATION SERVEUR ====================

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

// Origines autorisées pour CORS
const allowedOrigins = [
  "https://blindify.vercel.app",
  "https://blindify-zeta.vercel.app",
  "https://blindify-git-main-tymmercier-gmailcoms-projects.vercel.app",
  process.env.FRONTEND_URL || "",
  "http://localhost:3000"
].filter(Boolean);

// Configuration WebSocket pour le mode multijoueur
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ==================== MIDDLEWARES ====================

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - 120 requêtes par minute
app.use(rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

// Ralentissement progressif après 60 requêtes/minute
app.use(slowDown({ 
  windowMs: 60_000, 
  delayAfter: 60, 
  delayMs: () => 100
}));

// Gestion des sessions avec cookies (cookie-session pour compatibilité TS simple)
app.use(cookieSession({
  name: "session",
  secret: process.env.SESSION_SECRET || "change_me",
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: "none",
  secure: process.env.NODE_ENV === "production"
}));

// ==================== CONNEXION BASE DE DONNÉES ====================

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.connect()
  .then(() => console.log("✅ PostgreSQL connected"))
  .catch((err) => console.error("❌ Database connection failed:", err));

// ==================== TYPES ====================

interface AuthenticatedUser {
  id: number;
  spotify_id: string;
  username: string | null;
  access_token: string | null;
  refresh_token: string | null;
  level: number;
  xp: number;
  total_score: number;
  games_played: number;
  current_streak: number;
  best_streak: number;
}

interface SpotifyTrack {
  spotify_track_id: string;
  title: string;
  artist: string;
  album?: string;
  preview_url: string | null;
  album_cover: string | null;
  duration_ms?: number;
  popularity?: number;
}

// ==================== UTILS ====================

/**
 * Levenshtein distance (iterative, memory-efficientish).
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  const v0 = new Array(blen + 1);
  const v1 = new Array(blen + 1);

  for (let j = 0; j <= blen; j++) v0[j] = j;

  for (let i = 0; i < alen; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < blen; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(
        v1[j] + 1,
        v0[j + 1] + 1,
        v0[j] + cost
      );
    }
    for (let j = 0; j <= blen; j++) v0[j] = v1[j];
  }

  return v1[blen];
}

/**
 * Normalisation simple pour comparaison d'input utilisateur.
 */
function normalizeAnswer(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

// ==================== FONCTIONS UTILITAIRES ====================

/**
 * Récupération d'un utilisateur par son access token
 */
async function getUserByAccessToken(bearer?: string): Promise<AuthenticatedUser | null> {
  if (!bearer) return null;
  const token = bearer.replace(/^Bearer\s+/i, "");
  try {
    const { rows } = await pool.query(
      `SELECT id, spotify_id, display_name as username, access_token, refresh_token, level, xp, 
              total_score, games_played, current_streak, best_streak
       FROM users WHERE access_token = $1 LIMIT 1`,
      [token]
    );
    return rows[0] || null;
  } catch (err) {
    console.error("❌ getUserByAccessToken error:", (err as Error).message);
    return null;
  }
}

/**
 * Mapping d'un objet Spotify vers notre format Track
 */
function mapSpotifyItemToTrack(item: any): SpotifyTrack | null {
  const track = item.track || item;
  if (!track || !track.id) return null;
  return {
    spotify_track_id: track.id,
    title: track.name,
    artist: (track.artists || []).map((a: any) => a.name).join(", "),
    album: track.album?.name,
    preview_url: track.preview_url || null,
    album_cover: track.album?.images?.[0]?.url || null,
    duration_ms: track.duration_ms,
    popularity: track.popularity
  };
}

/**
 * Validation intelligente avec tolérance aux typos
 */
function validateAnswer(userInput: string, correctAnswer: string): { 
  isCorrect: boolean; 
  similarity: number;
  method: string;
} {
  const input = normalizeAnswer(userInput || "");
  const correct = normalizeAnswer(correctAnswer || "");

  if (input === correct) {
    return { isCorrect: true, similarity: 100, method: 'exact' };
  }

  if (!correct.length) return { isCorrect: false, similarity: 0, method: 'none' };

  const maxDistance = Math.floor(correct.length * 0.2);
  const distance = levenshteinDistance(input, correct);

  if (distance <= maxDistance) {
    const similarity = Math.round(((correct.length - distance) / correct.length) * 100);
    return { isCorrect: true, similarity, method: 'fuzzy' };
  }

  if (correct.includes(input) || input.includes(correct)) {
    return { isCorrect: true, similarity: 85, method: 'contains' };
  }

  return { isCorrect: false, similarity: 0, method: 'none' };
}

/**
 * Calcul des points avec bonus de rapidité
 */
function calculatePoints(isCorrect: boolean, responseTimeMs: number, difficulty: string): number {
  if (!isCorrect) return 0;

  const basePts: { [key: string]: number } = { easy: 10, normal: 20, hard: 30 };
  const basePoints = basePts[difficulty] || 20;

  let speedBonus = 0;
  if (responseTimeMs < 2000) speedBonus = basePoints * 0.5;
  else if (responseTimeMs < 5000) speedBonus = basePoints * 0.25;
  else if (responseTimeMs < 8000) speedBonus = basePoints * 0.1;

  return Math.round(basePoints + speedBonus);
}

/**
 * Mise à jour de l'XP et du niveau
 */
async function updateUserXP(userId: number, xpGained: number): Promise<{ newLevel: number; leveledUp: boolean }> {
  const { rows } = await pool.query(
    'SELECT level, xp FROM users WHERE id = $1',
    [userId]
  );
  const user = rows[0];
  if (!user) return { newLevel: 1, leveledUp: false };

  const newXP = (user.xp || 0) + xpGained;
  const xpForNextLevel = (user.level || 1) * 100;

  let newLevel = user.level || 1;
  let leveledUp = false;

  if (newXP >= xpForNextLevel) {
    newLevel = (user.level || 1) + 1;
    leveledUp = true;
  }

  await pool.query(
    'UPDATE users SET xp = $1, level = $2, updated_at = NOW() WHERE id = $3',
    [newXP, newLevel, userId]
  );

  return { newLevel, leveledUp };
}

/**
 * Vérification et attribution des badges
 */
async function checkAndAwardBadges(userId: number): Promise<string[]> {
  const newBadges: string[] = [];
  try {
    const { rows: statsRows } = await pool.query(
      `SELECT u.games_played, u.best_streak, u.level,
              COUNT(DISTINCT d.track_id) as discoveries,
              COUNT(DISTINCT CASE WHEN gs.difficulty = 'hard' THEN gs.id END) as hard_games
       FROM users u
       LEFT JOIN discoveries d ON u.id = d.user_id
       LEFT JOIN game_sessions gs ON u.id = gs.user_id AND gs.completed = TRUE
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId]
    );

    const stats = statsRows[0] || { games_played: 0, best_streak: 0, level: 1, discoveries: 0, hard_games: 0 };

    const { rows: availableBadges } = await pool.query(
      `SELECT b.* FROM badges b
       WHERE b.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)`,
      [userId]
    );

    for (const badge of availableBadges) {
      let shouldAward = false;

      switch (badge.requirement_type) {
        case 'games_played':
          shouldAward = (stats.games_played || 0) >= badge.requirement_value;
          break;
        case 'streak':
          shouldAward = (stats.best_streak || 0) >= badge.requirement_value;
          break;
        case 'level':
          shouldAward = (stats.level || 0) >= badge.requirement_value;
          break;
        case 'discoveries':
          shouldAward = (stats.discoveries || 0) >= badge.requirement_value;
          break;
        case 'hard_games':
          shouldAward = (stats.hard_games || 0) >= badge.requirement_value;
          break;
      }

      if (shouldAward) {
        await pool.query(
          'INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES ($1, $2, NOW())',
          [userId, badge.id]
        );
        newBadges.push(badge.name);
      }
    }
  } catch (err) {
    console.error("❌ checkAndAwardBadges error:", (err as Error).message);
  }

  return newBadges;
}

/**
 * Récupération de tracks aléatoires depuis Spotify
 */
async function getRandomTracksForUser(
  accessToken: string,
  count: number = 10,
  source: string = 'liked_tracks',
  sourceId?: string | null
): Promise<SpotifyTrack[]> {
  let tracks: any[] = [];

  try {
    if (source === 'liked_tracks') {
      const response = await axios.get('https://api.spotify.com/v1/me/tracks', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 50 }
      });
      tracks = response.data.items || [];
    } else if (source === 'playlist' && sourceId) {
      const response = await axios.get(`https://api.spotify.com/v1/playlists/${sourceId}/tracks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 50 }
      });
      tracks = response.data.items || [];
    } else if (source === 'top_tracks') {
      const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 50, time_range: sourceId || 'medium_term' }
      });
      tracks = response.data.items.map((t: any) => ({ track: t }));
    } else if (source === 'recently_played') {
      const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 50 }
      });
      tracks = response.data.items || [];
    }

    const validTracks = tracks
      .map((it: any) => mapSpotifyItemToTrack(it))
      .filter((t): t is SpotifyTrack => !!t && !!t.preview_url);

    const shuffled = validTracks.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);

  } catch (error: any) {
    console.error('❌ Failed to fetch tracks from Spotify:', error?.message || error);
    return [];
  }
}

// ==================== ROUTES D'AUTHENTIFICATION ====================

app.get("/auth/login", (_req: Request, res: Response) => {
  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'user-top-read',
    'user-read-recently-played',
    'playlist-read-private',
    'user-library-modify'
  ];

  const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scopes.join(' '),
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state: Math.random().toString(36).substring(7)
  })}`;

  res.redirect(authUrl);
});

app.get("/auth/callback", async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/?error=no_code`);
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET!
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const profile = profileResponse.data;

    const { rows } = await pool.query(
      `INSERT INTO users (spotify_id, username, email, access_token, refresh_token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (spotify_id) DO UPDATE 
       SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, updated_at = NOW()
       RETURNING id, spotify_id, username, access_token`,
      [profile.id, profile.display_name, profile.email, access_token, refresh_token]
    );

    const user = rows[0];
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${user.access_token}`);

  } catch (error: any) {
    console.error('❌ OAuth callback error:', error?.message || error);
    return res.redirect(`${process.env.FRONTEND_URL}/?error=auth_failed`);
  }
});

app.get("/api/auth/me", async (req: Request, res: Response) => {
  const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  return res.json({ user });
});

// ==================== ROUTES DE JEU ====================

app.post("/api/games/solo/start", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { 
      difficulty = 'normal', 
      source = 'liked_tracks',
      sourceId = null,
      count = 10 
    } = req.body;

    const tracks = await getRandomTracksForUser(
      user.access_token, 
      count, 
      source, 
      sourceId
    );

    if (tracks.length === 0) {
      return res.status(400).json({ error: "No tracks available. Please like some songs on Spotify." });
    }

    const { rows: [session] } = await pool.query(
      `INSERT INTO game_sessions (user_id, mode, difficulty, source, total_questions, started_at)
       VALUES ($1, 'solo', $2, $3, $4, NOW())
       RETURNING id`,
      [user.id, difficulty, source, tracks.length]
    );

    for (const track of tracks) {
      await pool.query(
        `INSERT INTO tracks (user_id, spotify_track_id, title, artist, album, preview_url, album_cover, popularity, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, spotify_track_id) DO NOTHING`,
        [
          user.id,
          track.spotify_track_id,
          track.title,
          track.artist,
          track.album,
          track.preview_url,
          track.album_cover,
          track.popularity,
          source
        ]
      );
    }

    return res.json({
      sessionId: session.id,
      tracks: tracks.map(t => ({
        spotifyId: t.spotify_track_id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        previewUrl: t.preview_url,
        albumCover: t.album_cover
      }))
    });

  } catch (err: any) {
    console.error("❌ Failed to start solo game:", err?.message || err);
    return res.status(500).json({ error: "Failed to start game" });
  }
});

app.post("/api/games/answer", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      sessionId,
      trackId,
      userAnswer,
      correctAnswer,
      responseTimeMs,
      questionNumber,
      hintUsed = false,
      skipped = false
    } = req.body;

    const validation = validateAnswer(userAnswer || '', correctAnswer || '');
    const isCorrect = validation.isCorrect && !skipped;

    const { rows: [session] } = await pool.query(
      'SELECT difficulty FROM game_sessions WHERE id = $1',
      [sessionId]
    );

    const points = calculatePoints(isCorrect, responseTimeMs || 0, session?.difficulty || 'normal');

    const { rows: [track] } = await pool.query(
      'SELECT id FROM tracks WHERE spotify_track_id = $1 AND user_id = $2 LIMIT 1',
      [trackId, user.id]
    );

    await pool.query(
      `INSERT INTO game_rounds (
        session_id, track_id, question_number, user_answer, correct_answer,
        is_correct, response_time_ms, points_earned, hint_used, skipped, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        sessionId,
        track?.id || null,
        questionNumber,
        userAnswer,
        correctAnswer,
        isCorrect,
        responseTimeMs || 0,
        points,
        hintUsed,
        skipped
      ]
    );

    await pool.query(
      `UPDATE game_sessions 
       SET correct_answers = COALESCE(correct_answers, 0) + $1,
           final_score = COALESCE(final_score, 0) + $2
       WHERE id = $3`,
      [isCorrect ? 1 : 0, points, sessionId]
    );

    return res.json({ 
      isCorrect,
      points,
      similarity: validation.similarity,
      method: validation.method
    });

  } catch (err: any) {
    console.error("❌ Failed to submit answer:", err?.message || err);
    return res.status(500).json({ error: "Failed to submit answer" });
  }
});

app.post("/api/games/complete", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.body;

    const { rows: [session] } = await pool.query(
      `SELECT 
        total_questions,
        COALESCE(correct_answers, 0) as correct_answers,
        COALESCE(final_score, 0) as final_score,
        difficulty,
        COALESCE(AVG(response_time_ms), 0) as avg_response_time
       FROM game_sessions gs
       LEFT JOIN game_rounds gr ON gs.id = gr.session_id
       WHERE gs.id = $1
       GROUP BY gs.id`,
      [sessionId]
    );

    const { rows: rounds } = await pool.query(
      `SELECT is_correct FROM game_rounds WHERE session_id = $1 ORDER BY question_number`,
      [sessionId]
    );

    let currentStreak = 0;
    let maxStreak = 0;
    for (const round of rounds) {
      if (round.is_correct) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    const baseXP = (session.correct_answers || 0) * 10;
    const diffBonuses: { [key: string]: number } = { easy: 0, normal: 10, hard: 25 };
    const difficultyBonus = diffBonuses[session.difficulty] || 0;
    const perfectBonus = session.correct_answers === session.total_questions ? 50 : 0;
    const streakBonus = maxStreak * 2;
    const totalXP = baseXP + difficultyBonus + perfectBonus + streakBonus;

    await pool.query(
      `UPDATE game_sessions 
       SET completed = TRUE,
           completed_at = NOW(),
           streak_achieved = $1,
           xp_earned = $2,
           avg_response_time = $3
       WHERE id = $4`,
      [maxStreak, totalXP, session.avg_response_time || 0, sessionId]
    );

    await pool.query(
      `UPDATE users 
       SET total_score = COALESCE(total_score,0) + $1,
           games_played = COALESCE(games_played,0) + 1,
           best_streak = GREATEST(COALESCE(best_streak,0), $2),
           current_streak = CASE WHEN $3 = $4 THEN COALESCE(current_streak,0) + 1 ELSE 0 END,
           updated_at = NOW()
       WHERE id = $5`,
      [session.final_score || 0, maxStreak, session.correct_answers || 0, session.total_questions || 0, user.id]
    );

    const { newLevel, leveledUp } = await updateUserXP(user.id, totalXP);
    const newBadges = await checkAndAwardBadges(user.id);

    return res.json({
      success: true,
      stats: {
        score: session.final_score || 0,
        correctAnswers: session.correct_answers || 0,
        totalQuestions: session.total_questions || 0,
        accuracy: session.total_questions ? Math.round(((session.correct_answers || 0) / session.total_questions) * 100) : 0,
        maxStreak,
        avgResponseTime: Math.round(session.avg_response_time || 0)
      },
      rewards: {
        xpEarned: totalXP,
        newLevel,
        leveledUp,
        newBadges
      }
    });

  } catch (err: any) {
    console.error("❌ Failed to complete game:", err?.message || err);
    return res.status(500).json({ error: "Failed to complete game" });
  }
});

app.post("/api/tracks/like", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { trackId } = req.body;

    await axios.put(
      "https://api.spotify.com/v1/me/tracks",
      null,
      { params: { ids: trackId }, headers: { Authorization: `Bearer ${user.access_token}` } }
    );

    const { rows: [track] } = await pool.query(
      'SELECT id FROM tracks WHERE spotify_track_id = $1 AND user_id = $2 LIMIT 1',
      [trackId, user.id]
    );

    if (track) {
      await pool.query(
        `INSERT INTO discoveries (user_id, track_id, liked, added_to_spotify, created_at)
         VALUES ($1, $2, TRUE, TRUE, NOW())
         ON CONFLICT (user_id, track_id) DO UPDATE SET liked = TRUE, added_to_spotify = TRUE`,
        [user.id, track.id]
      );
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("❌ Failed to like track:", err?.message || err);
    return res.status(500).json({ error: "Failed to like track" });
  }
});

// ==================== ROUTES DES SOURCES ====================

app.get("/api/sources/playlists", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: 50 }
    });

    const playlists = (response.data.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url || null,
      trackCount: p.tracks?.total || 0
    }));

    return res.json({ playlists });
  } catch (err: any) {
    console.error("❌ Failed to fetch playlists:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

app.get("/api/sources/top-tracks", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { time_range = 'medium_term' } = req.query as any;

    const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: 50, time_range }
    });

    const tracks = (response.data.items || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      artist: t.artists.map((a: any) => a.name).join(', '),
      image: t.album.images?.[0]?.url
    }));

    return res.json({ tracks });
  } catch (err: any) {
    console.error("❌ Failed to fetch top tracks:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch top tracks" });
  }
});

app.get("/api/sources/recently-played", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: 50 }
    });

    const tracks = (response.data.items || []).map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists.map((a: any) => a.name).join(', '),
      image: item.track.album.images?.[0]?.url,
      playedAt: item.played_at
    }));

    return res.json({ tracks });
  } catch (err: any) {
    console.error("❌ Failed to fetch recently played:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch recently played" });
  }
});

app.post("/api/sources/ai-recommendations", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { count = 20 } = req.body;

    const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: count }
    });

    const tracks = (response.data.items || []).map(mapSpotifyItemToTrack).filter((t: SpotifyTrack | null): t is SpotifyTrack => !!t);
    return res.json({ tracks });

  } catch (err: any) {
    console.error("❌ Failed to get AI recommendations:", err?.message || err);
    return res.status(500).json({ error: "Failed to get AI recommendations" });
  }
});

// ==================== ROUTES PROFIL & STATS ====================

app.get("/api/user/profile", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { rows: [stats] } = await pool.query(
      'SELECT * FROM user_statistics WHERE user_id = $1',
      [user.id]
    );

    const { rows: badges } = await pool.query(
      `SELECT b.name, b.description, b.icon, b.tier, ub.earned_at
       FROM user_badges ub
       JOIN badges b ON ub.badge_id = b.id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [user.id]
    );

    return res.json({
      user: {
        username: user.username,
        level: user.level,
        xp: user.xp,
        totalScore: user.total_score,
        gamesPlayed: user.games_played,
        currentStreak: user.current_streak,
        bestStreak: user.best_streak
      },
      stats,
      badges
    });
  } catch (err: any) {
    console.error("❌ Failed to fetch profile:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get("/api/stats/detailed", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { rows: [generalStats] } = await pool.query(
      `SELECT 
        COUNT(*) as total_games,
        COALESCE(AVG(final_score), 0) as average_score,
        COALESCE(MAX(final_score), 0) as best_score,
        COALESCE(AVG(correct_answers::DECIMAL / NULLIF(total_questions, 0) * 100), 0) as average_accuracy,
        COALESCE(AVG(avg_response_time), 0) as avg_response_time
       FROM game_sessions
       WHERE user_id = $1 AND completed = TRUE`,
      [user.id]
    );

    const { rows: favoriteArtists } = await pool.query(
      `SELECT 
        t.artist as name,
        COUNT(*) as count
       FROM game_rounds gr
       JOIN game_sessions gs ON gr.session_id = gs.id
       JOIN tracks t ON gr.track_id = t.id
       WHERE gs.user_id = $1 AND gs.completed = TRUE
       GROUP BY t.artist
       ORDER BY count DESC
       LIMIT 10`,
      [user.id]
    );

    return res.json({
      totalGames: parseInt(generalStats?.total_games || 0),
      averageScore: parseFloat(generalStats?.average_score || 0),
      bestScore: parseInt(generalStats?.best_score || 0),
      averageAccuracy: parseFloat(generalStats?.average_accuracy || 0),
      avgResponseTime: parseFloat(generalStats?.avg_response_time || 0),
      favoriteArtists: favoriteArtists || []
    });

  } catch (err: any) {
    console.error("❌ Failed to fetch detailed stats:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch detailed stats" });
  }
});

app.get("/api/stats/leaderboard", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leaderboard_global LIMIT 50');
    return res.json({ leaderboard: rows });
  } catch (err: any) {
    console.error("❌ Failed to fetch leaderboard:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

app.get("/api/games/history", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { rows } = await pool.query(
      `SELECT id, mode, difficulty, source, total_questions, correct_answers, 
              final_score, avg_response_time, streak_achieved, xp_earned, 
              started_at, completed_at
       FROM game_sessions
       WHERE user_id = $1 AND completed = TRUE
       ORDER BY completed_at DESC
       LIMIT 50`,
      [user.id]
    );

    return res.json({ history: rows });
  } catch (err: any) {
    console.error("❌ Failed to fetch history:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ==================== ROUTES MULTIJOUEUR ====================

app.post("/api/rooms/create", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, maxPlayers = 6, questionCount = 20 } = req.body;

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { rows: [room] } = await pool.query(
      `INSERT INTO multiplayer_rooms (code, host_id, name, max_players, question_count, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'waiting', NOW())
       RETURNING id, code`,
      [roomCode, user.id, name, maxPlayers, questionCount]
    );

    await pool.query(
      `INSERT INTO room_players (room_id, user_id, ready, joined_at)
       VALUES ($1, $2, TRUE, NOW())`,
      [room.id, user.id]
    );

    return res.json({ 
      roomId: room.id,
      roomCode: room.code
    });

  } catch (err: any) {
    console.error("❌ Failed to create room:", err?.message || err);
    return res.status(500).json({ error: "Failed to create room" });
  }
});

app.post("/api/rooms/join", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { code } = req.body;

    const { rows: [room] } = await pool.query(
      `SELECT id, max_players, current_players FROM multiplayer_rooms 
       WHERE code = $1 AND status = 'waiting'`,
      [String(code).toUpperCase()]
    );

    if (!room) {
      return res.status(404).json({ error: "Room not found or already started" });
    }

    if ((room.current_players || 0) >= room.max_players) {
      return res.status(400).json({ error: "Room is full" });
    }

    await pool.query(
      `INSERT INTO room_players (room_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [room.id, user.id]
    );

    await pool.query(
      `UPDATE multiplayer_rooms 
       SET current_players = COALESCE(current_players,0) + 1
       WHERE id = $1`,
      [room.id]
    );

    return res.json({ roomId: room.id });

  } catch (err: any) {
    console.error("❌ Failed to join room:", err?.message || err);
    return res.status(500).json({ error: "Failed to join room" });
  }
});

app.post("/api/rooms/:roomId/leave", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { roomId } = req.params;

    await pool.query(
      'DELETE FROM room_players WHERE room_id = $1 AND user_id = $2',
      [roomId, user.id]
    );

    await pool.query(
      `UPDATE multiplayer_rooms 
       SET current_players = GREATEST(COALESCE(current_players,1) - 1, 0)
       WHERE id = $1`,
      [roomId]
    );

    return res.json({ success: true });

  } catch (err: any) {
    console.error("❌ Failed to leave room:", err?.message || err);
    return res.status(500).json({ error: "Failed to leave room" });
  }
});

app.post("/api/rooms/:roomId/start", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization as string | undefined);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { roomId } = req.params;

    const { rows: [room] } = await pool.query(
      'SELECT host_id FROM multiplayer_rooms WHERE id = $1',
      [roomId]
    );

    if (!room || room.host_id !== user.id) {
      return res.status(403).json({ error: "Only the host can start the game" });
    }

    await pool.query(
      `UPDATE multiplayer_rooms 
       SET status = 'in_progress', started_at = NOW()
       WHERE id = $1`,
      [roomId]
    );

    return res.json({ success: true });

  } catch (err: any) {
    console.error("❌ Failed to start multiplayer game:", err?.message || err);
    return res.status(500).json({ error: "Failed to start multiplayer game" });
  }
});

// ==================== ROUTES DE SANTÉ ====================

app.get("/health", async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("❌ Health check failed:", err?.message || err);
    return res.status(503).json({ status: "error", error: "Database not ready" });
  }
});

app.get("/health/db", async (_req, res) => {
  try {
    const { rows: [userCount] } = await pool.query("SELECT COUNT(*) as count FROM users");
    const { rows: tables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    return res.json({ 
      status: "ok",
      database: "connected",
      users_count: parseInt(userCount?.count || 0),
      tables: tables.map(r => r.table_name)
    });
  } catch (err: any) {
    console.error("❌ Health DB failed:", err?.message || err);
    return res.status(500).json({ status: "error", error: (err as Error).message });
  }
});

// ==================== WEBSOCKET ====================

io.on("connection", (socket) => {
  console.log(`🔌 WebSocket connected: ${socket.id}`);

  socket.on("join-room", (roomCode: string) => {
    socket.join(roomCode);
    io.to(roomCode).emit("user-joined", { socketId: socket.id });
  });

  socket.on("leave-room", (roomCode: string) => {
    socket.leave(roomCode);
    io.to(roomCode).emit("user-left", { socketId: socket.id });
  });

  socket.on("submit-answer", (data: { roomCode: string; answer: string; timeMs: number }) => {
    io.to(data.roomCode).emit("answer-submitted", {
      socketId: socket.id,
      timeMs: data.timeMs
    });
  });

  socket.on("disconnect", () => {
    console.log(`❌ WebSocket disconnected: ${socket.id}`);
  });
});

// ==================== DÉMARRAGE SERVEUR ====================

const PORT = Number(process.env.PORT) || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Blindify API running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`✅ Server ready`);
});
