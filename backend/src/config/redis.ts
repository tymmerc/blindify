import Redis from 'ioredis';
import { logger } from '../utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client for general use
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect on READONLY errors
      return true;
    }
    return false;
  }
});

redis.on('connect', () => {
  logger.info('Redis client connected');
});

redis.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('reconnecting', () => {
  logger.warn('Redis client reconnecting');
});

// Create separate Redis client for pub/sub
export const redisPubClient = new Redis(REDIS_URL);
export const redisSubClient = redisPubClient.duplicate();

// Game state storage keys
export const GAME_STATE_PREFIX = 'game:state:';
export const ROOM_PRESENCE_PREFIX = 'room:presence:';
export const USER_PRESENCE_PREFIX = 'user:presence:';

// TTL constants (in seconds)
export const GAME_STATE_TTL = 3600; // 1 hour
export const PRESENCE_TTL = 60; // 1 minute
export const ROOM_TTL = 7200; // 2 hours

/**
 * Store game state in Redis with TTL
 */
export async function setGameState(roomCode: string, state: any): Promise<void> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  await redis.setex(key, GAME_STATE_TTL, JSON.stringify(state));
}

/**
 * Retrieve game state from Redis
 */
export async function getGameState(roomCode: string): Promise<any | null> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Delete game state from Redis
 */
export async function deleteGameState(roomCode: string): Promise<void> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  await redis.del(key);
}

/**
 * Check if game state exists
 */
export async function hasGameState(roomCode: string): Promise<boolean> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * Store user presence in Redis
 */
export async function setUserPresence(userId: string, presence: any): Promise<void> {
  const key = `${USER_PRESENCE_PREFIX}${userId}`;
  await redis.setex(key, PRESENCE_TTL, JSON.stringify(presence));
}

/**
 * Get user presence from Redis
 */
export async function getUserPresence(userId: string): Promise<any | null> {
  const key = `${USER_PRESENCE_PREFIX}${userId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Delete user presence
 */
export async function deleteUserPresence(userId: string): Promise<void> {
  const key = `${USER_PRESENCE_PREFIX}${userId}`;
  await redis.del(key);
}

/**
 * Get all active game room codes
 */
export async function getActiveGameRooms(): Promise<string[]> {
  const keys = await redis.keys(`${GAME_STATE_PREFIX}*`);
  return keys.map(key => key.replace(GAME_STATE_PREFIX, ''));
}

/**
 * Extend game state TTL (e.g., when players are active)
 */
export async function extendGameStateTTL(roomCode: string, seconds: number = GAME_STATE_TTL): Promise<void> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  await redis.expire(key, seconds);
}

/**
 * Store temporary data with custom TTL
 */
export async function setTemp(key: string, value: any, ttl: number): Promise<void> {
  await redis.setex(key, ttl, JSON.stringify(value));
}

/**
 * Get temporary data
 */
export async function getTemp(key: string): Promise<any | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
  await redisPubClient.quit();
  await redisSubClient.quit();
  logger.info('Redis connections closed');
}
