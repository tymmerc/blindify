/**
 * Import d'une playlist YouTube ou YouTube Music.
 *
 * On lit la liste des videos (titre, chaine) par l'API officielle YouTube Data
 * v3, puis on retrouve chaque morceau chez Deezer, comme pour Spotify. On ne
 * telecharge ni ne joue jamais rien de YouTube : le son est l'extrait Deezer.
 *
 * Regles Google (developers.google.com/youtube/terms/developer-policies) :
 * rien de YouTube n'est garde plus de 30 jours. En base il n'y a que le
 * morceau Deezer retrouve ; la liste lue reste 10 min en memoire (cache).
 *
 * Garanties, comme le lancement d'une salle (lookupGuard.ts) : un budget de
 * recherches, une echeance sous les 60 s de nginx, un disjoncteur sur les
 * erreurs Deezer, et un debit plafonne pour laisser Deezer aux parties en cours.
 */
import axios, { AxiosError } from "axios";
import { youtubeApiBase, youtubeApiKey } from "../config/youtube";
import { logger } from "../utils/logger";
import { deezerPreviewService, type DeezerTrack, type PreviewOutcome } from "./deezerPreviewService";
import { LookupGuard, type LookupStop } from "./lookupGuard";
import { youtubeSearches } from "./youtubeTitle";

/** Reglables pour les tests ; la prod garde ces valeurs. */
export const YOUTUBE_LIMITS = {
  /** Videos lues au plus dans une playlist (4 pages de 50 = 4 unites de quota). */
  maxItems: 200,
  /** Videos regardees au plus par import. */
  maxExamined: 100,
  /** Videos regardees par defaut (le jeu demande 10 ou 50 par playlist). */
  minExamined: 50,
  /** Toutes les recherches Deezer d'un import tiennent dans ce delai. */
  deadlineMs: 30_000,
  lookupTimeoutMs: 6_000,
  breakerFailures: 6,
  /** Recherches menees en meme temps par un import. */
  workers: 2,
  /** Ecart mini entre deux recherches d'import, tous joueurs confondus : 20 par 5 s, la moitie du debit Deezer. */
  minGapMs: 250,
  /** Duree de vie de la liste lue en memoire. */
  cacheMs: 10 * 60_000,
  pageTimeoutMs: 8_000,
};

// ---------------------------------------------------------------------------
// Lien
// ---------------------------------------------------------------------------

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;

/**
 * L'identifiant de playlist d'un lien YouTube, ou null si ce n'en est pas un :
 *   youtube.com/playlist?list=PL...      music.youtube.com/playlist?list=...
 *   youtube.com/watch?v=...&list=PL...   youtu.be/ID?list=PL...
 *   music.youtube.com/browse/VLPL...     m.youtube.com/...   (+ ?si= du bouton Partager)
 */
export function youtubePlaylistId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(host)) return null;
  const list = url.searchParams.get("list");
  if (list && LIST_ID.test(list)) return list;
  const browse = url.pathname.match(/^\/browse\/VL([A-Za-z0-9_-]{2,64})\/?$/);
  if (host === "music.youtube.com" && browse) return browse[1];
  return null;
}

export function isYoutubeHost(url: URL): boolean {
  return YOUTUBE_HOSTS.has(url.hostname.toLowerCase().replace(/^www\./, ""));
}

// ---------------------------------------------------------------------------
// Erreurs (messages pour le joueur)
// ---------------------------------------------------------------------------

export type YoutubeErrorCode = "youtube_unavailable" | "youtube_not_found" | "youtube_private" | "youtube_mix" | "youtube_empty";

const MESSAGES: Record<YoutubeErrorCode, { status: number; message: string }> = {
  youtube_unavailable: { status: 503, message: "L'import YouTube ne répond pas pour l'instant. Réessaie plus tard, ou colle un lien Spotify ou Deezer." },
  youtube_not_found: { status: 404, message: "On ne trouve pas cette playlist YouTube. Vérifie le lien, et qu'elle est publique ou non répertoriée." },
  youtube_private: { status: 403, message: "Cette playlist YouTube est privée. Passe-la en publique ou non répertoriée, puis réessaie." },
  youtube_mix: { status: 422, message: "Les mix YouTube sont faits pour chacun et ne se partagent pas. Colle le lien d'une playlist." },
  youtube_empty: { status: 422, message: "Cette playlist YouTube est vide." },
};

export class YoutubeImportError extends Error {
  readonly status: number;
  constructor(readonly code: YoutubeErrorCode) {
    super(MESSAGES[code].message);
    this.name = "YoutubeImportError";
    this.status = MESSAGES[code].status;
  }
}

/** Les listes privees par nature : J'aime (LL, LM), A regarder plus tard (WL). */
function refuseByShape(listId: string): void {
  if (/^(LL|LM|WL)$/.test(listId)) throw new YoutubeImportError("youtube_private");
  // Mix automatiques (RD...), sauf les playlists maison de YouTube Music (RDCLAK5uy_...).
  if (/^RD/.test(listId) && !/^RDCLAK5uy_/.test(listId)) throw new YoutubeImportError("youtube_mix");
}

// ---------------------------------------------------------------------------
// Lecture de la playlist
// ---------------------------------------------------------------------------

export interface YoutubeVideo {
  title: string;
  channel: string | null;
}

export interface YoutubePlaylist {
  id: string;
  name: string;
  /** Videos annoncees par YouTube (privees et supprimees comprises). */
  itemCount: number;
  cover: string | null;
}

type ApiError = { error?: { code?: number; errors?: Array<{ reason?: string }> } };

function apiReason(err: unknown): { status: number | null; reason: string | null } {
  const ax = err as AxiosError<ApiError>;
  return {
    status: ax?.response?.status ?? null,
    reason: ax?.response?.data?.error?.errors?.[0]?.reason ?? null,
  };
}

/** Une erreur de l'API devenue un message pour le joueur ; la cle n'apparait jamais dans le journal. */
function toImportError(err: unknown, listId: string): YoutubeImportError {
  if (err instanceof YoutubeImportError) return err;
  const { status, reason } = apiReason(err);
  if (status === 404 || reason === "playlistNotFound") return new YoutubeImportError("youtube_not_found");
  if (reason === "playlistItemsNotAccessible" || reason === "forbidden") return new YoutubeImportError("youtube_private");
  logger.error("youtube_api_failed", { listId, status, reason, code: (err as AxiosError)?.code ?? null });
  return new YoutubeImportError("youtube_unavailable");
}

function requireKey(): string {
  const key = youtubeApiKey();
  if (!key) throw new YoutubeImportError("youtube_unavailable");
  return key;
}

async function apiGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const { data } = await axios.get<T>(`${youtubeApiBase()}/${path}`, {
    params: { ...params, key: requireKey() },
    timeout: YOUTUBE_LIMITS.pageTimeoutMs,
    // Pas de redirection : la cle part dans l'adresse, elle ne doit aller nulle part ailleurs.
    maxRedirects: 0,
  });
  return data;
}

/** Nom, nombre de videos et image de la playlist, pour l'ecran d'import. */
export async function fetchYoutubePlaylistInfo(listId: string): Promise<YoutubePlaylist> {
  refuseByShape(listId);
  try {
    const data = await apiGet<{ items?: Array<{ id?: string; snippet?: { title?: string; thumbnails?: { medium?: { url?: string } } }; contentDetails?: { itemCount?: number } }> }>(
      "playlists",
      { part: "snippet,contentDetails", id: listId, fields: "items(id,snippet(title,thumbnails/medium/url),contentDetails/itemCount)" },
    );
    const item = data?.items?.[0];
    // Une playlist privee ne sort pas avec une simple cle : introuvable ou privee, on ne peut pas savoir.
    if (!item?.id) throw new YoutubeImportError("youtube_not_found");
    const itemCount = item.contentDetails?.itemCount ?? 0;
    if (itemCount === 0) throw new YoutubeImportError("youtube_empty");
    return {
      id: item.id,
      name: item.snippet?.title?.trim() || "Playlist YouTube",
      itemCount,
      cover: item.snippet?.thumbnails?.medium?.url ?? null,
    };
  } catch (err) {
    throw toImportError(err, listId);
  }
}

const listCache = new Map<string, { at: number; videos: YoutubeVideo[] }>();
const LIST_CACHE_MAX = 100;

/** Vide le cache (tests). */
export function clearYoutubeCache(): void {
  listCache.clear();
}

// Videos supprimees ou privees dans une playlist publique : on les saute.
const UNAVAILABLE = /^(deleted|private) video$/i;

/** Les videos lisibles d'une playlist, dans l'ordre, au plus YOUTUBE_LIMITS.maxItems. */
export async function fetchYoutubeVideos(listId: string): Promise<YoutubeVideo[]> {
  refuseByShape(listId);
  const cached = listCache.get(listId);
  if (cached && Date.now() - cached.at < YOUTUBE_LIMITS.cacheMs) return cached.videos;

  const videos: YoutubeVideo[] = [];
  let pageToken: string | undefined;
  let read = 0;
  try {
    do {
      const data = await apiGet<{ nextPageToken?: string; items?: Array<{ snippet?: { title?: string; videoOwnerChannelTitle?: string } }> }>(
        "playlistItems",
        {
          part: "snippet",
          playlistId: listId,
          maxResults: 50,
          fields: "nextPageToken,items(snippet(title,videoOwnerChannelTitle))",
          ...(pageToken ? { pageToken } : {}),
        },
      );
      for (const item of data?.items ?? []) {
        read++;
        const title = item?.snippet?.title?.trim();
        // snippet.channelTitle est le proprietaire de la playlist ; la chaine de la video est videoOwnerChannelTitle.
        const channel = item?.snippet?.videoOwnerChannelTitle?.trim() || null;
        if (!title || UNAVAILABLE.test(title)) continue;
        videos.push({ title, channel });
      }
      pageToken = data?.nextPageToken || undefined;
    } while (pageToken && read < YOUTUBE_LIMITS.maxItems);
  } catch (err) {
    throw toImportError(err, listId);
  }
  if (videos.length === 0) throw new YoutubeImportError("youtube_empty");

  if (listCache.size >= LIST_CACHE_MAX) {
    const oldest = listCache.keys().next().value;
    if (oldest !== undefined) listCache.delete(oldest);
  }
  listCache.set(listId, { at: Date.now(), videos });
  return videos;
}

// ---------------------------------------------------------------------------
// Retrouver les morceaux chez Deezer
// ---------------------------------------------------------------------------

export interface YoutubeMatchReport {
  /** Videos lisibles dans la playlist (au plus maxItems). */
  playlistSize: number;
  /** Videos regardees : les premieres de la playlist. */
  examined: number;
  /** Morceaux retrouves chez Deezer (sans doublon). */
  found: number;
  /** Videos regardees sans morceau sur chez Deezer. */
  notFound: number;
  /** Videos regardees mais pas verifiees : Deezer en erreur, ou plus le temps. */
  unchecked: number;
  stoppedBy: LookupStop | null;
}

export interface YoutubeMatchResult {
  tracks: DeezerTrack[];
  report: YoutubeMatchReport;
}

// Debit des imports, partage par tous les joueurs : une recherche tous les minGapMs au plus.
let nextSlotAt = 0;

/** Remet le debit a zero (tests). */
export function resetYoutubePacer(): void {
  nextSlotAt = 0;
}

async function paced(guard: LookupGuard): Promise<boolean> {
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + YOUTUBE_LIMITS.minGapMs;
  const wait = at - now;
  if (wait >= guard.remainingMs()) return false;
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  return true;
}

function withTimeout(promise: Promise<PreviewOutcome>, ms: number): Promise<PreviewOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<PreviewOutcome>(resolve => {
    timer = setTimeout(() => resolve({ status: "error" }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type VideoVerdict = { kind: "found"; track: DeezerTrack } | { kind: "none" } | { kind: "unchecked" };

async function matchVideo(video: YoutubeVideo, guard: LookupGuard): Promise<VideoVerdict> {
  const searches = youtubeSearches(video.title, video.channel);
  if (searches.length === 0) return { kind: "none" };
  let sawError = false;
  for (const search of searches) {
    // Le budget et l'echeance d'abord (guard note pourquoi on s'arrete), puis son tour dans le debit.
    if (!guard.take() || !(await paced(guard))) return { kind: "unchecked" };
    const outcome = await withTimeout(
      deezerPreviewService.resolvePreviewOutcome({ title: search.title, artist: search.artist }),
      guard.timeoutMs(),
    );
    if (outcome.status === "found") {
      guard.succeeded();
      return { kind: "found", track: outcome.track };
    }
    if (outcome.status === "error") {
      guard.failed();
      sawError = true;
    } else guard.succeeded();
  }
  // Un essai en erreur : on ne peut pas dire que Deezer n'a pas le morceau.
  return sawError ? { kind: "unchecked" } : { kind: "none" };
}

/** Combien de videos regarder pour une demande de `requested` titres par playlist. */
export function examinedFor(requested: number | undefined): number {
  const wanted = Number.isFinite(requested) && requested! > 0 ? requested! : 0;
  return Math.min(Math.max(wanted, YOUTUBE_LIMITS.minExamined), YOUTUBE_LIMITS.maxExamined);
}

/**
 * Retrouve chez Deezer les `examine` premieres videos. Ne leve pas pour
 * Deezer : ce qui n'a pas pu etre verifie est compte dans `unchecked`.
 */
export async function matchYoutubeVideos(videos: YoutubeVideo[], examine: number): Promise<YoutubeMatchResult> {
  const queue = videos.slice(0, Math.max(0, examine));
  // Au plus deux recherches par video.
  const guard = new LookupGuard(queue.length * 2, Date.now(), {
    deadlineMs: YOUTUBE_LIMITS.deadlineMs,
    lookupTimeoutMs: YOUTUBE_LIMITS.lookupTimeoutMs,
    breakerFailures: YOUTUBE_LIMITS.breakerFailures,
  });
  const verdicts: VideoVerdict[] = new Array(queue.length);
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const index = next++;
      verdicts[index] = guard.stoppedBy === "deadline" || guard.stoppedBy === "breaker"
        ? { kind: "unchecked" }
        : await matchVideo(queue[index], guard);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, YOUTUBE_LIMITS.workers) }, worker));

  const seen = new Set<number>();
  const tracks: DeezerTrack[] = [];
  let notFound = 0;
  let unchecked = 0;
  for (const verdict of verdicts) {
    if (verdict.kind === "found") {
      if (!seen.has(verdict.track.id)) {
        seen.add(verdict.track.id);
        tracks.push(verdict.track);
      }
    } else if (verdict.kind === "none") notFound++;
    else unchecked++;
  }
  const report: YoutubeMatchReport = {
    playlistSize: videos.length,
    examined: queue.length,
    found: queue.length - notFound - unchecked,
    notFound,
    unchecked,
    stoppedBy: guard.stoppedBy === "budget" ? null : guard.stoppedBy,
  };
  logger.info("youtube_import_matched", { ...report, unique: tracks.length, lookups: guard.lookups, failures: guard.failures });
  return { tracks, report };
}
