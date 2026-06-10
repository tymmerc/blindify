import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../src/utils/session', () => ({
  getSessionContext: jest.fn(),
}));
jest.mock('../../src/services/trackResolution', () => ({
  hydratePreviewUrl: jest.fn(),
}));
jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { gamesController } from '../../src/controllers/gamesController';
import { pool } from '../../src/config/db';
import { getSessionContext } from '../../src/utils/session';
import { hydratePreviewUrl } from '../../src/services/trackResolution';
import axios from 'axios';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;
const mockGetSessionContext = getSessionContext as jest.MockedFunction<typeof getSessionContext>;
const mockHydratePreviewUrl = hydratePreviewUrl as jest.MockedFunction<typeof hydratePreviewUrl>;
const mockAxiosGet = (axios as any).get as jest.MockedFunction<any>;

function mockReq(overrides: any = {}): Request {
  return { body: {}, query: {}, params: {}, headers: {}, session: {}, ...overrides } as any;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res as Response & { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
}

function makeUser(overrides: any = {}) {
  return {
    id: 1,
    provider: 'spotify' as const,
    provider_id: 'sp_123',
    username: 'testuser',
    email: 'test@example.com',
    avatar: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConnection(overrides: any = {}) {
  return {
    id: 10,
    user_id: 1,
    provider: 'spotify' as const,
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: '2099-01-01T00:00:00Z',
    scope: ['streaming'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAudioSource(overrides: any = {}) {
  return {
    id: `uuid-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'spotify' as const,
    external_id: `ext-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Song',
    artist: 'Test Artist',
    album_cover: 'https://example.com/cover.jpg',
    audio_url: 'https://example.com/preview.mp3',
    duration_ms: 30000,
    metadata: {},
    ...overrides,
  };
}

function makeSessionContext(overrides: any = {}) {
  return {
    user: makeUser(),
    connection: makeConnection(),
    sessionToken: 'tok-abc',
    ...overrides,
  };
}

/**
 * Configures pool.query mock to handle the various queries made during startSoloGame.
 * Returns a list of audio sources that the DB will "return" for track fetching.
 */
function setupStartGameQueries(sources: any[], sessionOverrides: any = {}) {
  const session = {
    id: 42,
    mode: 'solo',
    difficulty: 'normal',
    source_provider: 'spotify',
    total_rounds: sources.length,
    started_at: '2025-06-01T00:00:00Z',
    ...sessionOverrides,
  };

  mockQuery.mockImplementation(((sql: string, _params?: any) => {
    const q = typeof sql === 'string' ? sql : '';

    // ensureUsedTracksTable: CREATE TABLE / CREATE INDEX / DELETE
    if (q.includes('CREATE TABLE') || q.includes('CREATE INDEX')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (q.includes('DELETE FROM used_tracks')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    // recentAudioSourceIds / recentFirstAudioSourceIds / recentFirstExternalIds
    if (q.includes('game_rounds') && q.includes('game_sessions')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    // fetchAudioSources (SELECT from audio_sources with ORDER BY RANDOM)
    if (q.includes('FROM audio_sources') && q.includes('ORDER BY RANDOM')) {
      return Promise.resolve({ rows: sources, rowCount: sources.length });
    }

    // fetchGlobalRandomSources
    if (q.includes('FROM audio_sources') && q.includes('RANDOM')) {
      return Promise.resolve({ rows: sources, rowCount: sources.length });
    }

    // INSERT INTO game_sessions
    if (q.includes('INSERT INTO game_sessions')) {
      return Promise.resolve({ rows: [session], rowCount: 1 });
    }

    // INSERT INTO game_participants
    if (q.includes('INSERT INTO game_participants')) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }

    // INSERT INTO game_rounds
    if (q.includes('INSERT INTO game_rounds')) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }

    // INSERT INTO used_tracks (markTracksAsUsed)
    if (q.includes('INSERT INTO used_tracks')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    // INSERT INTO audio_sources (iTunes import)
    if (q.includes('INSERT INTO audio_sources')) {
      return Promise.resolve({ rows: sources.slice(0, 1), rowCount: 1 });
    }

    // Default
    return Promise.resolve({ rows: [], rowCount: 0 });
  }) as any);

  return session;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('gamesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // startSoloGame
  // ════════════════════════════════════════════════════════════════════════════
  describe('startSoloGame', () => {
    it('should start a solo game with valid parameters', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}`, title: `Song ${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      const session = setupStartGameQueries(sources);

      const req = mockReq({ body: { source: 'library', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            session: expect.objectContaining({
              id: session.id,
              mode: 'solo',
              totalRounds: sources.length,
            }),
            tracks: expect.any(Array),
          }),
        })
      );
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.tracks).toHaveLength(10);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetSessionContext.mockResolvedValue(null);

      const req = mockReq({ body: { source: 'library' } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      // getSessionContext handles the 401 response internally when it returns null
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should clamp count to minimum 5', async () => {
      const sources = Array.from({ length: 5 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources, { total_rounds: 5 });

      const req = mockReq({ body: { source: 'library', count: 1 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should clamp count to maximum 25', async () => {
      const sources = Array.from({ length: 25 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources, { total_rounds: 25 });

      const req = mockReq({ body: { source: 'library', count: 100 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should default count to 10 when not provided', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);

      const req = mockReq({ body: { source: 'library' } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.tracks).toHaveLength(10);
    });

    it('should default source to "library" when not provided', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);

      const req = mockReq({ body: {} });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle "liked" source type', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);

      const req = mockReq({ body: { source: 'liked', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle "top_week" source type (short_term)', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);
      mockAxiosGet.mockResolvedValue({ data: { items: [] } });

      const req = mockReq({ body: { source: 'top_week', provider: 'spotify', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle "top_month" source type (medium_term)', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);
      mockAxiosGet.mockResolvedValue({ data: { items: [] } });

      const req = mockReq({ body: { source: 'top_month', provider: 'spotify', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle "top_all" source type (long_term)', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);
      mockAxiosGet.mockResolvedValue({ data: { items: [] } });

      const req = mockReq({ body: { source: 'top_all', provider: 'spotify', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 when fewer than 5 playable tracks are available', async () => {
      const sources = Array.from({ length: 3 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      // Return only 3 sources for all queries — not enough
      mockQuery.mockImplementation(((sql: string) => {
        const q = typeof sql === 'string' ? sql : '';
        if (q.includes('FROM audio_sources')) {
          return Promise.resolve({ rows: sources, rowCount: sources.length });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }) as any);

      const req = mockReq({ body: { source: 'library', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'insufficient_tracks',
          }),
        })
      );
    });

    it('should fallback to guest when no connection exists for non-guest provider', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext({ connection: null });
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);

      const req = mockReq({ body: { source: 'library', provider: 'spotify', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      // Should still succeed, falling back to guest mode
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should nullify playlistId when provider is not spotify', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}`, provider: 'guest' })
      );
      const ctx = makeSessionContext({
        user: makeUser({ provider: 'guest' }),
        connection: null,
      });
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources);

      const req = mockReq({
        body: { source: 'library', provider: 'guest', playlistId: 'pl-123', count: 10 },
      });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should include normalized track data in the response', async () => {
      const sources = Array.from({ length: 5 }, (_, i) =>
        makeAudioSource({
          id: `uuid-${i}`,
          external_id: `ext-${i}`,
          title: `Song ${i}`,
          artist: `Artist ${i}`,
          album_cover: `https://cover.com/${i}.jpg`,
          audio_url: `https://audio.com/${i}.mp3`,
        })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources, { total_rounds: 5 });

      const req = mockReq({ body: { source: 'library', count: 5 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      const track = responseData.data.tracks[0];
      expect(track).toEqual(
        expect.objectContaining({
          round: expect.any(Number),
          audioSourceId: expect.any(String),
          title: expect.any(String),
          artist: expect.any(String),
          audio_url: expect.any(String),
        })
      );
    });

    it('should handle database error during session creation gracefully', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      let callCount = 0;
      mockQuery.mockImplementation(((sql: string) => {
        const q = typeof sql === 'string' ? sql : '';

        if (q.includes('INSERT INTO game_sessions')) {
          return Promise.reject(new Error('DB connection lost'));
        }
        if (q.includes('FROM audio_sources')) {
          return Promise.resolve({ rows: sources, rowCount: sources.length });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }) as any);

      const req = mockReq({ body: { source: 'library', count: 10 } });
      const res = mockRes();

      await expect(gamesController.startSoloGame(req, res)).rejects.toThrow('DB connection lost');
    });

    it('should hydrate tracks without audio_url via hydratePreviewUrl', async () => {
      const sourcesWithoutUrl = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({
          id: `uuid-${i}`,
          external_id: `ext-${i}`,
          audio_url: null,
        })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      // hydratePreviewUrl returns a preview URL for tracks missing audio_url
      mockHydratePreviewUrl.mockResolvedValue('https://hydrated.example.com/preview.mp3');

      const session = {
        id: 42,
        mode: 'solo',
        difficulty: 'normal',
        source_provider: 'spotify',
        total_rounds: 10,
        started_at: '2025-06-01T00:00:00Z',
      };

      mockQuery.mockImplementation(((sql: string) => {
        const q = typeof sql === 'string' ? sql : '';
        if (q.includes('FROM audio_sources') && q.includes('RANDOM')) {
          return Promise.resolve({ rows: sourcesWithoutUrl, rowCount: sourcesWithoutUrl.length });
        }
        if (q.includes('INSERT INTO game_sessions')) {
          return Promise.resolve({ rows: [session], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }) as any);

      const req = mockReq({ body: { source: 'library', count: 10 } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      expect(mockHydratePreviewUrl).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should use difficulty parameter from request body', async () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeAudioSource({ id: `uuid-${i}`, external_id: `ext-${i}` })
      );
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);
      setupStartGameQueries(sources, { difficulty: 'hard' });

      const req = mockReq({ body: { source: 'library', count: 10, difficulty: 'hard' } });
      const res = mockRes();

      await gamesController.startSoloGame(req, res);

      // Verify difficulty was passed to INSERT INTO game_sessions
      const insertCall = mockQuery.mock.calls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO game_sessions')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toContain('hard');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // history
  // ════════════════════════════════════════════════════════════════════════════
  describe('history', () => {
    it('should return game history for authenticated user', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRows = [
        {
          id: 1,
          mode: 'solo',
          difficulty: 'normal',
          source_provider: 'spotify',
          total_rounds: 10,
          started_at: '2025-06-01T00:00:00Z',
          ended_at: '2025-06-01T00:05:00Z',
          state: 'finished',
        },
        {
          id: 2,
          mode: 'solo',
          difficulty: 'hard',
          source_provider: 'spotify',
          total_rounds: 15,
          started_at: '2025-06-02T00:00:00Z',
          ended_at: null,
          state: 'in_progress',
        },
      ];

      mockQuery.mockResolvedValue({ rows: sessionRows, rowCount: 2 } as any);

      const req = mockReq();
      const res = mockRes();

      await gamesController.history(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Controller maps raw DB rows into a richer history DTO
      // (totalRounds, createdAt, score, tracks, ...) rather than echoing rows.
      const payload = (res.json as jest.Mock).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.games).toHaveLength(2);
      expect(payload.data.games[0]).toEqual(
        expect.objectContaining({
          id: 1,
          mode: 'solo',
          difficulty: 'normal',
          state: 'finished',
          totalRounds: 10,
          createdAt: '2025-06-01T00:00:00Z',
        })
      );
      expect(payload.data.games[1]).toEqual(
        expect.objectContaining({ id: 2, totalRounds: 15, state: 'in_progress' })
      );
    });

    it('should return empty array for user with no games', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const req = mockReq();
      const res = mockRes();

      await gamesController.history(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { games: [] },
        })
      );
    });

    it('should return 401 when not authenticated', async () => {
      mockGetSessionContext.mockResolvedValue(null);

      const req = mockReq();
      const res = mockRes();

      await gamesController.history(req, res);

      // getSessionContext returns null and handles 401 internally
      expect(res.status).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      mockQuery.mockRejectedValue(new Error('Connection refused'));

      const req = mockReq();
      const res = mockRes();

      // Controller catches DB errors internally and returns a 500 envelope
      // rather than letting the rejection propagate.
      await gamesController.history(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // detailedStats
  // ════════════════════════════════════════════════════════════════════════════
  describe('detailedStats', () => {
    it('should return detailed stats for authenticated user', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const statsRow = {
        total_games: 20,
        total_correct: 150,
        total_guesses: 200,
        total_reaction_ms: 100000,
        best_streak: 8,
        total_xp: 1500,
        last_played_at: '2025-06-15T12:00:00Z',
      };
      mockQuery.mockResolvedValue({ rows: [statsRow], rowCount: 1 } as any);

      const req = mockReq();
      const res = mockRes();

      await gamesController.detailedStats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            stats: {
              totalGames: 20,
              accuracyRate: 75,
              averageReactionTime: 500,
              bestStreak: 8,
              totalXp: 1500,
              lastPlayedAt: '2025-06-15T12:00:00Z',
            },
          },
        })
      );
    });

    it('should return zeroed stats when user has no stats row', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const req = mockReq();
      const res = mockRes();

      await gamesController.detailedStats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            stats: {
              totalGames: 0,
              accuracyRate: 0,
              averageReactionTime: 0,
              bestStreak: 0,
              totalXp: 0,
              lastPlayedAt: null,
            },
          },
        })
      );
    });

    it('should handle zero total_guesses without division error', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const statsRow = {
        total_games: 1,
        total_correct: 0,
        total_guesses: 0,
        total_reaction_ms: 0,
        best_streak: 0,
        total_xp: 5,
        last_played_at: '2025-06-15T12:00:00Z',
      };
      mockQuery.mockResolvedValue({ rows: [statsRow], rowCount: 1 } as any);

      const req = mockReq();
      const res = mockRes();

      await gamesController.detailedStats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.stats.accuracyRate).toBe(0);
      expect(responseData.data.stats.averageReactionTime).toBe(0);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetSessionContext.mockResolvedValue(null);

      const req = mockReq();
      const res = mockRes();

      await gamesController.detailedStats(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should calculate accuracy rate with proper rounding', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const statsRow = {
        total_games: 5,
        total_correct: 7,
        total_guesses: 9,
        total_reaction_ms: 45000,
        best_streak: 3,
        total_xp: 200,
        last_played_at: '2025-06-15T12:00:00Z',
      };
      mockQuery.mockResolvedValue({ rows: [statsRow], rowCount: 1 } as any);

      const req = mockReq();
      const res = mockRes();

      await gamesController.detailedStats(req, res);

      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      // 7/9 * 100 = 77.777... -> 77.78
      expect(responseData.data.stats.accuracyRate).toBe(77.78);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // recordSoloResult
  // ════════════════════════════════════════════════════════════════════════════
  describe('recordSoloResult', () => {
    it('should record a correct solo result', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any) // SELECT session
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)           // UPDATE game_sessions
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);          // persistSoloResult

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 8, bestStreak: 5 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'recorded',
            alreadyFinished: false,
            totals: expect.objectContaining({
              rounds: 10,
              correct: 8,
              bestStreak: 5,
            }),
          }),
        })
      );
    });

    it('should record a result with zero correct guesses', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 0, bestStreak: 0 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.totals.correct).toBe(0);
      expect(responseData.data.totals.bestStreak).toBe(0);
      // xpDelta should be at least 5 (minimum floor)
      expect(responseData.data.totals.xpDelta).toBeGreaterThanOrEqual(5);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetSessionContext.mockResolvedValue(null);

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return 400 for missing sessionId', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const req = mockReq({
        body: { rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'invalid_session',
          }),
        })
      );
    });

    it('should return 400 for non-numeric sessionId', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const req = mockReq({
        body: { sessionId: 'abc', rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'invalid_session' }),
        })
      );
    });

    it('should return 404 when session does not exist', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const req = mockReq({
        body: { sessionId: 999, rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'session_not_found' }),
        })
      );
    });

    it('should return 404 when session belongs to another user', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 999, // different user
        mode: 'solo',
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any);

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 when session mode is not solo', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'multi', // not solo
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any);

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should indicate alreadyFinished when session was already finished', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'finished',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any) // SELECT session
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);          // UPDATE (0 rows because state='finished')

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.alreadyFinished).toBe(true);
    });

    it('should not call persistSoloResult when session was already finished', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'finished',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any) // SELECT session
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);          // UPDATE returns 0

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      // Only 2 queries: SELECT + UPDATE. No INSERT INTO user_stats (persistSoloResult).
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should clamp correct to not exceed total_rounds', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 50, bestStreak: 3 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      // correct is clamped to totalRounds (10)
      expect(responseData.data.totals.correct).toBeLessThanOrEqual(10);
    });

    it('should calculate xpDelta correctly', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 8, bestStreak: 5 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      // xpDelta = max(5, correct * 5 + bestStreak * 2) = max(5, 40 + 10) = 50
      expect(responseData.data.totals.xpDelta).toBe(50);
    });

    it('should enforce minimum xpDelta of 5', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 0, bestStreak: 0 },
      });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.totals.xpDelta).toBe(5);
    });

    it('should handle missing body gracefully', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const req = mockReq({ body: undefined });
      const res = mockRes();

      await gamesController.recordSoloResult(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'invalid_session' }),
        })
      );
    });

    it('should handle database error during UPDATE gracefully', async () => {
      const ctx = makeSessionContext();
      mockGetSessionContext.mockResolvedValue(ctx);

      const sessionRow = {
        id: 42,
        host_user_id: 1,
        mode: 'solo',
        total_rounds: 10,
        state: 'in_progress',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 } as any)
        .mockRejectedValueOnce(new Error('DB write error'));

      const req = mockReq({
        body: { sessionId: 42, rounds: 10, correct: 5, bestStreak: 3 },
      });
      const res = mockRes();

      await expect(gamesController.recordSoloResult(req, res)).rejects.toThrow('DB write error');
    });
  });
});
