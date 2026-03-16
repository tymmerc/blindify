import axios from "axios";
import { Buffer } from "node:buffer";
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
// Spotify Client Credentials (public data only — no user login needed)
// ---------------------------------------------------------------------------

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyClientToken(): Promise<string> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt - 5_000) {
    return spotifyTokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });

  const { data } = await axios.post<{ access_token?: string; expires_in?: number }>(
    "https://accounts.spotify.com/api/token",
    body.toString(),
    { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );

  if (!data.access_token) throw new Error("Spotify returned empty access token");
  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Fetch Public Playlists
// ---------------------------------------------------------------------------

export async function fetchPublicPlaylists(parsed: ParsedUrl): Promise<PublicPlaylist[]> {
  if (parsed.type === "playlist") {
    return fetchSinglePlaylistInfo(parsed);
  }

  if (parsed.provider === "spotify") {
    return fetchSpotifyUserPlaylists(parsed.id);
  }
  return fetchDeezerUserPlaylists(parsed.id);
}

// --- Spotify ---

async function fetchSinglePlaylistInfo(parsed: ParsedUrl): Promise<PublicPlaylist[]> {
  if (parsed.provider === "spotify") {
    try {
      const token = await getSpotifyClientToken();
      const { data } = await axios.get(`https://api.spotify.com/v1/playlists/${encodeURIComponent(parsed.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: "id,name,tracks.total,images" },
        timeout: 10_000,
      });
      if (!data?.id) return [];
      return [{
        id: data.id,
        name: data.name ?? "Playlist",
        trackCount: data.tracks?.total ?? 0,
        cover: data.images?.[0]?.url ?? null,
      }];
    } catch (err) {
      logger.error("spotify_playlist_info_failed", { id: parsed.id, error: err });
      // Fallback: try to find the playlist on Deezer via oEmbed name
      const name = await getSpotifyPlaylistName(parsed.id);
      if (name) return searchDeezerPlaylist(name);
      return [];
    }
  }

  // Deezer
  try {
    const { data } = await axios.get(`https://api.deezer.com/playlist/${parsed.id}`, { timeout: 10_000 });
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

async function fetchSpotifyUserPlaylists(userId: string): Promise<PublicPlaylist[]> {
  const token = await getSpotifyClientToken();
  const playlists: PublicPlaylist[] = [];
  let cursor: string | null = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists?limit=50`;

  while (cursor && playlists.length < 200) {
    const { data } = await axios.get(cursor, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    }) as { data: { items?: any[]; next?: string | null } };
    for (const item of data?.items ?? []) {
      if (!item?.id) continue;
      playlists.push({
        id: item.id,
        name: item.name ?? "Playlist",
        trackCount: item.tracks?.total ?? 0,
        cover: item.images?.[0]?.url ?? null,
      });
    }
    cursor = data?.next ?? null;
  }

  return playlists;
}

// --- Deezer ---

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

// --- Spotify oEmbed fallback ---

async function getSpotifyPlaylistName(playlistId: string): Promise<string | null> {
  try {
    const { data } = await axios.get("https://open.spotify.com/oembed", {
      params: { url: `https://open.spotify.com/playlist/${playlistId}` },
      timeout: 10_000,
    });
    return data?.title ?? null;
  } catch {
    return null;
  }
}

async function searchDeezerPlaylist(name: string): Promise<PublicPlaylist[]> {
  try {
    const { data } = await axios.get("https://api.deezer.com/search/playlist", {
      params: { q: name, limit: 3 },
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
// Fetch Playlist Tracks
// ---------------------------------------------------------------------------

export async function fetchPlaylistTracks(
  provider: "spotify" | "deezer",
  playlistId: string
): Promise<ImportedTrack[]> {
  if (provider === "spotify") {
    return fetchSpotifyPlaylistTracks(playlistId);
  }
  return fetchDeezerPlaylistTracks(playlistId);
}

async function fetchSpotifyPlaylistTracks(playlistId: string): Promise<ImportedTrack[]> {
  const token = await getSpotifyClientToken();
  const tracks: ImportedTrack[] = [];
  let cursor: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&fields=items(track(id,name,artists,album,duration_ms)),next`;

  while (cursor && tracks.length < 500) {
    const { data } = await axios.get(cursor, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    }) as { data: { items?: any[]; next?: string | null } };
    for (const item of data?.items ?? []) {
      const t = item?.track;
      if (!t?.id || !t.name) continue;
      tracks.push({
        title: t.name,
        artist: (t.artists ?? []).map((a: { name?: string }) => a.name).filter(Boolean).join(", "),
        album: t.album?.name ?? null,
        cover: t.album?.images?.[0]?.url ?? null,
        externalId: t.id,
        provider: "spotify",
        durationMs: t.duration_ms ?? null,
      });
    }
    cursor = data?.next ?? null;
  }

  return tracks;
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
