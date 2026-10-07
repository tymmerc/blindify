import axios from "axios";
import { DEEZER_API } from "../config/deezer";
import { logger } from "../utils/logger";
import { pickMatch, isIsrc, searchQueryFor } from "./previewMatch";
import { isExpiredPreview } from "../utils/previewExpiry";

const DEEZER_SEARCH_URL = `${DEEZER_API}/search`;
const DEEZER_TRACK_URL = `${DEEZER_API}/track`;

// Deezer rate limit: 50 requests per 5 seconds
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX = 50;

const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

// Assez de resultats pour que la bonne version y soit, en un seul appel.
const SEARCH_LIMIT = 10;

// Morceau trouve par ISRC : au-dela de 30 % d'ecart de duree avec Spotify, ce
// n'est pas le meme enregistrement (ISRC mal attribue par un distributeur).
const ISRC_DURATION_RATIO = 0.3;

export interface DeezerTrack {
  id: number;
  title: string;
  artist: string;
  preview: string | null;
  albumCover: string | null;
  duration: number;
}

/** Ce qu'on sait du morceau a jouer. L'ISRC (Spotify) et l'identifiant Deezer
 *  designent un enregistrement exact ; le titre ne sert qu'en dernier recours. */
export interface PreviewQuery {
  title: string;
  artist?: string;
  durationMs?: number | null;
  isrc?: string | null;
  deezerId?: string | null;
}

interface DeezerSearchItem {
  id?: number;
  title?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string };
  preview?: string;
  duration?: number;
}

interface DeezerTrackResponse extends DeezerSearchItem {
  readable?: boolean;
  error?: { type?: string; message?: string; code?: number };
}

interface DeezerSearchResponse {
  data?: DeezerSearchItem[];
  error?: { type?: string; message?: string; code?: number };
}

type CacheEntry = { track: DeezerTrack | null; ts: number };

/** found : le morceau ; unknown : Deezer ne le connait pas (800) ;
 *  unavailable : Deezer en erreur (quota, panne), on ne retient rien. */
type ExactResult =
  | { kind: "found"; track: DeezerTrack }
  | { kind: "unknown" }
  | { kind: "unavailable" };

/** Horloge injectable : les tests du debit tournent sans attendre pour de vrai. */
export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

function toDeezerTrack(item: DeezerSearchItem & { id: number }): DeezerTrack {
  return {
    id: item.id,
    title: item.title ?? "",
    artist: item.artist?.name ?? "",
    preview: item.preview || null,
    albumCover: item.album?.cover_big ?? item.album?.cover_medium ?? null,
    duration: item.duration ?? 0,
  };
}

function closeDuration(track: DeezerTrack, durationMs?: number | null): boolean {
  if (!durationMs || durationMs <= 0 || !track.duration) return true;
  return Math.abs(track.duration * 1000 - durationMs) <= durationMs * ISRC_DURATION_RATIO;
}

export class DeezerPreviewService {
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<unknown>>();
  private requestTimestamps: number[] = [];
  // File d'attente du debit : chaque appel prend son tour, dans l'ordre.
  private throttleQueue: Promise<void> = Promise.resolve();

  constructor(private readonly clock: Clock = realClock) {}

  /**
   * Au plus RATE_LIMIT_MAX appels par fenetre, meme avec 200 demandes
   * simultanees : les attentes sont servies une par une (avant, toutes
   * celles qui attendaient repartaient ensemble au meme instant).
   */
  private throttle(): Promise<void> {
    const turn = this.throttleQueue.then(() => this.takeSlot());
    this.throttleQueue = turn.catch(() => {});
    return turn;
  }

  private async takeSlot(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
      if (this.requestTimestamps.length < RATE_LIMIT_MAX) break;
      await this.clock.sleep(RATE_LIMIT_WINDOW_MS - (now - this.requestTimestamps[0]) + 50);
    }
    this.requestTimestamps.push(this.clock.now());
  }

  /** Une seule requete par cle a la fois : les demandes identiques attendent la meme. */
  private dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const p = run().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private cacheKey(title: string, artist?: string): string {
    return `${title.toLowerCase().trim()}||${(artist ?? "").toLowerCase().trim()}`;
  }

  private getCached(key: string): DeezerTrack | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // Trop vieux, ou extrait expire (les URL Deezer vivent ~15 min) : on oublie.
    if (Date.now() - entry.ts > CACHE_TTL_MS || isExpiredPreview(entry.track?.preview)) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.track;
  }

  /**
   * L'extrait du bon enregistrement : par identifiant Deezer, puis par ISRC,
   * puis par recherche de titre (qui refuse toute autre version). null si rien
   * de sur : le morceau sera saute plutot que joue dans une autre version.
   * Deezer en erreur (quota, panne) : null tout de suite, sans recherche en
   * plus, pour ne pas charger davantage un service qui sature.
   */
  async resolvePreview(query: PreviewQuery): Promise<DeezerTrack | null> {
    const deezerId = query.deezerId && /^\d{1,15}$/.test(query.deezerId) ? query.deezerId : null;
    if (deezerId) {
      const byId = await this.fetchExact(`id:${deezerId}`, `${DEEZER_TRACK_URL}/${deezerId}`);
      if (byId.kind === "unavailable") return null;
      if (byId.kind === "found" && byId.track.preview) return byId.track;
    }
    if (isIsrc(query.isrc)) {
      const isrc = query.isrc.toUpperCase();
      const byIsrc = await this.fetchExact(`isrc:${isrc}`, `${DEEZER_TRACK_URL}/isrc:${isrc}`);
      if (byIsrc.kind === "unavailable") return null;
      if (byIsrc.kind === "found" && byIsrc.track.preview && closeDuration(byIsrc.track, query.durationMs)) return byIsrc.track;
    }
    return this.searchTrack(query.title, query.artist, query.durationMs);
  }

  /** Un morceau precis (/track/<id> ou /track/isrc:<ISRC>). */
  private async fetchExact(key: string, url: string): Promise<ExactResult> {
    const cached = this.getCached(key);
    if (cached !== undefined) return cached ? { kind: "found", track: cached } : { kind: "unknown" };
    return this.dedupe(key, async (): Promise<ExactResult> => {
      await this.throttle();
      try {
        const { data } = await axios.get<DeezerTrackResponse>(url, { timeout: 8_000 });
        if (data?.error && data.error.code !== 800) {
          // Quota (code 4) ou autre : rien en cache, on retentera plus tard.
          logger.error("deezer_track_lookup_error", { key, error: data.error });
          return { kind: "unavailable" };
        }
        // Erreur 800 "no data", ou pas de morceau : Deezer ne le connait pas, on retient le non.
        const track = !data?.error && data?.id && data.readable !== false ? toDeezerTrack({ ...data, id: data.id }) : null;
        this.cache.set(key, { track, ts: Date.now() });
        return track ? { kind: "found", track } : { kind: "unknown" };
      } catch (err) {
        logger.error("deezer_track_lookup_failed", { key, error: err });
        return { kind: "unavailable" };
      }
    });
  }

  /**
   * Search Deezer for a track by title and optional artist.
   * Returns the best match or null.
   */
  async searchTrack(title: string, artist?: string, durationMs?: number | null): Promise<DeezerTrack | null> {
    const trimmedTitle = title?.trim();
    if (!trimmedTitle) return null;
    const trimmedArtist = artist?.trim() || undefined;

    const key = `${this.cacheKey(trimmedTitle, trimmedArtist)}||${durationMs ? Math.round(durationMs / 1000) : ""}`;
    const cached = this.getCached(key);
    if (cached !== undefined) return cached;

    return this.dedupe(key, () => this.runSearch(key, trimmedTitle, trimmedArtist, durationMs));
  }

  private async runSearch(key: string, trimmedTitle: string, trimmedArtist: string | undefined, durationMs?: number | null): Promise<DeezerTrack | null> {
    await this.throttle();

    // Recherche en texte libre. La syntaxe avancee (`track:"..." artist:"..."`)
    // renvoie 0 resultat depuis le 02/10/2026 (filtre artist casse chez Deezer) :
    // plus aucun extrait, le solo par lien ne demarrait plus. Le bon morceau est
    // ensuite choisi par pickMatch, jamais "le premier venu".
    const q = searchQueryFor(trimmedTitle, trimmedArtist);

    try {
      const { data } = await axios.get<DeezerSearchResponse>(DEEZER_SEARCH_URL, {
        params: { q, limit: SEARCH_LIMIT },
        timeout: 8_000,
      });

      if (data?.error) {
        logger.error("deezer_search_error", { error: data.error });
        return null;
      }

      const match = pickMatch(data?.data ?? [], { title: trimmedTitle, artist: trimmedArtist, durationMs });
      const track = match?.id && match.title ? toDeezerTrack({ ...match, id: match.id }) : null;
      this.cache.set(key, { track, ts: Date.now() });
      return track;
    } catch (err) {
      logger.error("deezer_search_failed", { title: trimmedTitle, artist: trimmedArtist, error: err });
      return null;
    }
  }

  /**
   * Get preview URL for a specific Deezer track ID.
   */
  async getTrackPreview(deezerTrackId: number): Promise<string | null> {
    await this.throttle();
    try {
      const { data } = await axios.get<DeezerSearchItem>(
        `${DEEZER_TRACK_URL}/${deezerTrackId}`,
        { timeout: 8_000 }
      );
      return data?.preview || null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve Deezer previews for a batch of tracks.
   * Returns a Map keyed by "title||artist" (lowercased).
   */
  async resolveBatch(
    tracks: { title: string; artist: string }[]
  ): Promise<Map<string, DeezerTrack>> {
    const results = new Map<string, DeezerTrack>();

    for (const { title, artist } of tracks) {
      const track = await this.searchTrack(title, artist);
      if (track) {
        const key = this.cacheKey(title, artist);
        results.set(key, track);
      }
    }

    return results;
  }
}

export const deezerPreviewService = new DeezerPreviewService();
