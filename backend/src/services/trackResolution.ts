import { pool } from "../config/db";
import type { AudioSourceRow } from "../types/audio";
import type { MusicProvider } from "../types/user";
import { deezerPreviewService, type PreviewQuery } from "./deezerPreviewService";
import { isIsrc } from "./previewMatch";
import { logger } from "../utils/logger";
import { isExpiredPreview } from "../utils/previewExpiry";

// ---------------------------------------------------------------------------
// Preview hydration — resolves audio URLs via Deezer search
// ---------------------------------------------------------------------------

/**
 * Hydrate a single audio source's preview URL using Deezer.
 * Updates the database if a preview is found. Returns the URL or null.
 */
// isExpiredPreview vit dans utils/previewExpiry (le cache Deezer s'en sert aussi).
export { isExpiredPreview };

/**
 * Ce qu'on sait d'un morceau stocke pour retrouver SON extrait : l'identifiant
 * Deezer (morceau Deezer), l'ISRC (morceau Spotify importe depuis le 07/10/2026),
 * sinon titre + artiste + duree.
 */
export function previewQueryFor(
  source: Pick<AudioSourceRow, "provider" | "external_id" | "title" | "artist" | "duration_ms" | "metadata">
): PreviewQuery {
  const isrc = source.metadata?.isrc;
  return {
    title: source.title?.trim() ?? "",
    artist: source.artist?.trim() || undefined,
    durationMs: source.duration_ms ?? null,
    isrc: isIsrc(isrc) ? isrc : null,
    deezerId: source.provider === "deezer" && /^\d+$/.test(source.external_id ?? "") ? source.external_id : null,
  };
}

export async function hydratePreviewUrl(source: AudioSourceRow): Promise<string | null> {
  const cached = source.audio_url;
  // URL en cache encore valide -> on la garde.
  if (cached && !isExpiredPreview(cached)) return cached;

  const query = previewQueryFor(source);
  const { title } = query;
  if (title) {
    try {
      const outcome = await deezerPreviewService.resolvePreviewOutcome(query);
      if (outcome.status === "error") {
        // Deezer en erreur (quota, panne) : on ne conclut rien, la base reste
        // telle quelle. Le morceau n'est pas jouable cette fois-ci.
        return null;
      }
      const preview = outcome.status === "found" ? outcome.track.preview : null;
      if (preview) {
        await pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [preview, source.id]);
        return preview;
      }
    } catch (err) {
      logger.error("deezer_hydrate_failed", { id: source.id, title, error: err });
      return null; // erreur : ne rien ecrire
    }
  }

  // Introuvable chez Deezer : une URL en cache EXPIREE est inutilisable -> on l'annule.
  if (cached && isExpiredPreview(cached)) {
    await pool.query("UPDATE audio_sources SET audio_url=NULL WHERE id=$1", [source.id]).catch(() => {});
    return null;
  }
  return cached ?? null;
}

// ---------------------------------------------------------------------------
// Fetch audio sources from database
// ---------------------------------------------------------------------------

export type ProviderFilter = MusicProvider | "any";

export async function fetchAudioSources(
  userIds: number | number[],
  provider: ProviderFilter,
  count: number,
  opts: { likedOnly?: boolean; playlistId?: string; timeRange?: string; ownedOnly?: boolean; linkIds?: number[] } = {}
): Promise<AudioSourceRow[]> {
  const extraConds: string[] = [];
  const params: unknown[] = [];
  const userList = Array.isArray(userIds) ? userIds : [userIds];

  params.push(userList);
  // ownedOnly : uniquement les titres reellement possedes par ces joueurs (pas le pool
  // global a user_id NULL). Sert a garantir une attribution "qui a ajoute" fiable.
  const userCond = opts.likedOnly
    ? `l.user_id = ANY($1)`
    : opts.ownedOnly
      ? `s.user_id = ANY($1)`
      : `(s.user_id = ANY($1) OR s.user_id IS NULL)`;
  let providerCond = "";
  if (provider !== "any") {
    params.push(provider);
    providerCond = opts.likedOnly ? `AND s.provider = $2` : `AND provider = $2`;
  }

  if (opts.playlistId) {
    params.push(opts.playlistId);
    extraConds.push(`metadata->>'playlist_id' = $${params.length}`);
  }
  if (opts.timeRange) {
    params.push(opts.timeRange);
    extraConds.push(`metadata->>'time_range' = $${params.length}`);
  }
  // Bibliotheque de liens : ne jouer QUE les titres des cartes cochees.
  if (opts.linkIds) {
    params.push(opts.linkIds);
    extraConds.push(`link_id = ANY($${params.length}::int[])`);
  }

  const extraClause = extraConds.length ? `AND ${extraConds.join(" AND ")}` : "";

  if (opts.likedOnly) {
    params.push(count);
    const limitIndex = params.length;
    const { rows } = await pool.query<AudioSourceRow>(
      `SELECT s.id, s.user_id AS user_id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata, s.link_id
       FROM audio_sources s
       INNER JOIN likes l ON l.audio_source_id = s.id
       WHERE ${userCond} ${providerCond} ${extraClause}
       ORDER BY RANDOM()
       LIMIT $${limitIndex}`,
      params
    );
    return rows;
  }

  params.push(count);
  const limitIndex = params.length;
  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT s.id, s.user_id AS user_id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata, s.link_id
     FROM audio_sources s
     WHERE ${userCond} ${providerCond} ${extraClause}
     ORDER BY RANDOM()
     LIMIT $${limitIndex}`,
    params
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Collect playable sources — hydrate + filter + deduplicate
// ---------------------------------------------------------------------------

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const HYDRATE_CONCURRENCY = 6;

export async function collectPlayableSources(
  userIds: number | number[],
  desiredCount: number,
  opts: { likedOnly?: boolean; playlistId?: string; timeRange?: string; provider?: ProviderFilter; ownedOnly?: boolean; linkIds?: number[] }
): Promise<AudioSourceRow[]> {
  // Sur-fetch reduit (4x) : moins de recherches Deezer en parallele au lancement
  // (les previews expirent et doivent etre re-cherchees) tout en gardant une marge.
  const candidateLimit = Math.min(desiredCount * 4, 200);
  const providerFilter = opts.provider ?? "any";
  const candidates = await fetchAudioSources(userIds, providerFilter, candidateLimit, {
    likedOnly: opts.likedOnly,
    playlistId: opts.playlistId,
    timeRange: opts.timeRange,
    ownedOnly: opts.ownedOnly,
    linkIds: opts.linkIds,
  });

  // Hydrate / rafraichit les previews via Deezer (re-fetch si manquante OU expiree),
  // par tranches de 6, et on s'arrete des qu'il y a assez de morceaux jouables :
  // inutile de chercher les 4 x N candidats (les candidats sont deja tires au hasard).
  const unique = new Map<string, AudioSourceRow>();
  for (let i = 0; i < candidates.length && unique.size < desiredCount; i += HYDRATE_CONCURRENCY) {
    const slice = candidates.slice(i, i + HYDRATE_CONCURRENCY);
    await Promise.all(slice.map(async (source) => {
      source.audio_url = await hydratePreviewUrl(source);
    }));
    for (const source of slice) {
      if (!source.audio_url) continue;
      const key = source.external_id ?? String(source.id);
      if (unique.has(key)) continue;
      unique.set(key, source);
      if (unique.size >= desiredCount) break;
    }
  }
  return shuffle(Array.from(unique.values()));
}

// ---------------------------------------------------------------------------
// Fetch random global sources (fallback pool)
// ---------------------------------------------------------------------------

export async function fetchGlobalRandomSources(count: number): Promise<AudioSourceRow[]> {
  if (count <= 0) return [];
  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT s.id,
            s.user_id AS user_id,
            s.provider,
            s.external_id,
            s.title,
            s.artist,
            s.album_cover,
            s.audio_url,
            s.duration_ms,
            s.metadata
     FROM audio_sources s
     ORDER BY RANDOM()
     LIMIT $1`,
    [count * 2]
  );
  return rows;
}
