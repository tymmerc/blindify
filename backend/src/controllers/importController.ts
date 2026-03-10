import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { parseProfileUrl, fetchPublicPlaylists, fetchPlaylistTracks, type ImportedTrack } from "../services/profileImportService";
import { deezerPreviewService } from "../services/deezerPreviewService";

/** How many tracks to pre-resolve Deezer previews for after import (fire-and-forget). */
const PRE_RESOLVE_BATCH = 50;

/** Store track metadata in audio_sources (no Deezer call). */
async function upsertTrack(
  userId: number,
  track: ImportedTrack,
  playlistId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO audio_sources (user_id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
     ON CONFLICT (provider, external_id)
     DO UPDATE SET
       album_cover = COALESCE(EXCLUDED.album_cover, audio_sources.album_cover),
       user_id = COALESCE(audio_sources.user_id, EXCLUDED.user_id)`,
    [
      userId,
      track.provider,
      track.externalId,
      track.title,
      track.artist,
      track.cover,
      track.durationMs,
      JSON.stringify({
        import_source: track.provider,
        playlist_id: playlistId,
        album: track.album,
      }),
    ]
  );
}

/**
 * Fire-and-forget: resolve Deezer preview URLs for a random batch of
 * the user's tracks that don't have one yet. This runs after the HTTP
 * response is already sent, so the user doesn't wait.
 */
function preResolveInBackground(userId: number): void {
  (async () => {
    try {
      const { rows } = await pool.query<{ id: string; title: string; artist: string }>(
        `SELECT id, title, artist FROM audio_sources
         WHERE user_id = $1 AND audio_url IS NULL
         ORDER BY RANDOM()
         LIMIT $2`,
        [userId, PRE_RESOLVE_BATCH]
      );

      let resolved = 0;
      for (const row of rows) {
        try {
          const result = await deezerPreviewService.searchTrack(row.title, row.artist);
          if (result?.preview) {
            await pool.query("UPDATE audio_sources SET audio_url = $1 WHERE id = $2", [result.preview, row.id]);
            resolved++;
          }
        } catch {
          // skip individual failures
        }
      }
      if (resolved > 0) {
        console.log("pre_resolve_done", { userId, resolved, total: rows.length });
      }
    } catch (err) {
      console.error("pre_resolve_failed", { userId, err });
    }
  })();
}

export const importController = {
  /**
   * POST /api/import/playlists
   * Body: { url: string }
   */
  async playlists(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") {
      fail(res, "invalid_url", "URL manquante ou invalide.");
      return;
    }

    const parsed = parseProfileUrl(url.trim());
    if (!parsed) {
      fail(res, "unsupported_url", "URL non reconnue. Utilise un lien de profil ou playlist Spotify ou Deezer.");
      return;
    }

    try {
      const playlists = await fetchPublicPlaylists(parsed);
      ok(res, {
        provider: parsed.provider,
        type: parsed.type,
        playlists,
        notice: "Seules les playlists publiques sont récupérées.",
      });
    } catch (err) {
      console.error("import_playlists_failed", { url, err });
      fail(res, "import_failed", "Impossible de récupérer les playlists. Vérifie l'URL et réessaie.", 500);
    }
  },

  /**
   * POST /api/import/sync
   * Body: { provider: "spotify" | "deezer", playlistId: string }
   */
  async sync(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { provider, playlistId } = req.body as { provider?: string; playlistId?: string };
    if (!provider || !playlistId) {
      fail(res, "missing_params", "provider et playlistId requis.");
      return;
    }
    if (provider !== "spotify" && provider !== "deezer") {
      fail(res, "invalid_provider", "Provider doit être 'spotify' ou 'deezer'.");
      return;
    }

    try {
      const tracks = await fetchPlaylistTracks(provider, playlistId);
      if (tracks.length === 0) {
        fail(res, "empty_playlist", "Aucun titre trouvé dans cette playlist.");
        return;
      }

      let synced = 0;
      for (const track of tracks) {
        try {
          await upsertTrack(context.user.id, track, playlistId);
          synced++;
        } catch (err) {
          console.error("import_track_failed", { title: track.title, err });
        }
      }

      ok(res, { synced, failed: tracks.length - synced, total: tracks.length });

      // Pre-resolve a batch of Deezer previews in background
      preResolveInBackground(context.user.id);
    } catch (err) {
      console.error("import_sync_failed", { provider, playlistId, err });
      fail(res, "sync_failed", "Erreur lors de la synchronisation des titres.", 500);
    }
  },

  /**
   * POST /api/import/sync-all
   * Body: { provider: "spotify" | "deezer", playlistIds: string[] }
   */
  async syncAll(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { provider, playlistIds } = req.body as { provider?: string; playlistIds?: string[] };
    if (!provider || !Array.isArray(playlistIds) || playlistIds.length === 0) {
      fail(res, "missing_params", "provider et playlistIds requis.");
      return;
    }
    if (provider !== "spotify" && provider !== "deezer") {
      fail(res, "invalid_provider", "Provider doit être 'spotify' ou 'deezer'.");
      return;
    }

    try {
      const seen = new Set<string>();
      let synced = 0;
      let total = 0;

      for (const playlistId of playlistIds) {
        const tracks = await fetchPlaylistTracks(provider, playlistId);
        for (const track of tracks) {
          const key = `${track.provider}:${track.externalId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          total++;

          try {
            await upsertTrack(context.user.id, track, playlistId);
            synced++;
          } catch (err) {
            console.error("import_track_failed", { title: track.title, err });
          }
        }
      }

      if (total === 0) {
        fail(res, "empty_playlists", "Aucun titre trouvé dans ces playlists.");
        return;
      }

      ok(res, { synced, failed: total - synced, total });

      // Pre-resolve a batch of Deezer previews in background
      preResolveInBackground(context.user.id);
    } catch (err) {
      console.error("import_sync_all_failed", { provider, err });
      fail(res, "sync_failed", "Erreur lors de la synchronisation des titres.", 500);
    }
  },
};
