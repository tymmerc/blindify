import axios from "axios";
import { DEEZER_API } from "../config/deezer";
import { logger } from "../utils/logger";
import { pickMatch, isIsrc, searchQueryFor } from "./previewMatch";
import { isExpiredPreview } from "../utils/previewExpiry";

const DEEZER_SEARCH_URL = `${DEEZER_API}/search`;
const DEEZER_TRACK_URL = `${DEEZER_API}/track`;
const DEEZER_CHART_URL = `${DEEZER_API}/chart/0/tracks`;
// Le classement Deezer (repli des invites) : au plus 50 morceaux, en un appel.
const CHART_MAX = 50;

// Deezer limite a 50 appels par 5 s ; on en garde 40 pour avoir de la marge
// (au-dela, Akamai bloque l'IP du VPS, et ce blocage touche les vrais joueurs).
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX = 40;
// Disjoncteur : sur un quota (code 4), plus aucun appel Deezer pendant 20 s.
const QUOTA_PAUSE_MS = 20_000;

const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour
// Panne reseau ou delai depasse : on retient l'echec peu de temps, pour ne pas
// refaire chaque appel pendant la panne, sans bloquer le morceau une heure.
const ERROR_CACHE_TTL_MS = 30_000;
// Appels HTTP Deezer en vol a la fois, pour tout le process (import, solo
// par lien, solo, salles passent tous par le meme service).
const MAX_IN_FLIGHT = 6;
// Au-dela de 200 demandes en attente d'une place, on refuse tout de suite :
// mieux vaut sauter un morceau que laisser grossir la file sans fin.
const MAX_WAITING = 200;

class QueueFullError extends Error {}
class SuspendedError extends Error {}

/** Vraie reponse JSON de Deezer (un objet), pas une page HTML ni un corps vide. */
const isJsonObject = (data: unknown): data is object =>
  typeof data === "object" && data !== null && !Array.isArray(data);

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

/**
 * found : le morceau (son extrait peut manquer) ; none : Deezer ne le connait
 * pas, ou aucune version sure ; error : Deezer en erreur (quota, panne), on
 * ne peut rien conclure (surtout pas effacer un extrait en base).
 */
export type PreviewOutcome =
  | { status: "found"; track: DeezerTrack }
  | { status: "none" }
  | { status: "error" };

type CacheEntry = { outcome: PreviewOutcome; ts: number; ttlMs: number };

const NONE: PreviewOutcome = { status: "none" };
const ERROR: PreviewOutcome = { status: "error" };

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
  private inFlight = new Map<string, Promise<PreviewOutcome>>();
  private requestTimestamps: number[] = [];
  // File d'attente du debit : chaque appel prend son tour, dans l'ordre.
  private throttleQueue: Promise<void> = Promise.resolve();
  private active = 0;
  private slotWaiters: Array<() => void> = [];
  private suspendedUntil = 0;

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

  /** Au plus MAX_IN_FLIGHT requetes en vol ; la place se passe au suivant. */
  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_IN_FLIGHT) {
      if (this.slotWaiters.length >= MAX_WAITING) throw new QueueFullError("file Deezer pleine");
      await new Promise<void>(resolve => this.slotWaiters.push(resolve));
    } else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.slotWaiters.shift();
      if (next) next();
      else this.active--;
    }
  }

  /** Un GET Deezer : une place parmi les 6, puis son tour dans le debit. */
  private request<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    this.assertNotSuspended();
    return this.withSlot(async () => {
      await this.throttle();
      this.assertNotSuspended(); // le disjoncteur a pu sauter pendant l'attente
      const { data } = await axios.get<T>(url, { ...(params ? { params } : {}), timeout: 8_000 });
      const code = (data as { error?: { code?: number } } | null)?.error?.code;
      if (code === 4) this.suspendedUntil = this.clock.now() + QUOTA_PAUSE_MS;
      return data;
    });
  }

  private assertNotSuspended(): void {
    if (this.clock.now() < this.suspendedUntil) throw new SuspendedError("Deezer en pause (quota)");
  }

  /** Une seule requete par cle a la fois : les demandes identiques attendent la meme. */
  private dedupe(key: string, run: () => Promise<PreviewOutcome>): Promise<PreviewOutcome> {
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const p = run().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private cacheKey(title: string, artist?: string): string {
    return `${title.toLowerCase().trim()}||${(artist ?? "").toLowerCase().trim()}`;
  }

  private getCached(key: string): PreviewOutcome | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    const expiredPreview = entry.outcome.status === "found" && isExpiredPreview(entry.outcome.track.preview);
    // Trop vieux, ou extrait expire (les URL Deezer vivent ~15 min) : on oublie.
    if (this.clock.now() - entry.ts > entry.ttlMs || expiredPreview) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.outcome;
  }

  private setCached(key: string, outcome: PreviewOutcome, ttlMs = CACHE_TTL_MS): PreviewOutcome {
    this.cache.set(key, { outcome, ts: this.clock.now(), ttlMs });
    return outcome;
  }

  /**
   * L'extrait du bon enregistrement : par identifiant Deezer, puis par ISRC,
   * puis par recherche de titre (qui refuse toute autre version). "none" si
   * rien de sur : le morceau sera saute plutot que joue dans une autre version.
   * Deezer en erreur (quota, panne) : "error" tout de suite, sans recherche en
   * plus, pour ne pas charger davantage un service qui sature.
   */
  async resolvePreviewOutcome(query: PreviewQuery): Promise<PreviewOutcome> {
    const deezerId = query.deezerId && /^\d{1,15}$/.test(query.deezerId) ? query.deezerId : null;
    if (deezerId) {
      const byId = await this.fetchExact(`id:${deezerId}`, `${DEEZER_TRACK_URL}/${deezerId}`);
      if (byId.status === "error") return byId;
      if (byId.status === "found" && byId.track.preview) return byId;
    }
    if (isIsrc(query.isrc)) {
      const isrc = query.isrc.toUpperCase();
      const byIsrc = await this.fetchExact(`isrc:${isrc}`, `${DEEZER_TRACK_URL}/isrc:${isrc}`);
      if (byIsrc.status === "error") return byIsrc;
      if (byIsrc.status === "found" && byIsrc.track.preview && closeDuration(byIsrc.track, query.durationMs)) return byIsrc;
    }
    return this.searchOutcome(query.title, query.artist, query.durationMs);
  }

  /** Comme resolvePreviewOutcome, sans distinguer "rien" et "erreur". */
  async resolvePreview(query: PreviewQuery): Promise<DeezerTrack | null> {
    const outcome = await this.resolvePreviewOutcome(query);
    return outcome.status === "found" ? outcome.track : null;
  }

  /** Un morceau precis (/track/<id> ou /track/isrc:<ISRC>). */
  private async fetchExact(key: string, url: string): Promise<PreviewOutcome> {
    const cached = this.getCached(key);
    if (cached !== undefined) return cached;
    return this.dedupe(key, async () => {
      try {
        const data = await this.request<DeezerTrackResponse>(url);
        if (!isJsonObject(data)) {
          // Page HTML (blocage Akamai) ou corps vide : surtout pas "inconnu".
          logger.error("deezer_track_lookup_error", { key, error: "reponse non JSON" });
          return this.setCached(key, ERROR, ERROR_CACHE_TTL_MS);
        }
        if (data.error && data.error.code !== 800) {
          // Quota (code 4) ou autre : retenu 30 s, comme une panne, pour ne pas insister.
          logger.error("deezer_track_lookup_error", { key, error: data.error });
          return this.setCached(key, ERROR, ERROR_CACHE_TTL_MS);
        }
        // Erreur 800 "no data", ou pas de morceau : Deezer ne le connait pas, on retient le non.
        const found = !data.error && data.id && data.readable !== false;
        return this.setCached(key, found ? { status: "found", track: toDeezerTrack({ ...data, id: data.id as number }) } : NONE);
      } catch (err) {
        // File pleine ou disjoncteur : refus immediat, rien en cache.
        if (err instanceof QueueFullError || err instanceof SuspendedError) return ERROR;
        logger.error("deezer_track_lookup_failed", { key, error: err });
        return this.setCached(key, ERROR, ERROR_CACHE_TTL_MS);
      }
    });
  }

  /**
   * Search Deezer for a track by title and optional artist.
   * Returns the best match or null.
   */
  async searchTrack(title: string, artist?: string, durationMs?: number | null): Promise<DeezerTrack | null> {
    const outcome = await this.searchOutcome(title, artist, durationMs);
    return outcome.status === "found" ? outcome.track : null;
  }

  private async searchOutcome(title: string, artist?: string, durationMs?: number | null): Promise<PreviewOutcome> {
    const trimmedTitle = title?.trim();
    if (!trimmedTitle) return NONE;
    const trimmedArtist = artist?.trim() || undefined;

    const key = `${this.cacheKey(trimmedTitle, trimmedArtist)}||${durationMs ? Math.round(durationMs / 1000) : ""}`;
    const cached = this.getCached(key);
    if (cached !== undefined) return cached;

    return this.dedupe(key, () => this.runSearch(key, trimmedTitle, trimmedArtist, durationMs));
  }

  private async runSearch(key: string, trimmedTitle: string, trimmedArtist: string | undefined, durationMs?: number | null): Promise<PreviewOutcome> {
    // Recherche en texte libre. La syntaxe avancee (`track:"..." artist:"..."`)
    // renvoie 0 resultat depuis le 02/10/2026 (filtre artist casse chez Deezer) :
    // plus aucun extrait, le solo par lien ne demarrait plus. Le bon morceau est
    // ensuite choisi par pickMatch, jamais "le premier venu".
    const q = searchQueryFor(trimmedTitle, trimmedArtist);

    try {
      const data = await this.request<DeezerSearchResponse>(DEEZER_SEARCH_URL, { q, limit: SEARCH_LIMIT });

      if (!isJsonObject(data) || data.error || !Array.isArray(data.data)) {
        // Quota, page HTML, corps vide ou sans resultats lisibles : erreur, retenue 30 s.
        logger.error("deezer_search_error", { error: isJsonObject(data) ? data.error ?? "reponse sans data" : "reponse non JSON" });
        return this.setCached(key, ERROR, ERROR_CACHE_TTL_MS);
      }

      const match = pickMatch(data.data, { title: trimmedTitle, artist: trimmedArtist, durationMs });
      return this.setCached(key, match?.id && match.title ? { status: "found", track: toDeezerTrack({ ...match, id: match.id }) } : NONE);
    } catch (err) {
      // File pleine ou disjoncteur : refus immediat, rien en cache.
      if (err instanceof QueueFullError || err instanceof SuspendedError) return ERROR;
      logger.error("deezer_search_failed", { title: trimmedTitle, artist: trimmedArtist, error: err });
      return this.setCached(key, ERROR, ERROR_CACHE_TTL_MS);
    }
  }

  /**
   * Le classement Deezer du moment, morceaux avec extrait seulement. Repli des
   * invites sans musique, a la place du top iTunes (Apple reserve ses extraits
   * a la promotion du store : docs/CONDITIONS-API-MUSIQUE.md). Un seul appel,
   * par la file et le debit communs ; en cas d'erreur, liste vide.
   */
  async fetchChartTracks(limit: number): Promise<DeezerTrack[]> {
    const capped = Math.max(5, Math.min(limit, CHART_MAX));
    try {
      const data = await this.request<DeezerSearchResponse>(DEEZER_CHART_URL, { limit: capped });
      if (!isJsonObject(data) || data.error || !Array.isArray(data.data)) {
        logger.error("deezer_chart_error", { error: isJsonObject(data) ? data.error ?? "reponse sans data" : "reponse non JSON" });
        return [];
      }
      return data.data
        .filter((it): it is DeezerSearchItem & { id: number } => typeof it.id === "number" && !!it.title && !!it.preview)
        .slice(0, capped)
        .map(toDeezerTrack);
    } catch (err) {
      if (!(err instanceof QueueFullError || err instanceof SuspendedError)) logger.error("deezer_chart_failed", { error: err });
      return [];
    }
  }

  /**
   * Get preview URL for a specific Deezer track ID.
   */
  async getTrackPreview(deezerTrackId: number): Promise<string | null> {
    try {
      const data = await this.request<DeezerSearchItem>(`${DEEZER_TRACK_URL}/${deezerTrackId}`);
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
