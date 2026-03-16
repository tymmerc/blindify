import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedUser } from "../types/user";
import {
  clearSession,
  createSessionToken,
  getSessionContext,
  revokeSessionToken,
} from "../utils/session";
import { fail, ok } from "../utils/response";

const BCRYPT_ROUNDS = 10;

function frontendBaseUrl(): string {
  const raw = process.env.FRONTEND_URL || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

function setSessionCookie(res: Response, token: string, maxAgeMs = 1000 * 60 * 60 * 24): void {
  const frontend = frontendBaseUrl();
  const isHttps = frontend.startsWith("https://");
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("blindify_session_token", token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : isProd && isHttps,
    sameSite: isHttps ? "none" : "lax",
    domain: process.env.COOKIE_DOMAIN || (isProd ? "tymmerc.eu" : undefined),
    path: "/",
    maxAge: maxAgeMs,
  });
}

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body ?? {};

      if (!username || typeof username !== "string" || username.trim().length < 2) {
        fail(res, "invalid_username", "Le pseudo doit contenir au moins 2 caractères", 400);
        return;
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        fail(res, "invalid_password", "Le mot de passe doit contenir au moins 6 caractères", 400);
        return;
      }

      const cleanUsername = username.trim().slice(0, 120);

      // Check if username already taken
      const existing = await pool.query(
        `SELECT id FROM users WHERE provider='local' AND LOWER(username)=LOWER($1) LIMIT 1`,
        [cleanUsername]
      );
      if (existing.rows.length > 0) {
        fail(res, "username_taken", "Ce pseudo est déjà utilisé", 409);
        return;
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const providerId = crypto.randomUUID();

      const { rows } = await pool.query<AuthenticatedUser>(
        `INSERT INTO users (provider, provider_id, username, email, avatar, password_hash)
         VALUES ('local', $1, $2, NULL, NULL, $3)
         RETURNING id, provider, provider_id, username, email, avatar, created_at`,
        [providerId, cleanUsername, passwordHash]
      );
      const user = rows[0];

      const session = await createSessionToken(user.id);
      if (!req.session) req.session = {};
      req.session.userId = user.id;
      req.session.sessionToken = session.token;

      setSessionCookie(res, session.token, 1000 * 60 * 60 * 24);
      ok(res, { user, sessionToken: session.token });
    } catch (error) {
      console.error("register_failed", error);
      fail(res, "register_failed", "Impossible de créer le compte", 500);
    }
  },

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body ?? {};

      if (!username || !password) {
        fail(res, "missing_credentials", "Pseudo et mot de passe requis", 400);
        return;
      }

      const { rows } = await pool.query<AuthenticatedUser & { password_hash: string | null }>(
        `SELECT id, provider, provider_id, username, email, avatar, created_at, password_hash
         FROM users
         WHERE provider='local' AND LOWER(username)=LOWER($1)
         LIMIT 1`,
        [username.trim()]
      );

      const user = rows[0];
      const hash = user?.password_hash;
      if (!user || !hash) {
        fail(res, "invalid_credentials", "Pseudo ou mot de passe incorrect", 401);
        return;
      }

      const valid = await bcrypt.compare(password, hash);
      if (!valid) {
        fail(res, "invalid_credentials", "Pseudo ou mot de passe incorrect", 401);
        return;
      }

      const session = await createSessionToken(user.id);
      if (!req.session) req.session = {};
      req.session.userId = user.id;
      req.session.sessionToken = session.token;

      setSessionCookie(res, session.token, 1000 * 60 * 60 * 24);

      // Don't return password_hash
      const { password_hash: _, ...safeUser } = user;
      ok(res, { user: safeUser, sessionToken: session.token });
    } catch (error) {
      console.error("login_failed", error);
      fail(res, "login_failed", "Impossible de se connecter", 500);
    }
  },

  async guest(req: Request, res: Response): Promise<void> {
    try {
      const nickname = typeof req.body?.nickname === "string" ? req.body.nickname : null;
      const providerId = crypto.randomUUID();

      const { rows } = await pool.query<AuthenticatedUser>(
        `INSERT INTO users (provider, provider_id, username, email, avatar)
         VALUES ('guest', $1, $2, NULL, NULL)
         RETURNING id, provider, provider_id, username, email, avatar, created_at`,
        [providerId, nickname ?? `Guest-${providerId.slice(0, 6)}`]
      );
      const user = rows[0];

      const guestTtlMs = 1000 * 60 * 60 * 4; // 4h guest session
      const session = await createSessionToken(user.id, guestTtlMs);
      if (!req.session) req.session = {};
      req.session.userId = user.id;
      req.session.sessionToken = session.token;

      setSessionCookie(res, session.token, guestTtlMs);
      ok(res, { sessionToken: session.token, user });
    } catch (error) {
      console.error("guest_auth_failed", error);
      fail(res, "guest_auth_failed", "Impossible de créer un invité", 500);
    }
  },

  async me(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res, { autoExtend: true });
    if (!context) return;
    ok(res, {
      user: context.user,
      providerConnection: context.connection,
    });
  },

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        if (token) await revokeSessionToken(token);
      }
      if (req.session && typeof req.session.sessionToken === "string") {
        await revokeSessionToken(req.session.sessionToken);
      }
      clearSession(req);
      res.clearCookie("blindify_session_token", { path: "/" });
      ok(res, { success: true });
    } catch (error) {
      console.error("logout_failed", error);
      fail(res, "logout_failed", "Impossible de se déconnecter", 500);
    }
  },
};
