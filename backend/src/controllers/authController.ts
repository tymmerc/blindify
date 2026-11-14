import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedUser } from "../types/user";
import {
  LONG_SESSION_TTL_MS,
  SESSION_TOKEN_COOKIE,
  clearSession,
  createSessionToken,
  getSessionContext,
  revokeSessionToken,
} from "../utils/session";
import { absorbGuest } from "../services/guestTakeover";
import { fail, ok } from "../utils/response";
import { logger } from "../utils/logger";

const BCRYPT_ROUNDS = 10;
// Session longue duree, invite comme compte : l'app "se souvient" du joueur.
// Glissante depuis T26 (chaque passage repousse d'un an, voir session.ts).
const GUEST_SESSION_TTL_MS = LONG_SESSION_TTL_MS;

function frontendBaseUrl(): string {
  const raw = process.env.FRONTEND_URL || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

function sessionCookieOptions() {
  const frontend = frontendBaseUrl();
  const isHttps = frontend.startsWith("https://");
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : isProd && isHttps,
    sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
    domain: process.env.COOKIE_DOMAIN || (isProd ? "tymmerc.eu" : undefined),
    path: "/",
  };
}

function setSessionCookie(res: Response, token: string, maxAgeMs = LONG_SESSION_TTL_MS): void {
  res.cookie(SESSION_TOKEN_COOKIE, token, { ...sessionCookieOptions(), maxAge: maxAgeMs });
}

// Un cookie pose avec un domaine ne s'efface qu'avec ce meme domaine : avant
// T26, clearCookie sans domaine laissait le cookie en place en prod.
function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_TOKEN_COOKIE, sessionCookieOptions());
}

// L'invite de la session en cours, s'il y en a un. Sert de preuve : seul ce
// navigateur detient sa session.
async function currentGuestId(req: Request): Promise<number | null> {
  const context = await getSessionContext(req, undefined, { autoExtend: false });
  return context && context.user.provider === "guest" ? context.user.id : null;
}

async function startSession(req: Request, res: Response, userId: number): Promise<string> {
  const session = await createSessionToken(userId, LONG_SESSION_TTL_MS);
  if (!req.session) req.session = {};
  req.session.userId = userId;
  req.session.sessionToken = session.token;
  setSessionCookie(res, session.token);
  return session.token;
}

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body ?? {};

      if (!username || typeof username !== "string" || username.trim().length < 2) {
        fail(res, "invalid_username", "Le pseudo doit contenir au moins 2 caractères", 400);
        return;
      }
      if (!password || typeof password !== "string" || password.length < 8) {
        fail(res, "invalid_password", "Le mot de passe doit contenir au moins 8 caractères", 400);
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

      // T26 : un invite qui cree son compte GARDE tout. On transforme sa
      // ligne au lieu d'en creer une neuve : meme id, donc parties, scores,
      // badges et musique restent a lui sans rien recopier.
      const guestId = await currentGuestId(req);
      const { rows } = guestId
        ? await pool.query<AuthenticatedUser>(
            `UPDATE users SET provider='local', username=$2, password_hash=$3
             WHERE id=$1 AND provider='guest'
             RETURNING id, provider, provider_id, username, email, avatar, created_at`,
            [guestId, cleanUsername, passwordHash]
          )
        : await pool.query<AuthenticatedUser>(
            `INSERT INTO users (provider, provider_id, username, email, avatar, password_hash)
             VALUES ('local', $1, $2, NULL, NULL, $3)
             RETURNING id, provider, provider_id, username, email, avatar, created_at`,
            [crypto.randomUUID(), cleanUsername, passwordHash]
          );
      const user = rows[0];
      if (!user) {
        fail(res, "register_failed", "Impossible de créer le compte", 500);
        return;
      }

      const sessionToken = await startSession(req, res, user.id);
      ok(res, { user, sessionToken, keptGuest: Boolean(guestId) });
    } catch (error) {
      logger.error("register_failed", { error });
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

      // T26 : connexion depuis un navigateur ou l'on jouait en invite. Le
      // compte reprend ce qu'a fait cet invite-la (et lui seul).
      const guestId = await currentGuestId(req);
      if (guestId && guestId !== user.id) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await absorbGuest(client, guestId, user.id);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          // La connexion passe quand meme : l'invite reste intact, rien n'est perdu.
          logger.error("guest_takeover_failed", { error, guestId, userId: user.id });
        } finally {
          client.release();
        }
      }

      const sessionToken = await startSession(req, res, user.id);

      // Don't return password_hash
      const { password_hash: _, ...safeUser } = user;
      ok(res, { user: safeUser, sessionToken });
    } catch (error) {
      logger.error("login_failed", { error });
      fail(res, "login_failed", "Impossible de se connecter", 500);
    }
  },

  async guest(req: Request, res: Response): Promise<void> {
    try {
      // Pseudo obligatoire cote interface, mais on ne REFUSE pas ici : bloquer
      // la creation de session casserait l'entree en pleine soiree si un
      // parcours oublie de le passer. On garantit seulement qu'un nom vide ou
      // trop court devient un identifiant UNIQUE, jamais un homonyme. Avant,
      // le client envoyait "Joueur" et la base a accumule 97 comptes portant
      // ce meme nom, impossibles a distinguer.
      const brut = typeof req.body?.nickname === "string" ? req.body.nickname.trim() : "";
      const providerId = crypto.randomUUID();
      const nickname = brut.length >= 2 ? brut.slice(0, 40) : null;

      const { rows } = await pool.query<AuthenticatedUser>(
        `INSERT INTO users (provider, provider_id, username, email, avatar)
         VALUES ('guest', $1, $2, NULL, NULL)
         RETURNING id, provider, provider_id, username, email, avatar, created_at`,
        [providerId, nickname ?? `Guest-${providerId.slice(0, 6)}`]
      );
      const user = rows[0];

      // Identite persistante sans compte : l'invite garde son pseudo, son lien et
      // son historique quand il revient (avant : 4h, l'historique disparaissait).
      const guestTtlMs = GUEST_SESSION_TTL_MS;
      const session = await createSessionToken(user.id, guestTtlMs);
      if (!req.session) req.session = {};
      req.session.userId = user.id;
      req.session.sessionToken = session.token;

      setSessionCookie(res, session.token, guestTtlMs);
      ok(res, { sessionToken: session.token, user });
    } catch (error) {
      logger.error("guest_auth_failed", { error });
      fail(res, "guest_auth_failed", "Impossible de créer un invité", 500);
    }
  },

  async me(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res, { autoExtend: true, ttlMs: LONG_SESSION_TTL_MS });
    if (!context) return;
    // Le cookie suit l'echeance glissante de la session (un an apres ce passage).
    if (context.sessionToken) setSessionCookie(res, context.sessionToken);
    ok(res, { user: context.user });
  },

  async deleteAccount(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return; // getSessionContext a déjà répondu 401

    const userId = context.user.id;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Morceaux : on retire les liens de ce joueur (user_audio_sources), puis
      // les morceaux que personne d'autre n'a importes (RGPD, pas d'orphelines).
      // Un morceau encore lie a un autre joueur reste : c'est sa bibliotheque.
      // used_tracks référence audio_sources en ON DELETE CASCADE : on le vide
      // d'abord pour rester explicite.
      const { rows: unlinked } = await client.query<{ audio_source_id: string }>(
        `DELETE FROM user_audio_sources WHERE user_id=$1 RETURNING audio_source_id`,
        [userId]
      );
      const onlyMine = `(a.user_id=$1 OR a.id = ANY($2::uuid[]))
         AND NOT EXISTS (SELECT 1 FROM user_audio_sources ua WHERE ua.audio_source_id = a.id)`;
      const mine = [userId, unlinked.map(r => r.audio_source_id)];
      await client.query(
        `DELETE FROM used_tracks WHERE audio_source_id IN (SELECT a.id FROM audio_sources a WHERE ${onlyMine})`,
        mine
      );
      await client.query(`DELETE FROM audio_sources a WHERE ${onlyMine}`, mine);

      // Les tables suivantes ont une FK ON DELETE CASCADE vers users : supprimer
      // la ligne users suffirait, mais on efface explicitement pour l'audit RGPD.
      await client.query(`DELETE FROM game_participants WHERE user_id=$1`, [userId]);
      await client.query(`DELETE FROM round_responses WHERE user_id=$1`, [userId]);
      await client.query(`DELETE FROM room_participants WHERE user_id=$1`, [userId]);
      await client.query(`DELETE FROM user_connections WHERE user_id=$1`, [userId]);
      await client.query(`DELETE FROM user_photos WHERE user_id=$1`, [userId]);
      await client.query(`DELETE FROM user_sessions WHERE user_id=$1`, [userId]);
      await client.query(`DELETE FROM users WHERE id=$1`, [userId]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("delete_account_failed", { error, userId });
      fail(res, "delete_account_failed", "Impossible de supprimer le compte", 500);
      return;
    } finally {
      client.release();
    }

    // Compte supprimé : on invalide la session côté serveur et le cookie client.
    clearSession(req);
    clearSessionCookie(res);
    ok(res, { deleted: true });
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
      clearSessionCookie(res);
      ok(res, { success: true });
    } catch (error) {
      logger.error("logout_failed", { error });
      fail(res, "logout_failed", "Impossible de se déconnecter", 500);
    }
  },
};
