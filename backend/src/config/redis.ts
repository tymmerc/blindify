import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis garde une copie de secours de l'etat des parties (docs/adr/ADR-001).
// Le jeu doit tourner sans lui : aucune connexion a l'import, aucune adresse par
// defaut (localhost:6379 est le Redis systeme du VPS, partage avec d'autres
// projets), et aucune commande mise en file d'attente quand il est coupe.

/** Redis pas configure, coupe ou trop lent : a distinguer d'une cle absente. */
export class RedisUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

export type RedisHealth = 'ok' | 'absent';

const CONNECT_TIMEOUT_MS = 2000;
const COMMAND_TIMEOUT_MS = 1000;
const HEALTH_TIMEOUT_MS = 500;

let client: Redis | null = null;
// Clients de l'adaptateur Socket.IO (publication et abonnement), copies du
// client principal avec les memes garanties.
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

/**
 * Journalise une seule ligne par passage coupe/pret, pas une par tentative de
 * reconnexion. Les ecouteurs ignorent un client deja ferme par closeRedis().
 */
function watch(c: Redis, role: string, consequence: string, isCurrent: () => boolean): void {
  let logged: 'ready' | 'down' | null = null;
  c.on('ready', () => {
    if (!isCurrent() || logged === 'ready') return;
    logged = 'ready';
    logger.info('redis_pret', { client: role });
  });
  c.on('error', (err: Error) => {
    if (!isCurrent() || logged === 'down') return;
    logged = 'down';
    logger.warn(`redis_injoignable : ${consequence}`, { client: role, error: err.message });
  });
  c.on('close', () => {
    if (!isCurrent() || logged !== 'ready') return;
    logged = 'down';
    logger.warn(`redis_connexion_perdue : ${consequence}`, { client: role });
  });
}

const readyListeners = new Set<() => void>();

/** A chaque connexion (ou reconnexion) du client principal. */
export function onRedisReady(fn: () => void): void {
  readyListeners.add(fn);
}

/**
 * Ouvre la connexion. Ne rejette jamais : renvoie false si Redis n'est pas
 * configure ou ne repond pas, et ioredis continue de retenter en fond.
 */
export async function connectRedis(url: string | undefined): Promise<boolean> {
  if (client) return client.status === 'ready';
  if (!url) {
    logger.warn('redis_non_configure : REDIS_URL absente, les parties ne seront pas sauvegardees');
    return false;
  }

  const c = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    // A la fermeture, ioredis arme ce minuteur meme sur une socket deja morte :
    // 2 s par defaut retenaient Jest et le shutdown.
    disconnectTimeout: 200,
    // Une commande non confirmee avant une coupure n'est jamais rejouee apres :
    // une vieille copie de partie ne doit pas reecrire par-dessus un DEL.
    autoResendUnfulfilledCommands: false,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    reconnectOnError: (err) => err.message.includes('READONLY'),
  });
  client = c;
  watch(c, 'principal', 'le jeu continue sans copie de secours', () => c === client);
  c.on('ready', () => {
    if (c !== client) return;
    for (const fn of readyListeners) fn();
  });

  try {
    await c.connect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ouvre les clients de publication et d'abonnement de l'adaptateur Socket.IO,
 * copies du client principal (memes options : pas de file d'attente, delais
 * courts, reconnexion en fond). Renvoie null si le client principal n'est pas
 * pret ou si l'un des deux ne se connecte pas : on reste alors en memoire.
 */
export async function connectPubSub(): Promise<{ pub: Redis; sub: Redis } | null> {
  if (pubClient && subClient) return { pub: pubClient, sub: subClient };
  if (!client || client.status !== 'ready') return null;
  const pub = client.duplicate();
  const sub = client.duplicate();
  pubClient = pub;
  subClient = sub;
  const consequence = 'les emissions restent sur ce serveur';
  watch(pub, 'pub', consequence, () => pub === pubClient);
  watch(sub, 'sub', consequence, () => sub === subClient);
  try {
    await Promise.all([pub.connect(), sub.connect()]);
    return { pub, sub };
  } catch {
    pubClient = null;
    subClient = null;
    await Promise.all([closeClient(pub), closeClient(sub)]);
    return null;
  }
}

/** Redis repond-il en ce moment ? (lecture locale, sans commande) */
export function isRedisReady(): boolean {
  return client?.status === 'ready';
}

/** Etat pour /health. Ne bloque jamais plus de HEALTH_TIMEOUT_MS. */
export async function getRedisHealth(): Promise<RedisHealth> {
  if (!client || client.status !== 'ready') return 'absent';
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'absent'>(resolve => {
    timer = setTimeout(() => resolve('absent'), HEALTH_TIMEOUT_MS);
  });
  const ping = client.ping().then(() => 'ok' as const, () => 'absent' as const);
  try {
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function closeClient(c: Redis): Promise<void> {
  if (c.status === 'ready') {
    try {
      await c.quit();
      return;
    } catch {
      // On coupe net ci-dessous.
    }
  }
  // Coupe aussi les tentatives de reconnexion en attente.
  c.disconnect();
}

/** Fermeture propre (shutdown du serveur, fin des tests). Ne rejette jamais. */
export async function closeRedis(): Promise<void> {
  const all = [client, pubClient, subClient].filter((c): c is Redis => c !== null);
  client = null;
  pubClient = null;
  subClient = null;
  if (!all.length) return;
  await Promise.all(all.map(closeClient));
  logger.info('redis_ferme');
}

/**
 * Execute une commande, ou leve RedisUnavailableError si Redis n'est pas pret
 * ou ne repond pas. Une cle absente reste un resultat normal (null, false).
 */
async function run<T>(command: (c: Redis) => Promise<T>): Promise<T> {
  const c = client;
  if (!c || c.status !== 'ready') {
    throw new RedisUnavailableError('Redis indisponible');
  }
  try {
    return await command(c);
  } catch (err) {
    throw new RedisUnavailableError('Commande Redis en echec', err);
  }
}

// Game state storage keys
export const GAME_STATE_PREFIX = 'game:state:';
export const ROOM_PRESENCE_PREFIX = 'room:presence:';
export const USER_PRESENCE_PREFIX = 'user:presence:';

// TTL constants (in seconds)
export const GAME_STATE_TTL = 3600; // 1 hour
export const PRESENCE_TTL = 60; // 1 minute
export const ROOM_TTL = 7200; // 2 hours

/**
 * Ecrit la copie de secours d'une partie (JSON deja serialise, voir
 * services/gameBackup.ts). Toujours avec sa duree de vie : jamais de SET sans EX.
 */
export async function setGameState(roomCode: string, json: string): Promise<void> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  await run(c => c.setex(key, GAME_STATE_TTL, json));
}

/**
 * Relit la copie brute d'une partie (null : pas de copie pour cette salle).
 * La relecture et le controle de version sont dans services/gameBackup.ts.
 */
export async function getGameState(roomCode: string): Promise<string | null> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  return run(c => c.get(key));
}

/**
 * Delete game state from Redis
 */
export async function deleteGameState(roomCode: string): Promise<void> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  await run(c => c.del(key));
}

/** Codes des salles qui ont une copie, par SCAN (jamais KEYS, qui bloque Redis). */
export async function scanGameStateCodes(): Promise<string[]> {
  const codes = new Set<string>();
  let cursor = '0';
  do {
    const [next, keys] = await run(c => c.scan(cursor, 'MATCH', `${GAME_STATE_PREFIX}*`, 'COUNT', 100));
    for (const key of keys) codes.add(key.slice(GAME_STATE_PREFIX.length));
    cursor = next;
  } while (cursor !== '0');
  return Array.from(codes);
}

/**
 * Check if game state exists
 */
export async function hasGameState(roomCode: string): Promise<boolean> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  const exists = await run(c => c.exists(key));
  return exists === 1;
}

/**
 * Store user presence in Redis
 */
export async function setUserPresence(userId: string, presence: any): Promise<void> {
  const key = `${USER_PRESENCE_PREFIX}${userId}`;
  await run(c => c.setex(key, PRESENCE_TTL, JSON.stringify(presence)));
}

/**
 * Get user presence from Redis
 */
export async function getUserPresence(userId: string): Promise<any | null> {
  const key = `${USER_PRESENCE_PREFIX}${userId}`;
  const data = await run(c => c.get(key));
  return data ? JSON.parse(data) : null;
}

/**
 * Delete user presence
 */
export async function deleteUserPresence(userId: string): Promise<void> {
  const key = `${USER_PRESENCE_PREFIX}${userId}`;
  await run(c => c.del(key));
}

/**
 * Extend game state TTL (e.g., when players are active)
 */
export async function extendGameStateTTL(roomCode: string, seconds: number = GAME_STATE_TTL): Promise<void> {
  const key = `${GAME_STATE_PREFIX}${roomCode}`;
  await run(c => c.expire(key, seconds));
}

/**
 * Store temporary data with custom TTL
 */
export async function setTemp(key: string, value: any, ttl: number): Promise<void> {
  await run(c => c.setex(key, ttl, JSON.stringify(value)));
}

/**
 * Get temporary data
 */
export async function getTemp(key: string): Promise<any | null> {
  const data = await run(c => c.get(key));
  return data ? JSON.parse(data) : null;
}
