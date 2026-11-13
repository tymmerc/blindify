/**
 * Extraits des manches a venir (T35). Les liens Deezer expirent ~15 min apres
 * leur creation, les manches sont preparees au lancement : sans rafraichir,
 * les dernieres manches d'une longue partie partaient sur un lien mort (403)
 * et restaient muettes. On redemande un lien juste avant qu'il serve.
 */
import { pool } from "../config/db";
import type { AudioSourceRow } from "../types/audio";
import { logger } from "../utils/logger";
import { isExpiredPreview, PREVIEW_MIN_VALIDITY_MS } from "../utils/previewExpiry";
import { hydratePreviewOutcome } from "./trackResolution";

/**
 * Manches verifiees apres la courante. Une manche dure au plus ~72 s (60 s
 * de chrono, 10 s de reveal, pre-roll) : 2 manches d'avance tiennent bien
 * dans la marge de 5 min.
 */
export const PREVIEW_LOOKAHEAD_ROUNDS = 2;

/** Le lien mourra avant d'avoir servi (moins de 5 min de validite). */
export function previewNeedsRefresh(url: string | null | undefined): boolean {
  return isExpiredPreview(url, PREVIEW_MIN_VALIDITY_MS);
}

const inFlight = new Map<string, Promise<string | null>>();
// audio_sources.id est un uuid (le jeu le recoit en chaine).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un lien frais pour ce morceau (relu en base, puis Deezer si besoin), ou
 * null si on n'en trouve pas (Deezer en erreur, morceau retire). Une seule
 * recherche par morceau a la fois : 8 joueurs qui redemandent la meme manche
 * coutent un appel. Ne rejette jamais.
 */
export function freshPreview(audioSourceId: string | number | null | undefined): Promise<string | null> {
  const id = String(audioSourceId ?? "").toLowerCase();
  if (!UUID.test(id)) return Promise.resolve(null);
  const pending = inFlight.get(id);
  if (pending) return pending;
  const run = (async () => {
    const { rows } = await pool.query<AudioSourceRow>(
      `SELECT id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata
       FROM audio_sources WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return null;
    const { url } = await hydratePreviewOutcome(rows[0], undefined, PREVIEW_MIN_VALIDITY_MS);
    return url && !isExpiredPreview(url) ? url : null;
  })()
    .catch(err => {
      logger.error("preview_refresh_failed", { audioSourceId: id, error: err });
      return null;
    })
    .finally(() => inFlight.delete(id));
  inFlight.set(id, run);
  return run;
}
