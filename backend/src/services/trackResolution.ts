import { pool } from "../config/db";
import type { AudioSourceRow } from "../types/audio";
import type { MusicProvider } from "../types/user";
import { deezerPreviewService } from "./deezerPreviewService";
import { logger } from "../utils/logger";
import { mapLimit } from "../utils/concurrency";

// ---------------------------------------------------------------------------
// Preview hydration — resolves audio URLs via Deezer search
// ---------------------------------------------------------------------------

/**
 * Hydrate a single audio source's preview URL using Deezer.
 * Updates the database if a preview is found. Returns the URL or null.
 */
// Deezer signe ses previews avec une expiration (`?hdnea=exp=<unixSec>~...`). Passe ce delai,
// l'URL renvoie 403 (text/html) et le navigateur leve NotSupportedError -> AUCUN son en jeu.
// Les URLs sont stockees en base et peuvent dater de plusieurs mois -> on doit les detecter.
export function isExpiredPreview(url: string | null | undefined): boolean {
  if (!url) return false;
  const m = url.match(/exp=(\d{8,})/);
  if (!m) return false;
  const exp = parseInt(m[1], 10);
  if (!Number.isFinite(exp)) return false;
  return exp * 1000 <= Date.now() + 60_000; // expiree, ou moins de 60s restantes
}

export async function hydratePreviewUrl(source: AudioSourceRow): Promise<string | null> {
  const cached = source.audio_url;
  // URL en cache encore valide -> on la garde.
  if (cached && !isExpiredPreview(cached)) return cached;

  const title = source.title?.trim();
  const artist = source.artist?.trim() || undefined;
  if (title) {
    try {
      const deezerTrack = await deezerPreviewService.searchTrack(title, artist);
      if (deezerTrack?.preview) {
        await pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [
          deezerTrack.preview,
          source.id,
        ]);
        return deezerTrack.preview;
      }
    } catch (err) {
      logger.error("deezer_hydrate_failed", { id: source.id, title, error: err });
    }
  }

  // Pas de preview fraiche trouvee : une URL en cache EXPIREE est inutilisable -> on l'annule.
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
  userId: number,
  provider: ProviderFilter,
  count: number,
  opts: { likedOnly?: boolean; playlistId?: string; timeRange?: string; linkIds?: number[]; excludeKeys?: string[] } = {}
): Promise<AudioSourceRow[]> {
  const extraConds: string[] = [];
  const params: unknown[] = [userId];

  // Les morceaux de CE joueur, par ses liens joueur-morceau (user_audio_sources) :
  // jamais le fonds commun, pour une attribution « qui a ajoute » fiable. La
  // ligne rendue porte le joueur et SA carte (un morceau peut etre a plusieurs).
  // likedOnly : ses titres likes, relies a sa carte s'il les a importes.
  const from = opts.likedOnly
    ? `FROM audio_sources s
       JOIN likes l ON l.audio_source_id = s.id
       LEFT JOIN user_audio_sources ua ON ua.audio_source_id = s.id AND ua.user_id = l.user_id
       WHERE l.user_id = $1`
    : `FROM user_audio_sources ua
       JOIN audio_sources s ON s.id = ua.audio_source_id
       WHERE ua.user_id = $1`;
  if (provider !== "any") {
    params.push(provider);
    extraConds.push(`s.provider = $${params.length}`);
  }
  if (opts.playlistId) {
    params.push(opts.playlistId);
    extraConds.push(`s.metadata->>'playlist_id' = $${params.length}`);
  }
  if (opts.timeRange) {
    params.push(opts.timeRange);
    extraConds.push(`s.metadata->>'time_range' = $${params.length}`);
  }
  // Bibliotheque de liens : ne jouer QUE les titres des cartes cochees.
  if (opts.linkIds) {
    params.push(opts.linkIds);
    extraConds.push(`ua.link_id = ANY($${params.length}::int[])`);
  }
  // Morceaux deja tires pour cette partie (meme cle que le dedoublonnage).
  if (opts.excludeKeys?.length) {
    params.push(opts.excludeKeys);
    extraConds.push(`COALESCE(s.external_id, s.id::text) <> ALL($${params.length}::text[])`);
  }

  params.push(count);
  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT s.id, ua.user_id AS user_id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata, ua.link_id AS link_id
     ${from} ${extraConds.map(cond => `AND ${cond}`).join(" ")}
     ORDER BY RANDOM()
     LIMIT $${params.length}`,
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

export type CollectOptions = {
  likedOnly?: boolean;
  playlistId?: string;
  timeRange?: string;
  provider?: ProviderFilter;
  linkIds?: number[];
  excludeKeys?: string[];
  /** Nombre de titres tires en base (defaut : 4 x desiredCount, 200 au plus). */
  drawLimit?: number;
  /** Recherches Deezer permises (titres sans extrait ou extrait expire). Defaut : pas de limite. */
  maxLookups?: number;
};

/** Ce qu'un tirage a donne : les titres jouables, ceux sans extrait, et le travail fait. */
export type PlayableBatch = {
  playable: AudioSourceRow[];
  /** Cles (external_id ou id) des titres sans extrait : inutile de les retirer dans la meme partie. */
  rejectedKeys: string[];
  /** Lignes tirees en base. */
  drawn: number;
  /** Recherches d'extrait lancees (titre sans extrait ou extrait expire). */
  lookups: number;
};

export const sourceKey = (source: Pick<AudioSourceRow, "external_id" | "id">): string =>
  source.external_id ?? String(source.id);

const needsLookup = (source: AudioSourceRow): boolean =>
  !source.audio_url || isExpiredPreview(source.audio_url);

/** Recherches d'extrait en meme temps au plus (Deezer : 50 requetes par 5 s). */
export const HYDRATE_CONCURRENCY = 6;

/**
 * Hydrate les extraits : un extrait en cache encore frais ne coute rien, les
 * autres passent par Deezer, `maxLookups` au plus et HYDRATE_CONCURRENCY a la
 * fois. Ceux au-dela de la limite ne sont pas essayes (absents de `tried`).
 */
export async function hydrateWithinBudget(
  candidates: AudioSourceRow[],
  maxLookups: number
): Promise<{ tried: AudioSourceRow[]; lookups: number }> {
  const stale = candidates.filter(needsLookup);
  const allowed = new Set(stale.slice(0, Math.max(0, maxLookups)));
  const tried = candidates.filter(source => !needsLookup(source) || allowed.has(source));
  await mapLimit(tried, HYDRATE_CONCURRENCY, async (source) => {
    source.audio_url = await hydratePreviewUrl(source);
  });
  return { tried, lookups: allowed.size };
}

export async function collectPlayableBatch(
  userId: number,
  desiredCount: number,
  opts: CollectOptions
): Promise<PlayableBatch> {
  // Sur-fetch reduit (4x) : moins de recherches Deezer en parallele au lancement
  // (les previews expirent et doivent etre re-cherchees) tout en gardant une marge.
  const candidateLimit = opts.drawLimit ?? Math.min(desiredCount * 4, 200);
  if (candidateLimit <= 0 || desiredCount <= 0) return { playable: [], rejectedKeys: [], drawn: 0, lookups: 0 };
  const providerFilter = opts.provider ?? "any";
  const candidates = await fetchAudioSources(userId, providerFilter, candidateLimit, {
    likedOnly: opts.likedOnly,
    playlistId: opts.playlistId,
    timeRange: opts.timeRange,
    linkIds: opts.linkIds,
    excludeKeys: opts.excludeKeys,
  });

  // Hydrate / rafraichit les previews via Deezer (re-fetch si manquante OU
  // expiree), dans la limite permise. Ceux au-dela ne sont ni joues ni ecartes.
  const { tried: toHydrate, lookups } = await hydrateWithinBudget(
    candidates,
    opts.maxLookups ?? Number.POSITIVE_INFINITY
  );

  const playable = shuffle(toHydrate.filter((source) => Boolean(source.audio_url)));
  const playableKeys = new Set(playable.map(sourceKey));
  const rejectedKeys = Array.from(new Set(
    toHydrate.filter(source => !source.audio_url).map(sourceKey).filter(key => !playableKeys.has(key))
  ));
  const unique = new Map<string, AudioSourceRow>();
  for (const source of playable) {
    const key = sourceKey(source);
    if (unique.has(key)) continue;
    unique.set(key, source);
    if (unique.size >= desiredCount) break;
  }
  return { playable: Array.from(unique.values()), rejectedKeys, drawn: candidates.length, lookups };
}

export async function collectPlayableSources(
  userId: number,
  desiredCount: number,
  opts: CollectOptions
): Promise<AudioSourceRow[]> {
  return (await collectPlayableBatch(userId, desiredCount, opts)).playable;
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
