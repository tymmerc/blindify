import axios from "axios";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// URL Parsing
// ---------------------------------------------------------------------------

export interface ParsedUrl {
  provider: "spotify" | "deezer";
  type: "user" | "playlist";
  id: string;
}

/**
 * Parse a Spotify or Deezer profile/playlist URL.
 *
 * Supported formats:
 *   https://open.spotify.com/user/{userId}
 *   https://open.spotify.com/playlist/{playlistId}
 *   https://www.deezer.com/profile/{userId}
 *   https://www.deezer.com/fr/profile/{userId}
 *   https://www.deezer.com/playlist/{playlistId}
 *   https://www.deezer.com/fr/playlist/{playlistId}
 */
export function parseProfileUrl(raw: string): ParsedUrl | null {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  // Spotify
  if (host === "open.spotify.com") {
    if (segments[0] === "user" && segments[1]) {
      return { provider: "spotify", type: "user", id: decodeURIComponent(segments[1]) };
    }
    if (segments[0] === "playlist" && segments[1]) {
      return { provider: "spotify", type: "playlist", id: decodeURIComponent(segments[1]) };
    }
    return null;
  }

  // Deezer — may have locale prefix like /fr/
  if (host === "deezer.com") {
    const filtered = segments.filter(s => !/^[a-z]{2}$/.test(s));
    if (filtered[0] === "profile" && filtered[1]) {
      return { provider: "deezer", type: "user", id: filtered[1] };
    }
    if (filtered[0] === "playlist" && filtered[1]) {
      return { provider: "deezer", type: "playlist", id: filtered[1] };
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PublicPlaylist {
  id: string;
  name: string;
  trackCount: number;
  cover: string | null;
}

export interface ImportedTrack {
  title: string;
  artist: string;
  album: string | null;
  cover: string | null;
  externalId: string;
  provider: "spotify" | "deezer";
  durationMs: number | null;
}

// ---------------------------------------------------------------------------
// Spotify → Deezer bridge (no Spotify API credentials needed)
// ---------------------------------------------------------------------------

/**
 * Get playlist name from Spotify oEmbed API (free, no auth).
 */
async function getSpotifyPlaylistName(playlistId: string): Promise<string | null> {
  try {
    const { data } = await axios.get("https://open.spotify.com/oembed", {
      params: { url: `https://open.spotify.com/playlist/${playlistId}` },
      timeout: 10_000,
    });
    return data?.title ?? null;
  } catch (err) {
    logger.error("spotify_oembed_failed", { playlistId, error: err });
    return null;
  }
}

/**
 * Search Deezer for a playlist by name.
 */
async function searchDeezerPlaylist(name: string): Promise<PublicPlaylist[]> {
  try {
    const { data } = await axios.get("https://api.deezer.com/search/playlist", {
      params: { q: name, limit: 5 },
      timeout: 10_000,
    });
    if (data?.error || !data?.data) return [];
    return (data.data as any[])
      .filter((p: any) => p?.id && p?.nb_tracks > 0)
      .map((p: any) => ({
        id: String(p.id),
        name: p.title ?? "Playlist",
        trackCount: p.nb_tracks ?? 0,
        cover: p.picture_medium ?? null,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fetch Public Playlists (all via Deezer API — free, no auth)
// ---------------------------------------------------------------------------

export async function fetchPublicPlaylists(parsed: ParsedUrl): Promise<PublicPlaylist[]> {
  if (parsed.provider === "deezer") {
    if (parsed.type === "playlist") {
      return fetchDeezerSinglePlaylist(parsed.id);
    }
    return fetchDeezerUserPlaylists(parsed.id);
  }

  // Spotify URLs — bridge through Deezer
  if (parsed.type === "playlist") {
    // Get playlist name via oEmbed, then search on Deezer
    const name = await getSpotifyPlaylistName(parsed.id);
    if (!name) return [];
    const results = await searchDeezerPlaylist(name);
    // Return best match (first result)
    return results.slice(0, 1);
  }

  // Spotify user profile — not possible without Spotify API
  // Return empty with a log so the controller can return a helpful error
  logger.info("spotify_user_not_supported", { userId: parsed.id });
  return [];
}

// ---------------------------------------------------------------------------
// Deezer API (free, no credentials needed)
// ---------------------------------------------------------------------------

async function fetchDeezerSinglePlaylist(playlistId: string): Promise<PublicPlaylist[]> {
  try {
    const { data } = await axios.get(`https://api.deezer.com/playlist/${playlistId}`, { timeout: 10_000 });
    if (data?.error || !data?.id) return [];
    return [{
      id: String(data.id),
      name: data.title ?? "Playlist",
      trackCount: data.nb_tracks ?? 0,
      cover: data.picture_medium ?? null,
    }];
  } catch {
    return [];
  }
}

async function fetchDeezerUserPlaylists(userId: string): Promise<PublicPlaylist[]> {
  const playlists: PublicPlaylist[] = [];
  let cursor: string | null = `https://api.deezer.com/user/${encodeURIComponent(userId)}/playlists?limit=100`;

  while (cursor && playlists.length < 200) {
    try {
      const { data } = await axios.get(cursor, { timeout: 10_000 }) as { data: { data?: any[]; error?: any; next?: string | null } };
      if (data?.error) break;
      for (const item of data?.data ?? []) {
        if (!item?.id) continue;
        playlists.push({
          id: String(item.id),
          name: item.title ?? "Playlist",
          trackCount: item.nb_tracks ?? 0,
          cover: item.picture_medium ?? null,
        });
      }
      cursor = data?.next ?? null;
    } catch {
      break;
    }
  }

  return playlists;
}

// ---------------------------------------------------------------------------
// Fetch Playlist Tracks (always via Deezer)
// ---------------------------------------------------------------------------

export async function fetchPlaylistTracks(
  _provider: "spotify" | "deezer",
  playlistId: string
): Promise<ImportedTrack[]> {
  // All playlists are now resolved to Deezer IDs
  return fetchDeezerPlaylistTracks(playlistId);
}

async function fetchDeezerPlaylistTracks(playlistId: string): Promise<ImportedTrack[]> {
  const tracks: ImportedTrack[] = [];
  let cursor: string | null = `https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}/tracks?limit=100`;

  while (cursor && tracks.length < 500) {
    try {
      const { data } = await axios.get(cursor, { timeout: 15_000 }) as { data: { data?: any[]; error?: any; next?: string | null } };
      if (data?.error) break;
      for (const item of data?.data ?? []) {
        if (!item?.id || !item.title) continue;
        tracks.push({
          title: item.title,
          artist: item.artist?.name ?? "",
          album: item.album?.title ?? null,
          cover: item.album?.cover_medium ?? item.album?.cover_big ?? null,
          externalId: String(item.id),
          provider: "deezer",
          durationMs: item.duration ? item.duration * 1000 : null,
        });
      }
      cursor = data?.next ?? null;
    } catch {
      break;
    }
  }

  return tracks;
}
