import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import session from "cookie-session";
import { Pool } from "pg";
import { Server } from "socket.io";
import http from "http";
import axios from "axios";
import * as querystring from "querystring";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

const allowedOrigins = [
  "https://blindify.vercel.app",
  "https://blindify-zeta.vercel.app",
  "https://blindify-git-main-tymmercier-gmailcoms-projects.vercel.app",
  process.env.FRONTEND_URL || "",
  "http://localhost:3000"
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(slowDown({ 
  windowMs: 60_000, 
  delayAfter: 60, 
  delayMs: () => 100,
  validate: { delayMs: false }
}));

app.use(session({
  name: "session",
  secret: process.env.SESSION_SECRET!,
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: "none",
  secure: true
}));

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
  energy?: number;
  valence?: number;
  danceability?: number;
  tempo?: number;
}

// ==================== LEVENSHTEIN DISTANCE ====================

function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// ==================== UTILS ====================

async function getUserByAccessToken(bearer?: string): Promise<AuthenticatedUser | null> {
  if (!bearer) return null;
  const token = bearer.replace(/^Bearer\s+/i, "");
  
  const { rows } = await pool.query(
    `SELECT id, spotify_id, username, access_token, refresh_token, level, xp, 
            total_score, games_played, current_streak, best_streak
     FROM users WHERE access_token = $1 LIMIT 1`,
    [token]
  );
  
  return rows[0] || null;
}

function mapSpotifyItemToTrack(item: any): SpotifyTrack {
  const track = item.track || item;
  
  return {
    spotify_track_id: track.id,
    title: track.name,
    artist: (track.artists || []).map((a: any) => a.name).join(", "),
    album: track.album?.name,
    preview_url: track.preview_url,
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
  const normalize = (str: string) => str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
  
  const input = normalize(userInput);
  const correct = normalize(correctAnswer);
  
  if (input === correct) {
    return { isCorrect: true, similarity: 100, method: 'exact' };
  }
  
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
 * Mise à jour de l'XP et du niveau utilisateur
 */
async function updateUserXP(userId: number, xpGained: number): Promise<{ newLevel: number; leveledUp: boolean }> {
  const { rows: [user] } = await pool.query(
    'SELECT level, xp FROM users WHERE id = $1',
    [userId]
  );
  
  const newXP = user.xp + xpGained;
  const xpForNextLevel = user.level * 100;
  
  let newLevel = user.level;
  let leveledUp = false;
  
  if (newXP >= xpForNextLevel) {
    newLevel = user.level + 1;
    leveledUp = true;
  }
  
  await pool.query(
    'UPDATE users SET xp = $1, level = $2 WHERE id = $3',
    [newXP, newLevel, userId]
  );
  
  return { newLevel, leveledUp };
}

/**
 * Vérifier et attribuer les badges
 */
async function checkAndAwardBadges(userId: number): Promise<string[]> {
  const newBadges: string[] = [];
  
  const { rows: [stats] } = await pool.query(
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
  
  const { rows: availableBadges } = await pool.query(
    `SELECT b.* FROM badges b
     WHERE b.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)`,
    [userId]
  );
  
  for (const badge of availableBadges) {
    let shouldAward = false;
    
    switch (badge.requirement_type) {
      case 'games_played':
        shouldAward = stats.games_played >= badge.requirement_value;
        break;
      case 'streak':
        shouldAward = stats.best_streak >= badge.requirement_value;
        break;
      case 'level':
        shouldAward = stats.level >= badge.requirement_value;
        break;
      case 'discoveries':
        shouldAward = stats.discoveries >= badge.requirement_value;
        break;
      case 'hard_games':
        shouldAward = stats.hard_games >= badge.requirement_value;
        break;
    }
    
    if (shouldAward) {
      await pool.query(
        'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, badge.id]
      );
      newBadges.push(badge.name);
    }
  }
  
  return newBadges;
}

// ==================== AUTH ROUTES ====================

app.get("/auth/login", (_req, res) => {
  const params = querystring.stringify({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: [
      "user-read-private",
      "user-read-email",
      "user-library-read",
      "user-library-modify",
      "user-top-read",
      "user-read-recently-played",
      "playlist-read-private",
      "playlist-read-collaborative"
    ].join(" "),
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI
  });
  
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string;
  
  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
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

    const profileResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const spotifyUser = profileResponse.data;
    const spotify_id = spotifyUser.id;
    const username = spotifyUser.display_name || spotifyUser.id;
    const email = spotifyUser.email;

    await pool.query(
      `INSERT INTO users (spotify_id, username, email, access_token, refresh_token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (spotify_id)
       DO UPDATE SET 
         username = EXCLUDED.username,
         email = EXCLUDED.email,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         updated_at = NOW()`,
      [spotify_id, username, email, access_token, refresh_token]
    );

    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?access_token=${access_token}&refresh_token=${refresh_token}`;
    res.redirect(redirectUrl);
    
  } catch (err: any) {
    console.error("❌ Authentication callback failed:", err.response?.data || err.message);
    res.status(500).send("Authentication failed. Please try again.");
  }
});

app.get("/api/auth/me", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }
    res.json({ 
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        spotify_id: user.spotify_id,
        level: user.level,
        xp: user.xp
      }
    });
  } catch (err) {
    res.status(500).json({ authenticated: false });
  }
});

// ==================== SOURCES ROUTES ====================

app.get("/api/sources/playlists", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data } = await axios.get("https://api.spotify.com/v1/me/playlists", {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: 50 }
    });

    const playlists = data.items.map((p: any) => ({
      id: p.id,
      name: p.name,
      trackCount: p.tracks.total,
      imageUrl: p.images?.[0]?.url,
      owner: p.owner.display_name
    }));

    res.json({ playlists });
  } catch (err: any) {
    console.error("❌ Failed to fetch playlists:", err.message);
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

app.get("/api/sources/top-tracks", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const timeRange = (req.query.time_range as string) || 'medium_term';

    const { data } = await axios.get("https://api.spotify.com/v1/me/top/tracks", {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: 50, time_range: timeRange }
    });

    const tracks = data.items
      .map(mapSpotifyItemToTrack)
      .filter((t: SpotifyTrack) => t.preview_url);

    res.json({ tracks });
  } catch (err: any) {
    console.error("❌ Failed to fetch top tracks:", err.message);
    res.status(500).json({ error: "Failed to fetch top tracks" });
  }
});

app.get("/api/sources/recently-played", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data } = await axios.get("https://api.spotify.com/v1/me/player/recently-played", {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: 50 }
    });

    const tracks = data.items
      .map(mapSpotifyItemToTrack)
      .filter((t: SpotifyTrack) => t.preview_url);

    res.json({ tracks });
  } catch (err: any) {
    console.error("❌ Failed to fetch recently played:", err.message);
    res.status(500).json({ error: "Failed to fetch recently played" });
  }
});

app.post("/api/sources/ai-recommendations", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { mood = 'balanced', count = 20 } = req.body;

    const { data: topData } = await axios.get("https://api.spotify.com/v1/me/top/tracks", {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { limit: 5, time_range: 'short_term' }
    });

    const seedTracks = topData.items.slice(0, 5).map((t: any) => t.id).join(',');

    const moodParams: any = {
      seed_tracks: seedTracks,
      limit: count
    };

    switch (mood) {
      case 'chill':
        moodParams.target_energy = 0.3;
        moodParams.target_valence = 0.4;
        moodParams.target_tempo = 90;
        break;
      case 'energetic':
        moodParams.target_energy = 0.8;
        moodParams.target_valence = 0.7;
        moodParams.target_tempo = 140;
        break;
      case 'sad':
        moodParams.target_energy = 0.3;
        moodParams.target_valence = 0.2;
        break;
      case 'happy':
        moodParams.target_energy = 0.7;
        moodParams.target_valence = 0.9;
        break;
      default:
        moodParams.target_energy = 0.5;
        moodParams.target_valence = 0.5;
    }

    const { data: recommendations } = await axios.get(
      "https://api.spotify.com/v1/recommendations",
      {
        headers: { Authorization: `Bearer ${user.access_token}` },
        params: moodParams
      }
    );

    const tracks = recommendations.tracks
      .map(mapSpotifyItemToTrack)
      .filter((t: SpotifyTrack) => t.preview_url);

    res.json({ tracks, mood });
  } catch (err: any) {
    console.error("❌ Failed to generate AI recommendations:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate recommendations" });
  }
});

// ==================== GAME ROUTES ====================

app.post("/api/games/solo/start", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { 
      difficulty = 'normal', 
      source = 'liked',
      sourceId = null,
      mood = null,
      count = 20 
    } = req.body;

    let tracks: SpotifyTrack[] = [];

    switch (source) {
      case 'liked':
        const { data: likedData } = await axios.get("https://api.spotify.com/v1/me/tracks", {
          headers: { Authorization: `Bearer ${user.access_token}` },
          params: { limit: 50 }
        });
        tracks = likedData.items.map(mapSpotifyItemToTrack).filter((t: SpotifyTrack) => t.preview_url);
        break;

      case 'playlist':
        if (!sourceId) return res.status(400).json({ error: "Playlist ID required" });
        const { data: playlistData } = await axios.get(
          `https://api.spotify.com/v1/playlists/${sourceId}/tracks`,
          {
            headers: { Authorization: `Bearer ${user.access_token}` },
            params: { limit: 50 }
          }
        );
        tracks = playlistData.items.map(mapSpotifyItemToTrack).filter((t: SpotifyTrack) => t.preview_url);
        break;

      case 'top-tracks':
        const { data: topData } = await axios.get("https://api.spotify.com/v1/me/top/tracks", {
          headers: { Authorization: `Bearer ${user.access_token}` },
          params: { limit: 50, time_range: 'medium_term' }
        });
        tracks = topData.items.map(mapSpotifyItemToTrack).filter((t: SpotifyTrack) => t.preview_url);
        break;

      case 'recently-played':
        const { data: recentData } = await axios.get("https://api.spotify.com/v1/me/player/recently-played", {
          headers: { Authorization: `Bearer ${user.access_token}` },
          params: { limit: 50 }
        });
        tracks = recentData.items.map(mapSpotifyItemToTrack).filter((t: SpotifyTrack) => t.preview_url);
        break;

      case 'ai':
        const aiRes = await axios.post(
          `${req.protocol}://${req.get('host')}/api/sources/ai-recommendations`,
          { mood, count },
          { headers: req.headers }
        );
        tracks = aiRes.data.tracks;
        break;

      default:
        return res.status(400).json({ error: "Invalid source" });
    }

    if (tracks.length < 10) {
      return res.status(404).json({ 
        error: "Insufficient tracks with preview URLs",
        hint: "Try a different source or add more songs"
      });
    }

    const selectedTracks = tracks
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    const { rows: [session] } = await pool.query(
      `INSERT INTO game_sessions (user_id, mode, difficulty, source, total_questions, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [user.id, 'solo', difficulty, source, selectedTracks.length]
    );

    for (const track of selectedTracks) {
      await pool.query(
        `INSERT INTO tracks (user_id, spotify_track_id, title, artist, album, preview_url, album_cover, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id, spotify_track_id) DO NOTHING`,
        [user.id, track.spotify_track_id, track.title, track.artist, track.album, track.preview_url, track.album_cover, source]
      );
    }

    const formattedTracks = selectedTracks.map(t => ({
      id: t.spotify_track_id,
      title: t.title,
      artist: t.artist,
      preview_url: t.preview_url!,
      album_cover: t.album_cover
    }));

    res.json({ 
      sessionId: session.id,
      tracks: formattedTracks,
      difficulty,
      source
    });
    
  } catch (err: any) {
    console.error("❌ Failed to start game:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to start game" });
  }
});

app.post("/api/games/answer", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
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

    const validation = validateAnswer(userAnswer || '', correctAnswer);
    const isCorrect = validation.isCorrect && !skipped;

    const { rows: [session] } = await pool.query(
      'SELECT difficulty FROM game_sessions WHERE id = $1',
      [sessionId]
    );

    const points = calculatePoints(isCorrect, responseTimeMs, session.difficulty);

    const { rows: [dbTrack] } = await pool.query(
      'SELECT id FROM tracks WHERE spotify_track_id = $1 AND user_id = $2 LIMIT 1',
      [trackId, user.id]
    );

    await pool.query(
      `INSERT INTO game_rounds (session_id, track_id, question_number, user_answer, correct_answer, is_correct, response_time_ms, points_earned, hint_used, skipped)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [sessionId, dbTrack?.id, questionNumber, userAnswer, correctAnswer, isCorrect, responseTimeMs, points, hintUsed, skipped]
    );

    await pool.query(
      `UPDATE game_sessions 
       SET correct_answers = correct_answers + $1,
           final_score = final_score + $2
       WHERE id = $3`,
      [isCorrect ? 1 : 0, points, sessionId]
    );

    res.json({ 
      isCorrect,
      points,
      similarity: validation.similarity,
      method: validation.method
    });
    
  } catch (err: any) {
    console.error("❌ Failed to submit answer:", err.message);
    res.status(500).json({ error: "Failed to submit answer" });
  }
});

app.post("/api/games/complete", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.body;

    const { rows: [session] } = await pool.query(
      `SELECT 
        total_questions,
        correct_answers,
        final_score,
        difficulty,
        AVG(response_time_ms) as avg_response_time
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

    const baseXP = session.correct_answers * 10;
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
      [maxStreak, totalXP, session.avg_response_time, sessionId]
    );

    await pool.query(
      `UPDATE users 
       SET total_score = total_score + $1,
           games_played = games_played + 1,
           best_streak = GREATEST(best_streak, $2),
           current_streak = CASE WHEN $3 = $4 THEN current_streak + 1 ELSE 0 END
       WHERE id = $5`,
      [session.final_score, maxStreak, session.correct_answers, session.total_questions, user.id]
    );

    const { newLevel, leveledUp } = await updateUserXP(user.id, totalXP);
    const newBadges = await checkAndAwardBadges(user.id);

    res.json({
      success: true,
      stats: {
        score: session.final_score,
        correctAnswers: session.correct_answers,
        totalQuestions: session.total_questions,
        accuracy: Math.round((session.correct_answers / session.total_questions) * 100),
        maxStreak,
        avgResponseTime: Math.round(session.avg_response_time)
      },
      rewards: {
        xpEarned: totalXP,
        newLevel,
        leveledUp,
        newBadges
      }
    });
    
  } catch (err: any) {
    console.error("❌ Failed to complete game:", err.message);
    res.status(500).json({ error: "Failed to complete game" });
  }
});

app.post("/api/tracks/like", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { trackId } = req.body;

    await axios.put(
      "https://api.spotify.com/v1/me/tracks",
      { ids: [trackId] },
      { headers: { Authorization: `Bearer ${user.access_token}` } }
    );

    const { rows: [track] } = await pool.query(
      'SELECT id FROM tracks WHERE spotify_track_id = $1 AND user_id = $2',
      [trackId, user.id]
    );

    if (track) {
      await pool.query(
        `INSERT INTO discoveries (user_id, track_id, liked, added_to_spotify)
         VALUES ($1, $2, TRUE, TRUE)
         ON CONFLICT (user_id, track_id) DO UPDATE SET liked = TRUE, added_to_spotify = TRUE`,
        [user.id, track.id]
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("❌ Failed to like track:", err.message);
    res.status(500).json({ error: "Failed to like track" });
  }
});

// ==================== STATS & PROFILE ROUTES ====================

app.get("/api/user/profile", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
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

    res.json({
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
    console.error("❌ Failed to fetch profile:", err.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get("/api/stats/leaderboard", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leaderboard_global LIMIT 50');
    res.json({ leaderboard: rows });
  } catch (err: any) {
    console.error("❌ Failed to fetch leaderboard:", err.message);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

app.get("/api/games/history", async (req: Request, res: Response) => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
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

    res.json({ history: rows });
  } catch (err: any) {
    console.error("❌ Failed to fetch history:", err.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ==================== HEALTH ROUTES ====================

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
    
    res.json({ 
      status: "ok",
      database: "connected",
      users_count: parseInt(userCount.count),
      tables: tables.map(r => r.table_name)
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// ==================== WEBSOCKET ====================

io.on("connection", (socket) => {
  console.log(`🔌 WebSocket client connected: ${socket.id}`);
  
  socket.on("disconnect", () => {
    console.log(`❌ WebSocket client disconnected: ${socket.id}`);
  });
});

// ==================== SERVER ====================

const PORT = Number(process.env.PORT) || 8080;

server.listen(PORT, () => {
  console.log(`🚀 Blindify API server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`✅ Server ready to accept connections`);
});