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
  id?: string;
  name?: string;
  preview_url?: string | null;
  artists?: { name?: string | null }[];
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrackApiResponse[];
  };
}

interface SpotifyAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
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

    try {
      const { data } = await axios.post<SpotifyAccessTokenResponse>(
        TOKEN_URL,
        new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      this.tokenCache = { token: data.access_token, expiresAt };

      return data.access_token;
    } catch (error) {
      throw this.toSpotifyError("Failed to obtain Spotify access token", error);
    }
  }

  public async getTrackMetadata(trackId: string): Promise<SpotifyTrackMetadata> {
    if (!trackId) {
      throw new SpotifyPreviewError("trackId is required to fetch track metadata");
    }

    const token = await this.getAccessToken();

    try {
      const { data } = await axios.get<SpotifyTrackApiResponse>(`${TRACK_URL}/${encodeURIComponent(trackId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const name = data.name?.trim();
      const id = data.id?.trim();
      const artists = (data.artists ?? [])
        .map(artist => artist?.name?.trim())
        .filter((artistName): artistName is string => Boolean(artistName))
        .map(artistName => ({ name: artistName }));

      if (!id || !name) {
        throw new SpotifyPreviewError("Incomplete track metadata received from Spotify");
      }

      return {
        id,
        name,
        preview_url: data.preview_url ?? null,
        artists,
      };
    } catch (error) {
      throw this.toSpotifyError(`Failed to fetch track metadata for ${trackId}`, error);
    }
  }

  public async getPreviewUrl(trackId: string): Promise<string | null> {
    const track = await this.getTrackMetadata(trackId);

    if (track.preview_url) {
      return track.preview_url;
    }

    const artistNames = track.artists.map(artist => artist.name).filter(Boolean);
    const querySegments: string[] = [];

    if (track.name) {
      querySegments.push(`track:${track.name}`);
    }

    if (artistNames.length) {
      querySegments.push(`artist:${artistNames.join(" ")}`);
    }

    const query = querySegments.join(" ");

    if (!query) {
      return null;
    }

    try {
      return await this.searchFallback(query);
    } catch (error) {
      throw this.toSpotifyError(`Failed to resolve preview URL via fallback for ${trackId}`, error);
    }
  }

  private async searchFallback(query: string): Promise<string | null> {
    if (!query.trim()) {
      throw new SpotifyPreviewError("Fallback search query cannot be empty");
    }

    const token = await this.getAccessToken();
    const params = new URLSearchParams({
      type: "track",
      q: query,
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
      throw this.toSpotifyError(`Spotify search fallback failed for query "${query}"`, error);
    }
  }

  private toSpotifyError(message: string, error: unknown): SpotifyPreviewError {
    if (error instanceof SpotifyPreviewError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const detail =
        (typeof error.response?.data === "object" && error.response?.data !== null
          ? (error.response.data as { error?: { message?: string } }).error?.message
          : undefined) ?? error.message;

      return new SpotifyPreviewError(`${message}: ${detail}`, statusCode, error);
    }

    if (error instanceof Error) {
      return new SpotifyPreviewError(`${message}: ${error.message}`, undefined, error);
    }

    return new SpotifyPreviewError(message, undefined, error);
  }
}
