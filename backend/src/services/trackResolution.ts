import { pool } from "../config/db";
import type { AudioSourceRow } from "../types/audio";
import type { MusicProvider } from "../types/user";
import { deezerPreviewService, type PreviewQuery } from "./deezerPreviewService";
import { isIsrc } from "./previewMatch";
import { logger } from "../utils/logger";
import { isExpiredPreview } from "../utils/previewExpiry";
import { mapLimit } from "../utils/concurrency";
import { LookupGuard } from "./lookupGuard";

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

/**
 * L'extrait d'un morceau, et si la recherche a echoue (Deezer en erreur,
 * quota, panne, file pleine) : `failed` vrai. Un "pas d'extrait" n'est pas un
 * echec. Le disjoncteur du lancement (LookupGuard) compte les echecs.
 */
export async function hydratePreviewOutcome(source: AudioSourceRow): Promise<{ url: string | null; failed: boolean }> {
  const cached = source.audio_url;
  // URL en cache encore valide -> on la garde.
  if (cached && !isExpiredPreview(cached)) return { url: cached, failed: false };

  const query = previewQueryFor(source);
  const { title } = query;
  if (title) {
    try {
      const outcome = await deezerPreviewService.resolvePreviewOutcome(query);
      if (outcome.status === "error") {
        // Deezer en erreur (quota, panne) : on ne conclut rien, la base reste
        // telle quelle. Le morceau n'est pas jouable cette fois-ci.
        return { url: null, failed: true };
      }
      const preview = outcome.status === "found" ? outcome.track.preview : null;
      if (preview) {
        await pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [preview, source.id]);
        return { url: preview, failed: false };
      }
    } catch (err) {
      logger.error("deezer_hydrate_failed", { id: source.id, title, error: err });
      return { url: null, failed: true }; // erreur : ne rien ecrire
    }
  }

  // Introuvable chez Deezer : une URL en cache EXPIREE est inutilisable -> on l'annule.
  if (cached && isExpiredPreview(cached)) {
    await pool.query("UPDATE audio_sources SET audio_url=NULL WHERE id=$1", [source.id]).catch(() => {});
    return { url: null, failed: false };
  }
  return { url: cached ?? null, failed: false };
}

/** L'extrait d'un morceau, ou null (pas d'extrait, ou Deezer en erreur). */
export async function hydratePreviewUrl(source: AudioSourceRow): Promise<string | null> {
  return (await hydratePreviewOutcome(source)).url;
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
  /** Bornes des recherches Deezer du lancement (budget, echeance, disjoncteur). Defaut : un garde neuf sans budget. */
  guard?: LookupGuard;
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

const TIMED_OUT: unique symbol = Symbol("timed_out");
const FAILED: unique symbol = Symbol("failed");

/**
 * La recherche, ou TIMED_OUT passe `ms`, ou FAILED si elle echoue.
 * Le delai part avant la file de deezerPreviewService (6 requetes en vol, 40
 * par 5 s, pause de 20 s sur quota) : l'attente en file compte dans les `ms`.
 * C'est voulu : quand Deezer est sature ou en pause, les recherches expirent,
 * le disjoncteur du lancement saute, et la partie part avec ce qu'elle a au
 * lieu d'attendre.
 */
async function lookupWithin(source: AudioSourceRow, ms: number): Promise<string | null | typeof TIMED_OUT | typeof FAILED> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof TIMED_OUT>(resolve => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    // Abandonnee, la recherche finit en arriere-plan : son resultat (ecrit en
    // base par hydratePreviewUrl) servira au prochain lancement.
    // Une erreur Deezer (quota, panne, file pleine, disjoncteur de quota du
    // service) compte comme un echec pour le disjoncteur du lancement ; un
    // "pas d'extrait" non.
    const lookup: Promise<string | null | typeof FAILED> = hydratePreviewOutcome(source)
      .then(({ url, failed }) => (failed ? FAILED : url))
      .catch((): typeof FAILED => FAILED);
    return await Promise.race([lookup, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hydrate les extraits, HYDRATE_CONCURRENCY a la fois. Un extrait en cache
 * encore frais ne coute rien et passe en premier ; les autres passent par
 * Deezer, dans les bornes du garde (budget, echeance, disjoncteur), avec un
 * delai par recherche. Arrete de chercher des que `stopAt` titres jouables
 * sont trouves. `tried` : les titres dont on connait le sort (audio_url
 * renseignee, ou null si pas d'extrait ou pas de reponse a temps) ; les autres
 * n'ont pas ete essayes.
 */
export async function hydrateWithinBudget(
  candidates: AudioSourceRow[],
  guard: LookupGuard,
  stopAt: number = Number.POSITIVE_INFINITY
): Promise<{ tried: AudioSourceRow[]; lookups: number }> {
  const ordered = [...candidates.filter(source => !needsLookup(source)), ...candidates.filter(needsLookup)];
  const tried: AudioSourceRow[] = [];
  const found = new Set<string>();
  const before = guard.lookups;
  await mapLimit(ordered, HYDRATE_CONCURRENCY, async (source) => {
    if (found.size >= stopAt) return;
    if (!needsLookup(source)) {
      tried.push(source);
      found.add(sourceKey(source));
      return;
    }
    if (!guard.take()) return;
    const result = await lookupWithin(source, guard.timeoutMs());
    if (result === TIMED_OUT || result === FAILED) {
      guard.failed();
      source.audio_url = null;
    } else {
      guard.succeeded();
      source.audio_url = result;
      if (result) found.add(sourceKey(source));
    }
    tried.push(source);
  });
  return { tried, lookups: guard.lookups - before };
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
  // On s'arrete des que le compte est atteint.
  const { tried: toHydrate, lookups } = await hydrateWithinBudget(
    candidates,
    opts.guard ?? new LookupGuard(Number.POSITIVE_INFINITY),
    desiredCount
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
