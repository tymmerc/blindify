import { pool } from "../config/db";
import type { AudioSourceRow } from "../types/audio";
import type { MusicProvider } from "../types/user";
import { deezerPreviewService } from "./deezerPreviewService";

// ---------------------------------------------------------------------------
// Preview hydration — resolves audio URLs via Deezer search
// ---------------------------------------------------------------------------

/**
 * Hydrate a single audio source's preview URL using Deezer.
 * Updates the database if a preview is found. Returns the URL or null.
 */
export async function hydratePreviewUrl(source: AudioSourceRow): Promise<string | null> {
  if (source.audio_url) return source.audio_url;

  const title = source.title?.trim();
  if (!title) return null;
  const artist = source.artist?.trim() || undefined;

  try {
    const deezerTrack = await deezerPreviewService.searchTrack(title, artist);
    if (deezerTrack?.preview) {
      await pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [
        deezerTrack.preview,
        source.id,
      ]);
      return deezerTrack.preview;
    }
    return null;
  } catch (err) {
    console.error("deezer_hydrate_failed", { id: source.id, title, err });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch audio sources from database
// ---------------------------------------------------------------------------

export type ProviderFilter = MusicProvider | "any";

export async function fetchAudioSources(
  userIds: number | number[],
  provider: ProviderFilter,
  count: number,
  opts: { likedOnly?: boolean; playlistId?: string; timeRange?: string } = {}
): Promise<AudioSourceRow[]> {
  const extraConds: string[] = [];
  const params: unknown[] = [];
  const userList = Array.isArray(userIds) ? userIds : [userIds];

  params.push(userList);
  const userCond = opts.likedOnly
    ? `l.user_id = ANY($1)`
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

  const extraClause = extraConds.length ? `AND ${extraConds.join(" AND ")}` : "";

  if (opts.likedOnly) {
    params.push(count);
    const limitIndex = params.length;
    const { rows } = await pool.query<AudioSourceRow>(
      `SELECT s.id, s.user_id AS user_id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata
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
    `SELECT s.id, s.user_id AS user_id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata
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

export async function collectPlayableSources(
  userIds: number | number[],
  desiredCount: number,
  opts: { likedOnly?: boolean; playlistId?: string; timeRange?: string; provider?: ProviderFilter }
): Promise<AudioSourceRow[]> {
  const candidateLimit = Math.min(desiredCount * 8, 400);
  const providerFilter = opts.provider ?? "any";
  const candidates = await fetchAudioSources(userIds, providerFilter, candidateLimit, {
    likedOnly: opts.likedOnly,
    playlistId: opts.playlistId,
    timeRange: opts.timeRange,
  });

  // Hydrate missing previews via Deezer
  await Promise.all(
    candidates.map(async (source) => {
      if (source.audio_url) return;
      const preview = await hydratePreviewUrl(source);
      if (preview) {
        source.audio_url = preview;
        console.log("deezer_preview_found", { sourceId: source.id, title: source.title });
      }
    })
  );

  const playable = shuffle(candidates.filter((source) => Boolean(source.audio_url)));
  const unique = new Map<string, AudioSourceRow>();
  for (const source of playable) {
    const key = source.external_id ?? String(source.id);
    if (unique.has(key)) continue;
    unique.set(key, source);
    if (unique.size >= desiredCount) break;
  }
  return Array.from(unique.values());
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
