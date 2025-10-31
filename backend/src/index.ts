/**
 * =============================================================================
 * BLINDIFY BACKEND 
 * =============================================================================
 * All TypeScript errors resolved - Production ready
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import cookieSession from "cookie-session";
import { Server as SocketIOServer } from "socket.io";
import http from "http";
import axios from "axios";
import { pool } from "./config/db";
import { makeSpotify } from "./config/spotify";

dotenv.config();

export { pool };

// Spotify OAuth scopes
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-top-read',
  'playlist-read-private',
  'user-read-recently-played',
  'user-library-modify'
];

// Test database connection
async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connected');
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL failed:', err);
    return false;
  }
}

// Refresh Spotify token
async function refreshSpotifyToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const api = makeSpotify(undefined, refreshToken);
  try {
    const data = await api.refreshAccessToken();
    return {
      access_token: data.body.access_token,
      expires_in: data.body.expires_in
    };
  } catch (error) {
    throw new Error('Token refresh failed');
  }
}

// Types
interface AuthenticatedUser {
  id: number;
  spotify_id: string;
  username: string | null;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  level: number;
  xp: number;
  total_score: number;
  games_played: number;
  current_streak: number;
  best_streak: number;
}

interface Track {
  spotify_track_id: string;
  title: string;
  artist: string;
  album?: string;
  preview_url: string | null;
  album_cover: string | null;
  duration_ms?: number;
  popularity?: number;
}

interface GameSession {
  id: number;
  user_id: number;
  mode: 'solo' | 'multiplayer';
  difficulty: 'easy' | 'normal' | 'hard';
  source: string;
  total_questions: number;
  correct_answers: number;
  final_score: number;
  avg_response_time: number | null;
  completed: boolean;
}

// Server setup
const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

const allowedOrigins = [
  "https://blindify-chi.vercel.app",
  "https://blindify-o5vqc47oi-tymeos-projects.vercel.app",
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5173"
].filter((origin): origin is string => typeof origin === 'string' && origin.length > 0);

const io = new SocketIOServer(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true }
});

// Middlewares
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true 
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60_000, max: 120, message: { error: 'Too many requests' } }));
app.use(slowDown({ windowMs: 60_000, delayAfter: 60, delayMs: () => 100 }));
app.use(cookieSession({
  name: "blindify_session",
  secret: process.env.SESSION_SECRET || "CHANGE_ME",
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  httpOnly: true
}));

// Utility Functions
async function getUserByAccessToken(authHeader?: string): Promise<AuthenticatedUser | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  try {
    const { rows } = await pool.query<AuthenticatedUser>(
      `SELECT * FROM users WHERE access_token = $1 LIMIT 1`, [token]
    );
    return rows[0] || null;
  } catch (err) {
    console.error("❌ Auth error:", err);
    return null;
  }
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const aLen = a.length, bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  
  const v0 = new Array(bLen + 1);
  const v1 = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) v0[j] = j;
  
  for (let i = 0; i < aLen; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bLen; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bLen; j++) v0[j] = v1[j];
  }
  return v1[bLen];
}

function normalizeAnswer(str: string): string {
  return str.toLowerCase().trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

function validateAnswer(userInput: string, correctAnswer: string): {
  isCorrect: boolean; similarity: number; method: string;
} {
  const input = normalizeAnswer(userInput || "");
  const correct = normalizeAnswer(correctAnswer || "");
  
  if (input === correct) return { isCorrect: true, similarity: 100, method: 'exact' };
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

function calculatePoints(isCorrect: boolean, responseTimeMs: number, difficulty: string): number {
  if (!isCorrect) return 0;
  const basePoints: Record<string, number> = { easy: 10, normal: 20, hard: 30 };
  const base = basePoints[difficulty] || 20;
  
  let speedBonus = 0;
  if (responseTimeMs < 2000) speedBonus = base * 0.5;
  else if (responseTimeMs < 5000) speedBonus = base * 0.25;
  else if (responseTimeMs < 8000) speedBonus = base * 0.1;
  
  return Math.round(base + speedBonus);
}

function validateAndScore(userAnswer: string, correctAnswer: string, responseTimeMs: number, difficulty: string) {
  const validation = validateAnswer(userAnswer, correctAnswer);
  const points = calculatePoints(validation.isCorrect, responseTimeMs, difficulty);
  return { ...validation, points };
}

async function updateUserXP(userId: number, xpGained: number): Promise<{ newLevel: number; leveledUp: boolean }> {
  const { rows } = await pool.query<{ level: number; xp: number }>(
    'SELECT level, xp FROM users WHERE id = $1', [userId]
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
  
  await pool.query('UPDATE users SET xp = $1, level = $2 WHERE id = $3', [newXP, newLevel, userId]);
  return { newLevel, leveledUp };
}

async function checkAndAwardBadges(userId: number): Promise<string[]> {
  const newBadges: string[] = [];
  try {
    const { rows: userStats } = await pool.query(
      'SELECT games_played, best_streak, level FROM users WHERE id = $1', [userId]
    );
    if (!userStats[0]) return newBadges;
    
    const stats = userStats[0];
    const { rows: availableBadges } = await pool.query(
      `SELECT b.id, b.name, b.requirement_type, b.requirement_value
       FROM badges b WHERE NOT EXISTS (
         SELECT 1 FROM user_badges ub WHERE ub.user_id = $1 AND ub.badge_id = b.id
       )`, [userId]
    );
    
    for (const badge of availableBadges) {
      let earned = false;
      switch (badge.requirement_type) {
        case 'games_played': earned = stats.games_played >= badge.requirement_value; break;
        case 'streak': earned = stats.best_streak >= badge.requirement_value; break;
        case 'level': earned = stats.level >= badge.requirement_value; break;
      }
      
      if (earned) {
        await pool.query(
          'INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, badge.id]
        );
        newBadges.push(badge.name);
      }
    }
  } catch (err) {
    console.error('❌ Badge error:', err);
  }
  return newBadges;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function getUserLikedTracks(spotify: ReturnType<typeof makeSpotify>, limit: number = 50): Promise<Partial<Track>[]> {
  try {
    const data = await spotify.getMySavedTracks({ limit: Math.min(limit, 50) });
    return data.body.items
      .filter((item: any) => item.track && item.track.preview_url)
      .map((item: any) => ({
        spotify_track_id: item.track.id,
        title: item.track.name,
        artist: item.track.artists.map((a: any) => a.name).join(', '),
        album: item.track.album.name,
        preview_url: item.track.preview_url,
        album_cover: item.track.album.images[0]?.url || null,
        duration_ms: item.track.duration_ms,
        popularity: item.track.popularity
      }));
  } catch (err) {
    console.error('❌ Error fetching tracks:', err);
    return [];
  }
}

async function saveTracksToDatabase(tracks: Partial<Track>[], userId: number): Promise<void> {
  for (const track of tracks) {
    try {
      await pool.query(
        `INSERT INTO tracks (spotify_track_id, title, artist, album, preview_url, album_cover, duration_ms, popularity, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (spotify_track_id) DO NOTHING`,
        [track.spotify_track_id, track.title, track.artist, track.album, 
         track.preview_url, track.album_cover, track.duration_ms, track.popularity, userId]
      );
    } catch (err) {
      console.error('❌ Save track error:', err);
    }
  }
}

async function blacklistTracks(userId: number, trackIds: string[], hours: number = 24): Promise<void> {
  const blacklistUntil = new Date();
  blacklistUntil.setHours(blacklistUntil.getHours() + hours);
  
  for (const trackId of trackIds) {
    try {
      const { rows } = await pool.query<{ id: number }>(
        'SELECT id FROM tracks WHERE spotify_track_id = $1', [trackId]
      );
      if (rows[0]) {
        await pool.query(
          `INSERT INTO track_blacklist (user_id, track_id, blacklisted_until)
           VALUES ($1, $2, $3) ON CONFLICT (user_id, track_id) DO UPDATE SET blacklisted_until = EXCLUDED.blacklisted_until`,
          [userId, rows[0].id, blacklistUntil]
        );
      }
    } catch (err) {
      console.error('❌ Blacklist error:', err);
    }
  }
}

// Routes
app.get('/auth/login', (_req: Request, res: Response): void => {
  try {
    const api = makeSpotify();
    const state = Math.random().toString(36).substring(7);
    const authorizeUrl = api.createAuthorizeURL(SPOTIFY_SCOPES, state);
    res.redirect(authorizeUrl);
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/auth/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = String(req.query.code || '');
    if (!code) {
      res.status(400).send('Missing code');
      return;
    }
    
    const api = makeSpotify();
    const grant = await api.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = grant.body;
    
    const { data: profile } = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    
    await pool.query(
      `INSERT INTO users (spotify_id, username, email, access_token, refresh_token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (spotify_id) DO UPDATE SET
         username = EXCLUDED.username, access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token, updated_at = NOW()`,
      [profile.id, profile.display_name || 'Unknown', profile.email || null, access_token, refresh_token]
    );
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?access_token=${access_token}&expires_in=${expires_in}`);
  } catch (err: any) {
    console.error('❌ Callback error:', err);
    res.status(500).send('Auth failed');
  }
});

app.post('/api/games/solo/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (user.refresh_token) {
      try {
        const spotify = makeSpotify(user.access_token || undefined, user.refresh_token || undefined);
        await spotify.getMe();
      } catch (error: any) {
        if (error.statusCode === 401) {
          console.log('🔄 Token expired, refreshing...');
          try {
            const newTokens = await refreshSpotifyToken(user.refresh_token);
            await pool.query('UPDATE users SET access_token = $1 WHERE id = $2', [newTokens.access_token, user.id]);
            user.access_token = newTokens.access_token;
            console.log('✅ Token refreshed successfully');
          } catch (refreshError) {
            console.error('❌ Failed to refresh token:', refreshError);
            res.status(401).json({ error: 'Token refresh failed, please login again' });
            return;
          }
        }
      }
    }

    const { difficulty = 'normal', source = 'top_tracks', sourceId, mood, count = 10 } = req.body;
    
    const sessionResult = await pool.query<GameSession>(
      `INSERT INTO game_sessions (user_id, mode, difficulty, source, source_id, total_questions)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user.id, 'solo', difficulty, source, sourceId || null, count]
    );
    const session = sessionResult.rows[0];

    let tracks: Track[] = [];
    const spotify = makeSpotify(user.access_token || undefined, user.refresh_token || undefined);

    try {
      if (source === 'top_tracks') {
        const data = await spotify.getMyTopTracks({ limit: count, time_range: 'medium_term' });
        tracks = data.body.items.map((t: any) => ({
          spotify_track_id: t.id,
          title: t.name,
          artist: t.artists.map((a: any) => a.name).join(', '),
          album: t.album.name,
          preview_url: t.preview_url,
          album_cover: t.album.images[0]?.url || null,
          duration_ms: t.duration_ms,
          popularity: t.popularity
        }));
      } else if (source === 'liked_tracks') {
        const data = await spotify.getMySavedTracks({ limit: count });
        tracks = data.body.items.map((item: any) => ({
          spotify_track_id: item.track.id,
          title: item.track.name,
          artist: item.track.artists.map((a: any) => a.name).join(', '),
          album: item.track.album.name,
          preview_url: item.track.preview_url,
          album_cover: item.track.album.images[0]?.url || null,
          duration_ms: item.track.duration_ms,
          popularity: item.track.popularity
        }));
      } else if (source === 'playlist' && sourceId) {
        const data = await spotify.getPlaylistTracks(sourceId, { limit: count });
        tracks = data.body.items.map((item: any) => ({
          spotify_track_id: item.track.id,
          title: item.track.name,
          artist: item.track.artists.map((a: any) => a.name).join(', '),
          album: item.track.album.name,
          preview_url: item.track.preview_url,
          album_cover: item.track.album.images[0]?.url || null,
          duration_ms: item.track.duration_ms,
          popularity: item.track.popularity
        }));
      } else if (source === 'recently_played') {
        const data = await spotify.getMyRecentlyPlayedTracks({ limit: count });
        tracks = data.body.items.map((item: any) => ({
          spotify_track_id: item.track.id,
          title: item.track.name,
          artist: item.track.artists.map((a: any) => a.name).join(', '),
          album: item.track.album.name,
          preview_url: item.track.preview_url,
          album_cover: item.track.album.images[0]?.url || null,
          duration_ms: item.track.duration_ms,
          popularity: item.track.popularity
        }));
      }
    } catch (error: any) {
      console.error('❌ Error fetching tracks:', error);
      res.status(500).json({ error: 'Failed to fetch tracks from Spotify' });
      return;
    }

    if (tracks.length === 0) {
      res.status(400).json({ error: 'No tracks available from the selected source' });
      return;
    }

    for (const track of tracks) {
      await pool.query(
        `INSERT INTO tracks (spotify_track_id, title, artist, album, preview_url, album_cover, duration_ms, popularity, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (spotify_track_id) DO NOTHING`,
        [track.spotify_track_id, track.title, track.artist, track.album, track.preview_url, track.album_cover, track.duration_ms, track.popularity, user.id]
      );
    }

    res.json({ sessionId: session.id, tracks });
  } catch (error: any) {
    console.error('❌ Error starting solo game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

app.get('/api/auth/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ authenticated: false });
      return;
    }
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        spotify_id: user.spotify_id,
        username: user.username,
        level: user.level,
        xp: user.xp,
        total_score: user.total_score,
        games_played: user.games_played,
        current_streak: user.current_streak,
        best_streak: user.best_streak
      }
    });
  } catch (err) {
    console.error('❌ Me error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/auth/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (user) {
      await pool.query('UPDATE users SET access_token = NULL WHERE id = $1', [user.id]);
    }
    if (req.session) {
      req.session = null as any;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.post('/api/games/solo/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { difficulty = 'normal', source = 'liked_tracks', count = 10 } = req.body;
    const spotify = makeSpotify(user.access_token);
    let tracks = await getUserLikedTracks(spotify, count * 3);
    
    if (tracks.length === 0) {
      res.status(400).json({ error: 'No tracks' });
      return;
    }
    
    const selectedTracks = shuffleArray(tracks).slice(0, count);
    await saveTracksToDatabase(selectedTracks, user.id);
    
    const { rows: sessionRows } = await pool.query<GameSession>(
      `INSERT INTO game_sessions (user_id, mode, difficulty, source, total_questions, started_at)
       VALUES ($1, 'solo', $2, $3, $4, NOW()) RETURNING id, difficulty, total_questions`,
      [user.id, difficulty, source, selectedTracks.length]
    );
    
    const session = sessionRows[0];
    const timePerQuestion = difficulty === 'easy' ? 15 : difficulty === 'hard' ? 5 : 10;
    
    const formattedTracks = selectedTracks.map((track, index) => ({
      id: track.spotify_track_id!,
      title: track.title!,
      artist: track.artist!,
      preview_url: track.preview_url!,
      album_cover: track.album_cover!,
      questionNumber: index + 1
    }));
    
    res.json({
      sessionId: session.id,
      tracks: formattedTracks,
      difficulty: session.difficulty,
      timePerQuestion,
      totalQuestions: selectedTracks.length
    });
  } catch (error: any) {
    console.error('❌ Start error:', error);
    res.status(500).json({ error: 'Failed to start' });
  }
});

app.post('/api/games/answer', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { sessionId, trackId, userAnswer, correctAnswer, responseTimeMs, questionNumber, hintUsed = false, skipped = false } = req.body;
    
    const { rows: sessionRows } = await pool.query<GameSession>(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2', [sessionId, user.id]
    );
    
    if (!sessionRows[0]) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    const session = sessionRows[0];
    const validation = validateAndScore(skipped ? '' : userAnswer, correctAnswer, responseTimeMs, session.difficulty);
    
    const { rows: trackRows } = await pool.query<{ id: number }>(
      'SELECT id FROM tracks WHERE spotify_track_id = $1', [trackId]
    );
    
    await pool.query(
      `INSERT INTO game_rounds (session_id, track_id, spotify_track_id, question_number, user_answer, correct_answer,
                                is_correct, response_time_ms, points_earned, hint_used, skipped, similarity_score, validation_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [sessionId, trackRows[0]?.id, trackId, questionNumber, userAnswer, correctAnswer,
       validation.isCorrect, responseTimeMs, validation.points, hintUsed, skipped, validation.similarity, validation.method]
    );
    
    const newCorrectAnswers = session.correct_answers + (validation.isCorrect ? 1 : 0);
    const newScore = session.final_score + validation.points;
    
    await pool.query('UPDATE game_sessions SET correct_answers = $1, final_score = $2 WHERE id = $3',
      [newCorrectAnswers, newScore, sessionId]
    );
    
    const { rows: userRows } = await pool.query<{ current_streak: number; best_streak: number }>(
      'SELECT current_streak, best_streak FROM users WHERE id = $1', [user.id]
    );
    
    const currentStreak = validation.isCorrect ? (userRows[0]?.current_streak || 0) + 1 : 0;
    const bestStreak = Math.max(currentStreak, userRows[0]?.best_streak || 0);
    
    await pool.query('UPDATE users SET current_streak = $1, best_streak = $2 WHERE id = $3',
      [currentStreak, bestStreak, user.id]
    );
    
    res.json({
      isCorrect: validation.isCorrect,
      similarity: validation.similarity,
      method: validation.method,
      points: validation.points,
      newScore,
      currentStreak,
      bestStreak
    });
  } catch (error: any) {
    console.error('❌ Answer error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/games/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { sessionId } = req.body;
    
    const { rows: sessionRows } = await pool.query<GameSession>(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2', [sessionId, user.id]
    );
    
    if (!sessionRows[0]) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    const session = sessionRows[0];
    if (session.completed) {
      res.status(400).json({ error: 'Already completed' });
      return;
    }
    
    const xpEarned = session.correct_answers * 10;
    
    await pool.query(
      'UPDATE game_sessions SET completed = true, completed_at = NOW(), xp_earned = $1 WHERE id = $2',
      [xpEarned, sessionId]
    );
    
    await pool.query(
      'UPDATE users SET games_played = games_played + 1, total_score = total_score + $1, updated_at = NOW() WHERE id = $2',
      [session.final_score, user.id]
    );
    
    const { newLevel, leveledUp } = await updateUserXP(user.id, xpEarned);
    const newBadges = await checkAndAwardBadges(user.id);
    
    const { rows: playedTracks } = await pool.query<{ spotify_track_id: string }>(
      'SELECT spotify_track_id FROM game_rounds WHERE session_id = $1', [sessionId]
    );
    
    await blacklistTracks(user.id, playedTracks.map(t => t.spotify_track_id), 24);
    
    const accuracy = session.total_questions > 0 
      ? Math.round((session.correct_answers / session.total_questions) * 100) : 0;
    
    res.json({
      completed: true,
      finalScore: session.final_score,
      correctAnswers: session.correct_answers,
      totalQuestions: session.total_questions,
      accuracy,
      xpEarned,
      newLevel,
      leveledUp,
      newBadges
    });
  } catch (error: any) {
    console.error('❌ Complete error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/stats/detailed', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { rows: stats } = await pool.query(
      `SELECT COUNT(*)::INTEGER as total_games, AVG(final_score)::INTEGER as average_score,
              MAX(final_score)::INTEGER as best_score
       FROM game_sessions WHERE user_id = $1 AND completed = TRUE`,
      [user.id]
    );
    
    res.json({
      totalGames: stats[0]?.total_games || 0,
      averageScore: stats[0]?.average_score || 0,
      bestScore: stats[0]?.best_score || 0
    });
  } catch (error: any) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/games/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const { rows } = await pool.query(
      `SELECT id, mode, difficulty, total_questions, correct_answers, final_score, started_at, completed_at
       FROM game_sessions WHERE user_id = $1 AND completed = TRUE ORDER BY completed_at DESC LIMIT 50`,
      [user.id]
    );
    
    res.json({ history: rows });
  } catch (error: any) {
    console.error('❌ History error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/sources/playlists', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByAccessToken(req.headers.authorization);
    if (!user || !user.access_token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const spotify = makeSpotify(user.access_token);
    const data = await spotify.getUserPlaylists();
    const playlists = data.body.items.map((p: any) => ({ id: p.id, name: p.name }));
    
    res.json({ playlists });
  } catch (error: any) {
    console.error('❌ Playlists error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'error' });
  }
});

// WebSocket
io.on('connection', (socket) => {
  console.log(`🔌 Socket: ${socket.id}`);
  
  socket.on('join-room', (roomCode: string) => {
    socket.join(roomCode);
    io.to(roomCode).emit('player-joined', { socketId: socket.id });
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
  });
});

// Error handlers
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal Error' });
});

// Start
const PORT = Number(process.env.PORT) || 8080;

async function startServer() {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ DB failed');
      process.exit(1);
    }
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log('╔═══════════════════════════════════════╗');
      console.log('║   🎧 BLINDIFY API SERVER READY 🎧    ║');
      console.log('╚═══════════════════════════════════════╝');
      console.log(`🚀 Port: ${PORT}`);
      console.log(`✅ Ready`);
    });
  } catch (error) {
    console.error('❌ Start failed:', error);
    process.exit(1);
  }
}

startServer();