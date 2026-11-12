import crypto from "crypto";
import type { Request, Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedUser, UserSessionToken } from "../types/user";
import { fail } from "./response";

// T15 (10/2026) : plus de connexion de fournisseur dans la session. La
// connexion au compte Spotify (OAuth utilisateur) est retiree ; la musique vient
// de l'import par lien colle, avec le jeton client de l'appli.
export interface SessionOptions {
  autoExtend?: boolean;
  ttlMs?: number;
}

export interface SessionContext {
  user: AuthenticatedUser;
  sessionToken: string | null;
}

type SessionData = NonNullable<Request["session"]>;

const DEFAULT_SESSION_TTL = 1000 * 60 * 60 * 24; // 24h

// Session longue, glissante : invite comme compte. Un joueur qui revient des
// jours plus tard, dans le meme navigateur, doit retrouver son pseudo, sa
// musique et ses parties (T26). Chaque passage repousse l'echeance d'un an.
export const LONG_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365;

// Cookie httpOnly qui porte le jeton de session brut (pose par authController).
// Le cookie de cookie-session (blindify_session) ne dure que 24 h et n'est
// jamais renouvele tant que son contenu ne change pas : seul, il faisait
// oublier tout invite au bout d'un jour.
export const SESSION_TOKEN_COOKIE = "blindify_session_token";

export function parseCookieHeader(header: string | string[] | undefined): Record<string, string> {
  if (!header) return {};
  const raw = Array.isArray(header) ? header.join(";") : header;
  return raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    const value = rest.join("=");
    try {
      acc[key] = decodeURIComponent(value || "");
    } catch {
      acc[key] = value || "";
    }
    return acc;
  }, {});
}

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

// Repousse l'echeance, sans jamais la raccourcir. Avant T26, chaque appel a
// /api/auth/me ramenait une session invite d'un an a 24 h : vu en prod le
// 05/11, toutes les sessions expiraient un jour apres le dernier passage.
export async function extendSessionToken(token: string, ttlMs = DEFAULT_SESSION_TTL): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    `UPDATE user_sessions SET expires_at=GREATEST(expires_at, $2) WHERE token=$1`,
    [hashToken(token), expiresAt]
  );
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

  if (options.autoExtend !== false) {
    await extendSessionToken(token, ttlMs);
  }

  return {
    user,
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
    const bearer = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (bearer) {
      const sessionRow = await querySessionByToken(bearer);
      if (!sessionRow) {
        if (res) fail(res, "unauthorized", "Session expirée ou invalide", 401);
        return null;
      }
      if (sessionRow.expires_at && new Date(sessionRow.expires_at) <= new Date()) {
        await revokeSessionToken(bearer);
        if (res) fail(res, "unauthorized", "Session expirée", 401);
        return null;
      }
      userId = sessionRow.user_id;
      // On conserve le token BRUT cote session, pas le hash renvoye par la
      // base, car extendSessionToken re-hache en interne.
      sessionToken = bearer;
      session.userId = userId;
      session.sessionToken = bearer;
    } else {
      // Sans Bearer, le cookie longue duree prend le relais du cookie de 24 h.
      // Un jeton de cookie perime ou inconnu n'est pas une erreur : le joueur
      // est simplement « personne » et le front lui recree un invite.
      const fromCookie = parseCookieHeader(req.headers.cookie)[SESSION_TOKEN_COOKIE] ?? "";
      const sessionRow = fromCookie ? await querySessionByToken(fromCookie) : null;
      if (sessionRow && (!sessionRow.expires_at || new Date(sessionRow.expires_at) > new Date())) {
        userId = sessionRow.user_id;
        sessionToken = fromCookie;
        session.userId = userId;
        session.sessionToken = fromCookie;
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

  if (sessionToken && options.autoExtend !== false) {
    await extendSessionToken(sessionToken, ttlMs);
  }

  return {
    user,
    sessionToken,
  };
}

export function clearSession(req: Request): void {
  req.session = null;
}
