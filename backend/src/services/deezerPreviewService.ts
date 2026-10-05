import axios from "axios";
import { DEEZER_API } from "../config/deezer";
import { logger } from "../utils/logger";
import { providerBudget } from "./providerBudget";

const DEEZER_SEARCH_URL = `${DEEZER_API}/search`;
const DEEZER_TRACK_URL = `${DEEZER_API}/track`;

const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

export interface DeezerTrack {
  id: number;
  title: string;
  artist: string;
  preview: string | null;
  albumCover: string | null;
  duration: number;
}

interface DeezerSearchItem {
  id?: number;
  title?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string };
  preview?: string;
  duration?: number;
}

interface DeezerSearchResponse {
  data?: DeezerSearchItem[];
  error?: { type?: string; message?: string; code?: number };
}

type CacheEntry = { track: DeezerTrack | null; ts: number };

/** Minuscules, sans accents, sans "(...)" ni "[...]" ni " - Remastered ...". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s-\s.*$/, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Le bon morceau parmi les resultats : meme titre (a la normalisation pres), et
 * de preference le bon artiste et un extrait. Aucun resultat au bon titre :
 * null. Jouer un autre morceau que celui affiche fausserait la manche.
 */
function pickMatch(items: DeezerSearchItem[], title: string, artist?: string): DeezerSearchItem | null {
  const wantTitle = normalize(title);
  if (!wantTitle) return null;
  // "The Weeknd, Rosalia" ou "A feat. B" : chaque artiste compte.
  const wantArtists = (artist ?? "")
    .split(/,|&|\bfeat\.?|\bft\.?|\bx\b/i)
    .map(normalize)
    .filter(Boolean);
  const sameTitle = items.filter(i => i.id && i.title && normalize(i.title) === wantTitle);
  const sameArtist = (i: DeezerSearchItem) => {
    const got = normalize(i.artist?.name ?? "");
    return wantArtists.length === 0 || wantArtists.some(a => got.includes(a) || a.includes(got));
  };
  return (
    sameTitle.find(i => sameArtist(i) && i.preview) ??
    sameTitle.find(i => sameArtist(i)) ??
    (wantArtists.length === 0 ? sameTitle.find(i => i.preview) ?? sameTitle[0] : undefined) ??
    null
  );
}

export class DeezerPreviewService {
  private cache = new Map<string, CacheEntry>();

  /**
   * Quota de Deezer (50 appels par 5 s), commun a tout le processus : les
   * imports passent par la meme garde (services/providerBudget.ts), et les
   * appels des parties y comptent, ce qui fait reculer les imports d'abord.
   * Avant, ce compteur etait propre a ce service : les imports n'y figuraient
   * pas, et des appels simultanes pouvaient repartir ensemble apres l'attente.
   */
  private async throttle(): Promise<void> {
    await providerBudget.pace("deezer");
  }

  private cacheKey(title: string, artist?: string): string {
    return `${title.toLowerCase().trim()}||${(artist ?? "").toLowerCase().trim()}`;
  }

  private getCached(key: string): DeezerTrack | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.track;
  }

  /**
   * Search Deezer for a track by title and optional artist.
   * Returns the best match or null.
   */
  async searchTrack(title: string, artist?: string): Promise<DeezerTrack | null> {
    const trimmedTitle = title?.trim();
    if (!trimmedTitle) return null;
    const trimmedArtist = artist?.trim() || undefined;

    const key = this.cacheKey(trimmedTitle, trimmedArtist);
    const cached = this.getCached(key);
    if (cached !== undefined) return cached;

    await this.throttle();

    // Recherche en texte libre. La syntaxe avancee (`track:"..." artist:"..."`)
    // renvoie 0 resultat depuis le 02/10/2026 (filtre artist casse chez Deezer) :
    // plus aucun extrait, le solo par lien ne demarrait plus. Le bon morceau est
    // ensuite choisi par pickMatch, jamais "le premier venu".
    // Sans les mentions de version ("- Remastered 2011", "(Radio Edit)") qui
    // brouillent la recherche libre de Deezer ; pickMatch les ignore aussi.
    const searchTitle = trimmedTitle.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s-\s.*$/, "").replace(/\s+/g, " ").trim() || trimmedTitle;
    const q = trimmedArtist ? `${searchTitle} ${trimmedArtist}` : searchTitle;

    try {
      const { data } = await axios.get<DeezerSearchResponse>(DEEZER_SEARCH_URL, {
        params: { q, limit: 5 },
        timeout: 8_000,
      });

      if (data?.error) {
        logger.error("deezer_search_error", { error: data.error });
        return null;
      }

      const match = pickMatch(data?.data ?? [], trimmedTitle, trimmedArtist);

      if (!match?.id || !match.title) {
        this.cache.set(key, { track: null, ts: Date.now() });
        return null;
      }

      const track: DeezerTrack = {
        id: match.id,
        title: match.title,
        artist: match.artist?.name ?? "",
        preview: match.preview || null,
        albumCover: match.album?.cover_big ?? match.album?.cover_medium ?? null,
        duration: match.duration ?? 0,
      };

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
