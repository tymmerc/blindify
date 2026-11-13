import axios from "axios";
import { DEEZER_API } from "../config/deezer";
import { Buffer } from "node:buffer";
import { logger } from "../utils/logger";
import { isDeezerId, isSpotifyId } from "../utils/providerIds";
import { isIsrc } from "./previewMatch";
import { ShortLinkError, normalizeShortLink, resolveShortLink, type ResolveOptions } from "./shortLinkResolver";
import {
  examinedFor,
  fetchYoutubePlaylistInfo,
  fetchYoutubeVideos,
  isYoutubeHost,
  matchYoutubeVideos,
  youtubePlaylistId,
  type YoutubeMatchReport,
} from "./youtubeImportService";

// ---------------------------------------------------------------------------
// URL Parsing
// ---------------------------------------------------------------------------

export type ImportProvider = "spotify" | "deezer" | "youtube";

export interface ParsedUrl {
  provider: ImportProvider;
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
 *   https://www.youtube.com/playlist?list={id}, music.youtube.com, youtu.be/...?list= (youtubeImportService)
 */
export function parseProfileUrl(raw: string): ParsedUrl | null {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // Web links only: with a non-special scheme (x://, javascript://) a "\" stays
  // in the pathname, and axios later turns it into "/" (path traversal on the API).
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  if (isYoutubeHost(url)) {
    const id = youtubePlaylistId(url);
    return id ? { provider: "youtube", type: "playlist", id } : null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  // Spotify
  if (host === "open.spotify.com") {
    const id = segments[1] ? safeDecodeURIComponent(segments[1]) : null;
    if (segments[0] === "user" && id) {
      return { provider: "spotify", type: "user", id };
    }
    if (segments[0] === "playlist" && isSpotifyId(id)) {
      return { provider: "spotify", type: "playlist", id };
    }
    return null;
  }

  // Deezer — may have locale prefix like /fr/
  if (host === "deezer.com") {
    const filtered = segments.filter(s => !/^[a-z]{2}$/.test(s));
    if (filtered[0] === "profile" && isDeezerId(filtered[1])) {
      return { provider: "deezer", type: "user", id: filtered[1] };
    }
    if (filtered[0] === "playlist" && isDeezerId(filtered[1])) {
      return { provider: "deezer", type: "playlist", id: filtered[1] };
    }
    return null;
  }

  return null;
}

export interface ResolvedProfileLink {
  parsed: ParsedUrl;
  /** L'adresse longue : celle collee, ou l'arrivee du lien court. */
  url: string;
}

/**
 * parseProfileUrl, en ouvrant d'abord un lien court des applis
 * (link.deezer.com, spotify.link...) : une seule resolution par appel. null
 * pour un lien non reconnu ; ShortLinkError si le lien court n'aboutit pas a
 * une playlist ou un profil.
 */
export async function parseProfileLink(raw: string, options?: ResolveOptions): Promise<ResolvedProfileLink | null> {
  const trimmed = raw.trim();
  // Lien court, au besoin passe en https (normalizeShortLink).
  const short = normalizeShortLink(trimmed);
  if (short === null) {
    const parsed = parseProfileUrl(trimmed);
    if (!parsed) return null;
    return { parsed, url: parsed.provider === "youtube" ? canonicalYoutubeUrl(trimmed, parsed.id) : trimmed };
  }
  const arrival = await resolveShortLink(short, options);
  const parsed = parseProfileUrl(arrival);
  if (!parsed) throw new ShortLinkError("not_a_playlist");
  logger.info("short_link_resolved", { from: new URL(short).hostname, provider: parsed.provider, type: parsed.type });
  // La requete de l'arrivee ne porte que des parametres de partage (si= rattache
  // a celui qui partage, utm_*, _branch_match_id, host=...) : on ne les garde pas.
  const kept = new URL(arrival);
  kept.search = "";
  kept.hash = "";
  return { parsed, url: kept.toString() };
}

/**
 * L'adresse gardee pour une playlist YouTube : la liste seule, sans la video
 * ni le ?si= du partage. YouTube Music reste YouTube Music.
 */
function canonicalYoutubeUrl(raw: string, listId: string): string {
  const music = /^(https?:\/\/)?music\.youtube\.com\//i.test(raw.trim());
  return `https://${music ? "music" : "www"}.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
}

// A broken escape ("%E0%A4%A") makes decodeURIComponent throw; callers run
// parseProfileUrl outside any try, so the request would hang instead of failing.
function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
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
  /** D'ou vient le morceau quand ce n'est pas son fournisseur (playlist YouTube retrouvee chez Deezer). */
  importSource?: "youtube";
  /** Identifiant de l'enregistrement (Spotify) : retrouve l'extrait exact sur Deezer. */
  isrc?: string | null;
}

// ---------------------------------------------------------------------------
// Spotify Client Credentials (public data only — no user login needed)
// ---------------------------------------------------------------------------

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

export async function getSpotifyClientToken(): Promise<string> {
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
    { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10_000 }
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
  if (parsed.provider === "youtube") {
    // Leve YoutubeImportError (privee, introuvable, mix...) : le message va au joueur.
    const info = await fetchYoutubePlaylistInfo(parsed.id);
    return [{ id: info.id, name: info.name, trackCount: info.itemCount, cover: info.cover }];
  }
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
      // Privee ou supprimee : rien a importer.
      if ((err as { response?: { status?: number } } | null)?.response?.status === 404) return [];
      // Spotify lent ou en panne (503, delai) : on garde la playlist du joueur,
      // l'import des titres retentera. Avant, on cherchait une playlist du meme
      // nom chez Deezer (celle d'un inconnu), rendue sous le fournisseur
      // « spotify » : l'import partait en 400 (soiree du 12/11, T37).
      const name = await getSpotifyPlaylistName(parsed.id);
      return [{ id: parsed.id, name: name ?? "Playlist", trackCount: 0, cover: null }];
    }
  }

  // Deezer
  try {
    const { data } = await axios.get(`${DEEZER_API}/playlist/${encodeURIComponent(parsed.id)}`, { timeout: 10_000 });
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
  let cursor: string | null = `${DEEZER_API}/user/${encodeURIComponent(userId)}/playlists?limit=100`;

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

// ---------------------------------------------------------------------------
// Fetch Playlist Tracks
// ---------------------------------------------------------------------------

export interface YoutubeImport {
  tracks: ImportedTrack[];
  report: YoutubeMatchReport;
}

/**
 * Les morceaux d'une playlist YouTube retrouves chez Deezer : ce sont des
 * morceaux Deezer (titre, artiste et pochette de Deezer), rien de YouTube.
 * `requested` : titres demandes par playlist ; on regarde au moins 50 videos.
 */
export async function fetchYoutubeTracks(playlistId: string, requested?: number): Promise<YoutubeImport> {
  const videos = await fetchYoutubeVideos(playlistId);
  const { tracks, report } = await matchYoutubeVideos(videos, examinedFor(requested));
  return {
    report,
    tracks: tracks.map(t => ({
      title: t.title,
      artist: t.artist,
      album: null,
      cover: t.albumCover,
      externalId: String(t.id),
      provider: "deezer",
      durationMs: t.duration ? t.duration * 1000 : null,
      importSource: "youtube",
    })),
  };
}

export async function fetchPlaylistTracks(
  provider: ImportProvider,
  playlistId: string,
  maxTracks?: number,
): Promise<ImportedTrack[]> {
  if (provider === "youtube") return (await fetchYoutubeTracks(playlistId, maxTracks)).tracks;
  return (await fetchPlaylistTracksChecked(provider, playlistId, maxTracks)).tracks;
}

/** Plafond de titres lus par playlist. */
export const PLAYLIST_TRACKS_MAX = 500;

export interface CheckedTracks {
  tracks: ImportedTrack[];
  /** Faux si une page n'a pas pu etre lue : la liste peut manquer des titres. */
  complete: boolean;
}

/**
 * Les titres d'une playlist Spotify ou Deezer, en disant si tout a ete lu
 * (jusqu'a `maxTracks`). Spotify leve a la moindre page en echec ; Deezer rend
 * ce qu'il a lu.
 */
export async function fetchPlaylistTracksChecked(
  provider: "spotify" | "deezer",
  playlistId: string,
  maxTracks?: number,
): Promise<CheckedTracks> {
  const limit = maxTracks ?? PLAYLIST_TRACKS_MAX;
  if (provider === "spotify") {
    return { tracks: await fetchSpotifyPlaylistTracks(playlistId, limit), complete: true };
  }
  return fetchDeezerPlaylistTracks(playlistId, limit);
}

async function fetchSpotifyPlaylistTracks(playlistId: string, maxTracks = 500): Promise<ImportedTrack[]> {
  const token = await getSpotifyClientToken();
  const tracks: ImportedTrack[] = [];
  const pageSize = Math.min(maxTracks, 100);
  let cursor: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${pageSize}&fields=items(track(id,name,artists,album,duration_ms,external_ids(isrc))),next`;

  while (cursor && tracks.length < maxTracks) {
    const { data } = await axios.get(cursor, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    }) as { data: { items?: any[]; next?: string | null } };
    for (const item of data?.items ?? []) {
      if (tracks.length >= maxTracks) break;
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
        isrc: isIsrc(t.external_ids?.isrc) ? t.external_ids.isrc : null,
      });
    }
    cursor = data?.next ?? null;
  }

  return tracks;
}

async function fetchDeezerPlaylistTracks(playlistId: string, maxTracks: number): Promise<CheckedTracks> {
  const tracks: ImportedTrack[] = [];
  let complete = true;
  const pageSize = Math.min(maxTracks, 100);
  let cursor: string | null = `${DEEZER_API}/playlist/${encodeURIComponent(playlistId)}/tracks?limit=${pageSize}`;

  while (cursor && tracks.length < maxTracks) {
    try {
      const { data } = await axios.get(cursor, { timeout: 15_000 }) as { data: { data?: any[]; error?: any; next?: string | null } };
      if (data?.error) {
        complete = false;
        break;
      }
      for (const item of data?.data ?? []) {
        if (tracks.length >= maxTracks) break;
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
      complete = false;
      break;
    }
  }

  return { tracks, complete };
}
