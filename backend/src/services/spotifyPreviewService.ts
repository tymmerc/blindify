import axios from "axios";
import { Buffer } from "node:buffer";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TRACK_URL = "https://api.spotify.com/v1/tracks";
const SEARCH_URL = "https://api.spotify.com/v1/search";

export interface SpotifyArtist {
  name: string;
}

export interface SpotifyTrackMetadata {
  id: string;
  name: string;
  preview_url: string | null;
  artists: SpotifyArtist[];
}

interface SpotifyTrackApiResponse {
  id?: string | null;
  name?: string | null;
  preview_url?: string | null;
  artists?: { name?: string | null }[];
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrackApiResponse[];
  };
}

interface SpotifyAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
}

type TokenCache = {
  token: string;
  expiresAt: number;
};

export class SpotifyPreviewError extends Error {
  public readonly statusCode?: number;
  public readonly originalError?: unknown;

  constructor(message: string, statusCode?: number, originalError?: unknown) {
    super(message);
    this.name = "SpotifyPreviewError";
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

export class SpotifyPreviewService {
  private tokenCache?: TokenCache;

  constructor(private readonly clientId: string, private readonly clientSecret: string) {
    if (!clientId || !clientSecret) {
      throw new SpotifyPreviewError("Spotify client credentials are required");
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 5000) {
      return this.tokenCache.token;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const body = new URLSearchParams({ grant_type: "client_credentials" });

    try {
      const { data } = await axios.post<SpotifyAccessTokenResponse>(TOKEN_URL, body.toString(), {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (!data?.access_token) {
        throw new SpotifyPreviewError("Spotify returned an empty access token response");
      }

      const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      this.tokenCache = { token: data.access_token, expiresAt };

      return data.access_token;
    } catch (error) {
      throw this.toSpotifyError("Failed to obtain Spotify access token", error);
    }
  }

  public async getTrackMetadata(trackId: string): Promise<SpotifyTrackMetadata> {
    const sanitizedId = trackId?.trim();
    if (!sanitizedId) {
      throw new SpotifyPreviewError("trackId is required to fetch track metadata");
    }

    const token = await this.getAccessToken();

    try {
      const { data } = await axios.get<SpotifyTrackApiResponse>(`${TRACK_URL}/${encodeURIComponent(sanitizedId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const id = this.clean(data.id);
      const name = this.clean(data.name);
      const artists = (data.artists ?? [])
        .map(artist => this.clean(artist?.name))
        .filter((artistName): artistName is string => Boolean(artistName))
        .map(artistName => ({ name: artistName }));
      const preview_url = data.preview_url ?? null;

      if (!id || !name) {
        throw new SpotifyPreviewError("Incomplete track metadata received from Spotify");
      }

      return { id, name, preview_url, artists };
    } catch (error) {
      throw this.toSpotifyError(`Failed to fetch track metadata for ${sanitizedId}`, error);
    }
  }

  public async getPreviewUrl(trackId: string): Promise<string | null> {
    const track = await this.getTrackMetadata(trackId);

    if (track.preview_url) {
      return track.preview_url;
    }

    const primaryArtist = track.artists[0]?.name;
    const query = [`track:${track.name}`, primaryArtist ? `artist:${primaryArtist}` : ""]
      .filter(Boolean)
      .join(" ");

    try {
      return await this.searchFallback(query);
    } catch (error) {
      throw this.toSpotifyError(`Failed to resolve preview URL via fallback for ${track.id}`, error);
    }
  }

  private async searchFallback(query: string): Promise<string | null> {
    const safeQuery = query.trim();
    if (!safeQuery) {
      throw new SpotifyPreviewError("Fallback search query cannot be empty");
    }

    const token = await this.getAccessToken();
    const params = new URLSearchParams({
      type: "track",
      q: safeQuery,
      limit: "10",
    });

    try {
      const { data } = await axios.get<SpotifySearchResponse>(`${SEARCH_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const tracks = data.tracks?.items ?? [];
      const match = tracks.find(item => Boolean(item.preview_url));

      return match?.preview_url ?? null;
    } catch (error) {
      throw this.toSpotifyError(`Spotify search fallback failed for query "${safeQuery}"`, error);
    }
  }

  private clean(value?: string | null): string | undefined {
    const trimmed = value?.trim();
    return trimmed?.length ? trimmed : undefined;
  }

  private toSpotifyError(message: string, error: unknown): SpotifyPreviewError {
    if (error instanceof SpotifyPreviewError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const apiMessage =
        (typeof error.response?.data === "object" && error.response?.data !== null
          ? (error.response.data as { error?: { message?: string } }).error?.message
          : undefined) ?? error.message;

      return new SpotifyPreviewError(`${message}: ${apiMessage}`, statusCode, error);
    }

    if (error instanceof Error) {
      return new SpotifyPreviewError(`${message}: ${error.message}`, undefined, error);
    }

    return new SpotifyPreviewError(message, undefined, error);
  }
}
