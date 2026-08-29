import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";

/**
 * Bibliotheque de liens : chaque lien importe (profil ou playlist) devient une
 * carte que le joueur peut activer/desactiver pour choisir "ce qui joue ce soir".
 * Les stats de detail restent volontairement non-spoilantes (pas de titres) ;
 * seules les cartes du PROPRIETAIRE exposent la liste complete, a sa demande.
 */

export async function ensureLinksSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imported_links (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      provider TEXT,
      kind TEXT,
      label TEXT,
      image_url TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      times_played INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_import_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, normalized_url)
    )`);
  await pool.query(`ALTER TABLE audio_sources ADD COLUMN IF NOT EXISTS link_id INTEGER`);
}

export function normalizeLinkUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.search = "";
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * Cree ou rafraichit la carte d'un lien pour cet utilisateur. Reimporter le
 * meme lien ne cree PAS de doublon (contrainte user_id + normalized_url).
 */
export async function upsertLink(params: {
  userId: number;
  url: string;
  provider: string | null;
  kind: string | null;
  label: string | null;
  imageUrl: string | null;
}): Promise<number> {
  await ensureLinksSchema();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO imported_links (user_id, url, normalized_url, provider, kind, label, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, normalized_url)
     DO UPDATE SET
       url = EXCLUDED.url,
       label = COALESCE(EXCLUDED.label, imported_links.label),
       image_url = COALESCE(EXCLUDED.image_url, imported_links.image_url),
       active = TRUE,
       last_import_at = NOW()
     RETURNING id`,
    [params.userId, params.url, normalizeLinkUrl(params.url), params.provider, params.kind, params.label, params.imageUrl]
  );
  return rows[0].id;
}

/**
 * Les titres importes AVANT la bibliotheque n'ont pas de link_id : on les range
 * une fois pour toutes dans une carte "Imports precedents", pour que tout soit
 * activable/desactivable de la meme facon.
 */
export async function claimLegacyTracks(userId: number): Promise<void> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM audio_sources WHERE user_id=$1 AND link_id IS NULL`,
    [userId]
  );
  if (Number(rows[0]?.n ?? 0) === 0) return;
  const legacyId = await upsertLink({
    userId,
    url: `legacy:${userId}`,
    provider: null,
    kind: "legacy",
    label: "Imports précédents",
    imageUrl: null,
  });
  await pool.query(`UPDATE audio_sources SET link_id=$1 WHERE user_id=$2 AND link_id IS NULL`, [legacyId, userId]);
}

/** Ids des liens actifs d'un joueur ; null si le joueur n'a aucune carte (legacy pur). */
export async function activeLinkIds(userId: number): Promise<number[] | null> {
  await ensureLinksSchema();
  const { rows } = await pool.query<{ id: number; active: boolean }>(
    `SELECT id, active FROM imported_links WHERE user_id=$1`,
    [userId]
  );
  if (rows.length === 0) return null; // jamais passe par la bibliotheque : tout son fonds joue
  return rows.filter(r => r.active).map(r => r.id);
}

/** id int4 valide : Number.isInteger laisse passer 99999999999, pg refuse. */
function validLinkId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= 2147483647;
}

export const linksController = {
  /** GET /api/links : mes cartes, avec compte de titres en temps reel. */
  async list(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    try {
      await ensureLinksSchema();
      await claimLegacyTracks(context.user.id);
      const { rows } = await pool.query(
        `SELECT l.id, l.url, l.provider, l.kind, l.label, l.image_url, l.active, l.times_played,
                l.last_import_at,
                (SELECT count(*) FROM audio_sources a WHERE a.link_id = l.id AND a.user_id = l.user_id) AS track_count
         FROM imported_links l
         WHERE l.user_id = $1
         ORDER BY l.last_import_at DESC`,
        [context.user.id]
      );
      ok(res, { links: rows });
    } catch (err) {
      logger.error("links_list_failed", { error: err });
      fail(res, "links_failed", "Impossible de charger ta bibliothèque.", 500);
    }
  },

  /** PATCH /api/links/:id : activer / desactiver une carte. */
  async toggle(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    const id = Number(req.params?.id);
    // Booleen STRICT : Boolean("false") vaut true, un body texte inverserait le sens.
    const active = req.body?.active;
    if (!validLinkId(id) || typeof active !== "boolean") {
      fail(res, "invalid_params", "Paramètres invalides.");
      return;
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE imported_links SET active=$1 WHERE id=$2 AND user_id=$3`,
        [active, id, context.user.id]
      );
      if (!rowCount) {
        fail(res, "not_found", "Lien introuvable.", 404);
        return;
      }
      ok(res, { id, active });
    } catch (err) {
      logger.error("link_toggle_failed", { error: err });
      fail(res, "toggle_failed", "Impossible de modifier ce lien.", 500);
    }
  },

  /** DELETE /api/links/:id : la carte ET mes titres qui en viennent. */
  async remove(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    const id = Number(req.params?.id);
    if (!validLinkId(id)) {
      fail(res, "invalid_id", "Identifiant invalide.");
      return;
    }
    try {
      // DETACHER, jamais detruire : la ligne audio_sources est PARTAGEE par toute
      // la plateforme (likes d'autres joueurs, historique game_rounds). On retire
      // seulement le titre de la bibliotheque de CE joueur.
      await pool.query(`UPDATE audio_sources SET user_id=NULL, link_id=NULL WHERE link_id=$1 AND user_id=$2`, [id, context.user.id]);
      const { rowCount } = await pool.query(`DELETE FROM imported_links WHERE id=$1 AND user_id=$2`, [id, context.user.id]);
      if (!rowCount) {
        fail(res, "not_found", "Lien introuvable.", 404);
        return;
      }
      ok(res, { deleted: id });
    } catch (err) {
      logger.error("link_delete_failed", { error: err });
      fail(res, "delete_failed", "Suppression impossible.", 500);
    }
  },

  /**
   * GET /api/links/:id/details : stats non-spoilantes + (proprietaire) les titres.
   * L'endpoint n'est accessible QUE sur ses propres liens : les autres joueurs
   * ne voient jamais le contenu, seulement le resume du lobby.
   */
  async details(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    const id = Number(req.params?.id);
    if (!validLinkId(id)) {
      fail(res, "invalid_id", "Identifiant invalide.");
      return;
    }
    try {
      const { rows: linkRows } = await pool.query(
        `SELECT id, label, provider, kind FROM imported_links WHERE id=$1 AND user_id=$2 LIMIT 1`,
        [id, context.user.id]
      );
      if (!linkRows.length) {
        fail(res, "not_found", "Lien introuvable.", 404);
        return;
      }
      const { rows: stats } = await pool.query(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE audio_url IS NOT NULL AND audio_url <> '') AS playable,
                count(DISTINCT artist) AS artists
         FROM audio_sources WHERE link_id=$1 AND user_id=$2`,
        [id, context.user.id]
      );
      const { rows: decades } = await pool.query(
        `SELECT (substring(metadata->>'release_date' FROM '^\\d{4}')::int / 10) * 10 AS decade, count(*) AS n
         FROM audio_sources
         WHERE link_id=$1 AND user_id=$2 AND metadata->>'release_date' ~ '^\\d{4}'
         GROUP BY 1 ORDER BY 1`,
        [id, context.user.id]
      );
      const { rows: covers } = await pool.query(
        `SELECT album_cover FROM audio_sources
         WHERE link_id=$1 AND user_id=$2 AND album_cover IS NOT NULL
         ORDER BY random() LIMIT 12`,
        [id, context.user.id]
      );
      const { rows: tracks } = await pool.query(
        `SELECT title, artist FROM audio_sources WHERE link_id=$1 AND user_id=$2 ORDER BY title LIMIT 500`,
        [id, context.user.id]
      );
      ok(res, {
        link: linkRows[0],
        stats: stats[0],
        decades,
        covers: covers.map(c => c.album_cover),
        tracks,
      });
    } catch (err) {
      logger.error("link_details_failed", { error: err });
      fail(res, "details_failed", "Impossible de charger le détail.", 500);
    }
  },
};
