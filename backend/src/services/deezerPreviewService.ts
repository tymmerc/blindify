import axios from "axios";

const DEEZER_SEARCH_URL = "https://api.deezer.com/search";
const DEEZER_TRACK_URL = "https://api.deezer.com/track";

// Deezer rate limit: 50 requests per 5 seconds
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX = 50;

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

export class DeezerPreviewService {
  private cache = new Map<string, CacheEntry>();
  private requestTimestamps: number[] = [];

  /** Throttle requests to stay within Deezer rate limits. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < RATE_LIMIT_WINDOW_MS
    );
    if (this.requestTimestamps.length >= RATE_LIMIT_MAX) {
      const oldest = this.requestTimestamps[0];
      const waitMs = RATE_LIMIT_WINDOW_MS - (now - oldest) + 50;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    this.requestTimestamps.push(Date.now());
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

    // Build search query
    const queryParts: string[] = [];
    queryParts.push(`track:"${trimmedTitle}"`);
    if (trimmedArtist) {
      queryParts.push(`artist:"${trimmedArtist}"`);
    }
    const q = queryParts.join(" ");

    try {
      const { data } = await axios.get<DeezerSearchResponse>(DEEZER_SEARCH_URL, {
        params: { q, limit: 5 },
        timeout: 8_000,
      });

      if (data?.error) {
        console.error("deezer_search_error", data.error);
        return null;
      }

      const items = data?.data ?? [];
      // Prefer items with a preview URL
      const match = items.find(i => Boolean(i.preview)) ?? items[0] ?? null;

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
      console.error("deezer_search_failed", { title: trimmedTitle, artist: trimmedArtist, err });
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
