import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import GameStateCache from '../../src/services/gameStateCache';
import { GameState, GamePhase, GameMode } from '../../src/types/game';

describe('GameStateCache Service', () => {
  let cache: GameStateCache;

  // Mock game state
  const mockGameState: Partial<GameState> = {
    roomCode: 'TEST01',
    mode: GameMode.FRIENDS,
    phase: GamePhase.LOBBY,
    hostId: 'user-123',
    players: [],
    currentRound: 0,
    totalRounds: 10,
    settings: {
      maxPlayers: 8,
      roundDuration: 25000,
      revealDuration: 5000
    }
  };

  beforeEach(() => {
    // Use in-memory cache for tests (no Redis dependency)
    cache = new GameStateCache(false);
  });

  afterEach(async () => {
    await cache.clear();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve game state', async () => {
      await cache.set('ROOM01', mockGameState as GameState);
      const retrieved = await cache.get('ROOM01');

      expect(retrieved).toEqual(mockGameState);
    });

    it('should return null for non-existent game', async () => {
      const retrieved = await cache.get('NONEXISTENT');
      expect(retrieved).toBeNull();
    });

    it('should check if game exists', async () => {
      await cache.set('ROOM01', mockGameState as GameState);

      const exists = await cache.has('ROOM01');
      expect(exists).toBe(true);

      const notExists = await cache.has('ROOM02');
      expect(notExists).toBe(false);
    });

    it('should delete game state', async () => {
      await cache.set('ROOM01', mockGameState as GameState);
      await cache.delete('ROOM01');

      const retrieved = await cache.get('ROOM01');
      expect(retrieved).toBeNull();
    });
  });

  describe('Update Operations', () => {
    it('should update specific fields', async () => {
      await cache.set('ROOM01', mockGameState as GameState);

      await cache.update('ROOM01', {
        phase: GamePhase.GUESSING,
        currentRound: 1
      });

      const updated = await cache.get('ROOM01');
      expect(updated?.phase).toBe(GamePhase.GUESSING);
      expect(updated?.currentRound).toBe(1);
      expect(updated?.hostId).toBe('user-123'); // unchanged
    });

    it('should not crash when updating non-existent game', async () => {
      await expect(
        cache.update('NONEXISTENT', { phase: GamePhase.GUESSING })
      ).resolves.not.toThrow();
    });
  });

  describe('Bulk Operations', () => {
    it('should retrieve all room codes', async () => {
      await cache.set('ROOM01', mockGameState as GameState);
      await cache.set('ROOM02', { ...mockGameState, roomCode: 'ROOM02' } as GameState);
      await cache.set('ROOM03', { ...mockGameState, roomCode: 'ROOM03' } as GameState);

      const rooms = await cache.getAllRoomCodes();
      expect(rooms).toHaveLength(3);
      expect(rooms).toContain('ROOM01');
      expect(rooms).toContain('ROOM02');
      expect(rooms).toContain('ROOM03');
    });

    it('should clear all game states', async () => {
      await cache.set('ROOM01', mockGameState as GameState);
      await cache.set('ROOM02', { ...mockGameState, roomCode: 'ROOM02' } as GameState);

      await cache.clear();

      const rooms = await cache.getAllRoomCodes();
      expect(rooms).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should return cache statistics', async () => {
      await cache.set('ROOM01', mockGameState as GameState);
      await cache.set('ROOM02', { ...mockGameState, roomCode: 'ROOM02' } as GameState);

      const stats = await cache.getStats();
      expect(stats.total).toBe(2);
      expect(stats.storage).toBe('memory');
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent writes', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        cache.set(`ROOM${i}`, {
          ...mockGameState,
          roomCode: `ROOM${i}`
        } as GameState)
      );

      await Promise.all(promises);

      const rooms = await cache.getAllRoomCodes();
      expect(rooms).toHaveLength(10);
    });

    it('should handle concurrent reads and writes', async () => {
      await cache.set('ROOM01', mockGameState as GameState);

      const operations = [
        cache.get('ROOM01'),
        cache.update('ROOM01', { currentRound: 1 }),
        cache.get('ROOM01'),
        cache.update('ROOM01', { currentRound: 2 }),
        cache.get('ROOM01')
      ];

      await Promise.all(operations);

      const final = await cache.get('ROOM01');
      expect(final?.currentRound).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve complex nested objects', async () => {
      const complexState: Partial<GameState> = {
        ...mockGameState,
        players: [
          {
            id: 'player1',
            name: 'Alice',
            score: 150,
            streak: 2,
            ready: true,
            connected: true
          },
          {
            id: 'player2',
            name: 'Bob',
            score: 200,
            streak: 3,
            ready: false,
            connected: true
          }
        ]
      };

      await cache.set('ROOM01', complexState as GameState);
      const retrieved = await cache.get('ROOM01');

      expect(retrieved?.players).toHaveLength(2);
      expect(retrieved?.players?.[0].name).toBe('Alice');
      expect(retrieved?.players?.[1].score).toBe(200);
    });

    it('should handle special characters in room codes', async () => {
      const roomCodes = ['ABC-123', 'TEST_01', 'ROOM.99'];

      for (const code of roomCodes) {
        await cache.set(code, {
          ...mockGameState,
          roomCode: code
        } as GameState);
      }

      for (const code of roomCodes) {
        const retrieved = await cache.get(code);
        expect(retrieved?.roomCode).toBe(code);
      }
    });
  });
});
