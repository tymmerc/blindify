import crypto from "crypto";
import type { Request, Response } from "express";
import { pool } from "../config/db";
import type {
  AuthenticatedUser,
  MusicProvider,
  UserConnection,
  UserSessionToken,
} from "../types/user";
import { fail } from "./response";

export interface SessionOptions {
  provider?: MusicProvider;
  requireConnection?: boolean;
  autoExtend?: boolean;
  ttlMs?: number;
}

export interface SessionContext {
  user: AuthenticatedUser;
  connection: UserConnection | null;
  sessionToken: string | null;
}

type SessionData = NonNullable<Request["session"]>;

const DEFAULT_SESSION_TTL = 1000 * 60 * 60 * 24; // 24h

// Hache un token de session en SHA-256 hex.
// On stocke ce hash en base (jamais le token brut) : une fuite de la table
// user_sessions ne donne donc pas de sessions valides. Le token brut ne vit
// que cote client. Toute lecture/ecriture par token doit passer par ce helper.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function ensureSessionObject(req: Request): SessionData {
  if (!req.session) {
    req.session = {};
  }
  return req.session as SessionData;
}

async function queryUserById(id: number): Promise<AuthenticatedUser | null> {
  const { rows } = await pool.query<AuthenticatedUser>(
    `SELECT id, provider, provider_id, username, email, avatar, created_at
     FROM users
     WHERE id=$1
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

async function querySessionByToken(token: string): Promise<UserSessionToken | null> {
  // On interroge sur le hash du token entrant, pas sur le token brut.
  const { rows } = await pool.query<UserSessionToken>(
    `SELECT token, user_id, created_at, expires_at
     FROM user_sessions
     WHERE token=$1
     LIMIT 1`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

async function queryConnection(userId: number, provider?: MusicProvider): Promise<UserConnection | null> {
  if (!provider) {
    const { rows } = await pool.query<UserConnection>(
      `SELECT id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at
       FROM user_connections
       WHERE user_id=$1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  const { rows } = await pool.query<UserConnection>(
    `SELECT id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at
     FROM user_connections
     WHERE user_id=$1 AND provider=$2
     LIMIT 1`,
    [userId, provider]
  );
  return rows[0] ?? null;
}

export async function createSessionToken(userId: number, ttlMs = DEFAULT_SESSION_TTL): Promise<UserSessionToken> {
  // Token brut renvoye au client, hash stocke en base.
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);

  const { rows } = await pool.query<UserSessionToken>(
    `INSERT INTO user_sessions (token, user_id, expires_at)
     VALUES ($1, $2, $3)
     RETURNING token, user_id, created_at, expires_at`,
    [hashToken(token), userId, expiresAt]
  );

  // On renvoie toujours le token BRUT a l'appelant (RETURNING renvoie le hash).
  return { ...rows[0], token };
}

export async function extendSessionToken(token: string, ttlMs = DEFAULT_SESSION_TTL): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(`UPDATE user_sessions SET expires_at=$2 WHERE token=$1`, [hashToken(token), expiresAt]);
}

export async function revokeSessionToken(token: string): Promise<void> {
  await pool.query(`DELETE FROM user_sessions WHERE token=$1`, [hashToken(token)]);
}

export async function getSessionContextFromToken(
  token: string,
  options: SessionOptions = {}
): Promise<SessionContext | null> {
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL;
  const sessionRow = await querySessionByToken(token);
  if (!sessionRow) {
    return null;
  }
  if (sessionRow.expires_at && new Date(sessionRow.expires_at) <= new Date()) {
    await revokeSessionToken(token);
    return null;
  }

  const user = await queryUserById(sessionRow.user_id);
  if (!user) {
    return null;
  }

  const desiredProvider: MusicProvider | undefined =
    options.provider ?? (user.provider as MusicProvider | undefined);
  const connection = await queryConnection(user.id, desiredProvider);

  if (options.requireConnection && !connection) {
    return null;
  }

  if (options.autoExtend !== false) {
    await extendSessionToken(token, ttlMs);
  }

  return {
    user,
    connection,
    sessionToken: token,
  };
}

export async function getSessionContext(
  req: Request,
  res?: Response,
  options: SessionOptions = {}
): Promise<SessionContext | null> {
  const session = ensureSessionObject(req);
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL;

  let sessionToken: string | null = null;
  let userId = typeof session.userId === "number" ? session.userId : null;

  if (!userId) {
    const authHeader = req.headers.authorization?.trim();
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const candidate = authHeader.slice(7);
      if (candidate) {
        const sessionRow = await querySessionByToken(candidate);
        if (!sessionRow) {
          if (res) fail(res, "unauthorized", "Session expirée ou invalide", 401);
          return null;
        }
        if (sessionRow.expires_at && new Date(sessionRow.expires_at) <= new Date()) {
          await revokeSessionToken(candidate);
          if (res) fail(res, "unauthorized", "Session expirée", 401);
          return null;
        }
        userId = sessionRow.user_id;
        // On conserve le token BRUT (candidate) cote session, pas le hash
        // renvoye par la base, car extendSessionToken re-hache en interne.
        sessionToken = candidate;
        session.userId = userId;
        session.sessionToken = candidate;
      }
    }
  } else if (typeof session.sessionToken === "string") {
    sessionToken = session.sessionToken;
  }

  if (!userId) {
    if (res) fail(res, "unauthorized", "Authentification requise", 401);
    return null;
  }

  const user = await queryUserById(userId);
  if (!user) {
    req.session = null;
    if (res) fail(res, "unauthorized", "Utilisateur introuvable", 401);
    return null;
  }

  session.userId = user.id;

  const desiredProvider: MusicProvider | undefined =
    options.provider ?? (user.provider as MusicProvider | undefined);

  const connection = await queryConnection(user.id, desiredProvider);
  if (options.requireConnection && !connection) {
    if (res) fail(res, "provider_required", "Aucune connexion active pour ce fournisseur", 403);
    return null;
  }

  if (sessionToken && options.autoExtend !== false) {
    await extendSessionToken(sessionToken, ttlMs);
  }

  return {
    user,
    connection,
    sessionToken,
  };
}

export function clearSession(req: Request): void {
  req.session = null;
}
