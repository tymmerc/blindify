import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";
import { parseProfileUrl, fetchPublicPlaylists, fetchPlaylistTracks, type ImportedTrack } from "../services/profileImportService";
import { upsertLink, claimLegacyTracks } from "./linksController";
import axios from "axios";
import { deezerPreviewService } from "../services/deezerPreviewService";

/** How many tracks to pre-resolve Deezer previews for after import (fire-and-forget). */
const PRE_RESOLVE_BATCH = 50;

/** Store track metadata in audio_sources (no Deezer call). */
async function upsertTrack(
  userId: number,
  track: ImportedTrack,
  playlistId: string,
  linkId?: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO audio_sources (user_id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata, link_id)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9)
     ON CONFLICT (provider, external_id)
     DO UPDATE SET
       album_cover = COALESCE(EXCLUDED.album_cover, audio_sources.album_cover),
       -- Le PREMIER importeur garde le titre : avant, chaque import re-assignait
       -- la ligne (partagee par toute la plateforme) au dernier venu, et la
       -- bibliotheque du premier tombait a zero (vol croise, vu en vrai).
       user_id = COALESCE(audio_sources.user_id, EXCLUDED.user_id),
       link_id = CASE
         WHEN audio_sources.user_id IS NULL OR audio_sources.user_id = EXCLUDED.user_id
           THEN COALESCE(EXCLUDED.link_id, audio_sources.link_id)
         ELSE audio_sources.link_id
       END`,
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
      linkId ?? null,
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
        logger.info("pre_resolve_done", { userId, resolved, total: rows.length });
      }
    } catch (err) {
      logger.error("pre_resolve_failed", { userId, error: err });
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

      // La carte de bibliotheque : nom + image du lien. Pour une playlist c'est
      // direct ; pour un profil on tente le nom/avatar du compte (Deezer public),
      // sinon on retombe sur la premiere playlist ou un libelle generique.
      let label: string | null = null;
      let imageUrl: string | null = null;
      if (parsed.type === "playlist") {
        label = playlists[0]?.name ?? "Playlist";
        imageUrl = playlists[0]?.cover ?? null;
      } else {
        if (parsed.provider === "deezer") {
          try {
            const { data } = await axios.get(`https://api.deezer.com/user/${encodeURIComponent(parsed.id)}`, { timeout: 6000 });
            label = data?.name ? `Profil de ${data.name}` : null;
            imageUrl = data?.picture_medium ?? null;
          } catch { /* profil prive ou API indisponible : fallback plus bas */ }
        }
        label = label ?? `Profil ${parsed.provider === "deezer" ? "Deezer" : "Spotify"}`;
        imageUrl = imageUrl ?? playlists[0]?.cover ?? null;
      }
      let linkId: number | null = null;
      try {
        await claimLegacyTracks(context.user.id);
        linkId = await upsertLink({
          userId: context.user.id,
          url: url.trim(),
          provider: parsed.provider,
          kind: parsed.type,
          label,
          imageUrl,
        });
      } catch (err) {
        logger.error("link_upsert_failed", { error: err });
      }

      ok(res, {
        provider: parsed.provider,
        type: parsed.type,
        linkId,
        playlists,
        notice: "Seules les playlists publiques sont récupérées.",
      });
    } catch (err) {
      logger.error("import_playlists_failed", { url, error: err });
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

    const { provider, playlistId, linkId } = req.body as { provider?: string; playlistId?: string; linkId?: number };
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
          await upsertTrack(context.user.id, track, playlistId, linkId ?? null);
          synced++;
        } catch (err) {
          logger.error("import_track_failed", { title: track.title, error: err });
        }
      }

      ok(res, { synced, failed: tracks.length - synced, total: tracks.length });

      // Pre-resolve a batch of Deezer previews in background
      preResolveInBackground(context.user.id);
    } catch (err) {
      logger.error("import_sync_failed", { provider, playlistId, error: err });
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

    const { provider, playlistIds, maxTracksPerPlaylist, linkId } = req.body as { provider?: string; playlistIds?: string[]; maxTracksPerPlaylist?: number; linkId?: number };
    if (!provider || !Array.isArray(playlistIds) || playlistIds.length === 0) {
      fail(res, "missing_params", "provider et playlistIds requis.");
      return;
    }
    if (provider !== "spotify" && provider !== "deezer") {
      fail(res, "invalid_provider", "Provider doit être 'spotify' ou 'deezer'.");
      return;
    }

    // Default: 10 tracks per playlist (quick import). Full import requires explicit opt-in.
    const perPlaylistLimit = Number.isFinite(maxTracksPerPlaylist) && maxTracksPerPlaylist! > 0
      ? Math.min(maxTracksPerPlaylist!, 500)
      : 10;

    try {
      const seen = new Set<string>();
      let synced = 0;
      let total = 0;

      for (const playlistId of playlistIds) {
        const tracks = await fetchPlaylistTracks(provider, playlistId, perPlaylistLimit);
        for (const track of tracks) {
          const key = `${track.provider}:${track.externalId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          total++;

          try {
            await upsertTrack(context.user.id, track, playlistId, linkId ?? null);
            synced++;
          } catch (err) {
            logger.error("import_track_failed", { title: track.title, error: err });
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
      logger.error("import_sync_all_failed", { provider, error: err });
      fail(res, "sync_failed", "Erreur lors de la synchronisation des titres.", 500);
    }
  },
};
