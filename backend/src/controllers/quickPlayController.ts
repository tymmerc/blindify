import type { Request, Response } from "express";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";
import {
  parseProfileUrl,
  fetchPublicPlaylists,
  fetchPlaylistTracks,
  type ImportedTrack,
} from "../services/profileImportService";
import { deezerPreviewService } from "../services/deezerPreviewService";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick `count` random tracks across the given playlists.
 * Spreads evenly: pick a few tracks from each playlist rather than
 * exhausting one before moving to the next.
 */
async function pickRandomTracks(
  provider: "spotify" | "deezer",
  playlistIds: string[],
  count: number,
): Promise<ImportedTrack[]> {
  if (playlistIds.length === 0) return [];

  // Fetch tracks from a random subset of playlists (max 6 to stay fast)
  const selectedPlaylists = shuffle(playlistIds).slice(0, 6);

  const allTracks: ImportedTrack[] = [];
  for (const pid of selectedPlaylists) {
    try {
      const tracks = await fetchPlaylistTracks(provider, pid);
      allTracks.push(...tracks);
    } catch (err) {
      logger.error("quick_play_fetch_failed", { pid, error: err });
    }
  }

  if (allTracks.length === 0) return [];

  // Deduplicate by externalId
  const seen = new Set<string>();
  const unique = allTracks.filter(t => {
    const key = `${t.provider}:${t.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return shuffle(unique).slice(0, count * 3); // overshoot — we'll filter by preview availability
}

export const quickPlayController = {
  /**
   * POST /api/quick-play
   * Body: { url: string, count?: number }
   *
   * No auth required. Fetches public playlists from a profile/playlist URL,
   * picks random tracks, resolves Deezer previews, and returns ready-to-play tracks.
   */
  async start(req: Request, res: Response): Promise<void> {
    const { url, count: rawCount } = req.body as { url?: string; count?: number };

    if (!url || typeof url !== "string") {
      fail(res, "invalid_url", "URL manquante ou invalide.");
      return;
    }

    const count = Math.min(Math.max(Number(rawCount) || 10, 5), 25);

    const parsed = parseProfileUrl(url.trim());
    if (!parsed) {
      fail(res, "unsupported_url", "URL non reconnue. Utilise un lien de profil ou playlist Spotify ou Deezer.");
      return;
    }

    try {
      // 1. Fetch public playlists
      const playlists = await fetchPublicPlaylists(parsed);
      if (playlists.length === 0) {
        fail(res, "no_playlists", "Aucune playlist publique trouvée pour ce profil.");
        return;
      }

      // 2. Pick random tracks from those playlists
      const playlistIds = playlists.map(p => p.id);
      const candidates = await pickRandomTracks(parsed.provider, playlistIds, count);

      if (candidates.length === 0) {
        fail(res, "no_tracks", "Aucun titre trouvé dans les playlists.");
        return;
      }

      // 3. Resolve Deezer previews and collect playable tracks
      const playable: Array<{
        round: number;
        audioSourceId: string;
        type: string;
        track_id: string;
        title: string;
        artist: string;
        album_cover: string | null;
        audio_url: string;
        metadata: Record<string, unknown>;
      }> = [];

      for (const track of candidates) {
        if (playable.length >= count) break;

        let previewUrl: string | null = null;

        // For Deezer tracks, try the track preview directly
        if (track.provider === "deezer") {
          const deezerTrack = await deezerPreviewService.searchTrack(track.title, track.artist);
          previewUrl = deezerTrack?.preview ?? null;
        } else {
          // For Spotify tracks, search on Deezer for a preview
          const deezerTrack = await deezerPreviewService.searchTrack(track.title, track.artist);
          previewUrl = deezerTrack?.preview ?? null;
        }

        if (!previewUrl) continue;

        playable.push({
          round: playable.length + 1,
          audioSourceId: `quick-${track.externalId}`,
          type: track.provider,
          track_id: track.externalId,
          title: track.title,
          artist: track.artist,
          album_cover: track.cover,
          audio_url: previewUrl,
          metadata: { source: "quick_play", provider: track.provider, album: track.album },
        });
      }

      if (playable.length < 5) {
        fail(res, "insufficient_tracks", "Pas assez de titres avec extrait audio disponible.", 400, {
          needed: count,
          found: playable.length,
        });
        return;
      }

      ok(res, {
        session: {
          id: 0, // no DB session — anonymous quick play
          mode: "solo",
          difficulty: "normal",
          provider: parsed.provider,
          totalRounds: playable.length,
          startedAt: new Date().toISOString(),
        },
        tracks: playable,
        profileInfo: {
          provider: parsed.provider,
          playlistCount: playlists.length,
          totalTracks: playlists.reduce((s, p) => s + p.trackCount, 0),
        },
      });
    } catch (err) {
      logger.error("quick_play_failed", { url, error: err });
      fail(res, "quick_play_failed", "Erreur lors de la préparation du jeu. Réessaie.", 500);
    }
  },
};
