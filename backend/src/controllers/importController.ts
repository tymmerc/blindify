import type { Request, Response } from "express";
import { DEEZER_API } from "../config/deezer";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";
import { profileLinkOrFail } from "./profileLink";
import {
  fetchPublicPlaylists,
  fetchPlaylistTracksChecked,
  fetchYoutubeTracks,
  PLAYLIST_TRACKS_MAX,
  type ImportProvider,
  type ImportedTrack,
  type ParsedUrl,
} from "../services/profileImportService";
import { YoutubeImportError, type YoutubeMatchReport } from "../services/youtubeImportService";
import { upsertLink, claimLegacyTracks, ownLinkId } from "./linksController";
import axios from "axios";
import { deezerPreviewService } from "../services/deezerPreviewService";
import { previewQueryFor } from "../services/trackResolution";
import type { AudioSourceRow } from "../types/audio";
import { LINK_UPSERT } from "../services/userTracks";

/** How many tracks to pre-resolve Deezer previews for after import (fire-and-forget). */
const PRE_RESOLVE_BATCH = 50;

/**
 * Range le morceau dans audio_sources (sans appel Deezer) et le relie a CE
 * joueur, meme si quelqu'un l'avait deja : chacun garde ses morceaux. Une
 * seule commande : le morceau et le lien arrivent ensemble ou pas du tout.
 * Exportee pour les tests.
 */
export async function upsertTrack(
  userId: number,
  track: ImportedTrack,
  playlistId: string,
  linkId: number | null,
): Promise<void> {
  await pool.query(
    `WITH morceau AS (
       INSERT INTO audio_sources (user_id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata, link_id)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9)
       ON CONFLICT (provider, external_id)
       DO UPDATE SET
         album_cover = COALESCE(EXCLUDED.album_cover, audio_sources.album_cover),
         -- Colonnes historiques (premier importeur), gardees pour un retour
         -- arriere. Le jeu lit user_audio_sources, ecrite juste en dessous.
         user_id = COALESCE(audio_sources.user_id, EXCLUDED.user_id),
         link_id = CASE
           WHEN audio_sources.user_id IS NULL OR audio_sources.user_id = EXCLUDED.user_id
             THEN COALESCE(EXCLUDED.link_id, audio_sources.link_id)
           ELSE audio_sources.link_id
         END,
         -- L'ISRC appris a un nouvel import : le prochain extrait sera le bon
         -- enregistrement (les extraits stockes expirent et sont re-resolus).
         metadata = COALESCE(audio_sources.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('isrc', EXCLUDED.metadata->>'isrc'))
       RETURNING id
     )
     INSERT INTO user_audio_sources (user_id, audio_source_id, link_id)
     SELECT $1::int, id, $9::int FROM morceau
     ${LINK_UPSERT}`,
    [
      userId,
      track.provider,
      track.externalId,
      track.title,
      track.artist,
      track.cover,
      track.durationMs,
      JSON.stringify({
        import_source: track.importSource ?? track.provider,
        playlist_id: playlistId,
        album: track.album,
        isrc: track.isrc ?? null,
      }),
      linkId,
    ]
  );
}

/** Combien de morceaux importes arrivent avec leur ISRC (suivi du correctif des extraits). */
function logImportIsrc(provider: string, tracks: ImportedTrack[]): void {
  logger.info("import_isrc", { provider, total: tracks.length, withIsrc: tracks.filter(t => t.isrc).length });
}

/**
 * Fire-and-forget: resolve Deezer preview URLs for a random batch of
 * the user's tracks that don't have one yet. This runs after the HTTP
 * response is already sent, so the user doesn't wait.
 */
function preResolveInBackground(userId: number): void {
  (async () => {
    try {
      const { rows } = await pool.query<Pick<AudioSourceRow, "id" | "provider" | "external_id" | "title" | "artist" | "duration_ms" | "metadata">>(
        `SELECT a.id, a.provider, a.external_id, a.title, a.artist, a.duration_ms, a.metadata
         FROM user_audio_sources ua
         JOIN audio_sources a ON a.id = ua.audio_source_id
         WHERE ua.user_id = $1 AND a.audio_url IS NULL
         ORDER BY RANDOM()
         LIMIT $2`,
        [userId, PRE_RESOLVE_BATCH]
      );

      let resolved = 0;
      for (const row of rows) {
        try {
          const result = await deezerPreviewService.resolvePreview(previewQueryFor(row));
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

const PROVIDERS: readonly ImportProvider[] = ["spotify", "deezer", "youtube"];

function isProvider(value: unknown): value is ImportProvider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

/** L'adresse gardee est-elle sur YouTube Music ? (le nom d'hote, jamais une sous-chaine de l'adresse) */
function isYoutubeMusic(url: string): boolean {
  try {
    return new URL(url).hostname === "music.youtube.com";
  } catch {
    return false;
  }
}

/** Vrai si l'erreur YouTube est partie au joueur (playlist privee, introuvable, API muette...). */
function failYoutube(res: Response, err: unknown): boolean {
  if (!(err instanceof YoutubeImportError)) return false;
  fail(res, err.code, err.message, err.status);
  return true;
}

/**
 * Les titres d'une playlist, et pour YouTube ce qu'on a retrouve chez Deezer.
 * `complete` : tout a ete lu (jusqu'a la limite) et verifie ; sinon il peut
 * manquer des titres, et le reimport ne retire rien de la carte.
 */
async function playlistTracks(
  provider: ImportProvider,
  playlistId: string,
  limit?: number,
): Promise<{ tracks: ImportedTrack[]; youtube: YoutubeMatchReport | null; complete: boolean }> {
  if (provider === "youtube") {
    const { tracks, report } = await fetchYoutubeTracks(playlistId, limit);
    return { tracks, youtube: report, complete: report.unchecked === 0 };
  }
  const { tracks, complete } = await fetchPlaylistTracksChecked(provider, playlistId, limit);
  return { tracks, youtube: null, complete };
}

/**
 * Reimport d'une carte : ses morceaux qui ne sont plus dans la playlist la
 * quittent (cles « fournisseur:identifiant » de l'import qui vient d'aboutir).
 * Meme regle que le retrait d'une carte : on detache les liens de CE joueur,
 * et la colonne historique s'il etait le premier importeur (sinon la
 * migration 005 rejouee au demarrage recreerait le lien).
 */
async function pruneCard(userId: number, linkId: number, keptKeys: string[]): Promise<number> {
  const { rowCount } = await pool.query(
    `WITH gone AS (
       DELETE FROM user_audio_sources ua
       USING audio_sources a
       WHERE a.id = ua.audio_source_id AND ua.user_id = $1 AND ua.link_id = $2
         AND (a.provider || ':' || a.external_id) <> ALL($3::text[])
       RETURNING ua.audio_source_id
     )
     UPDATE audio_sources SET user_id = NULL, link_id = NULL
     WHERE user_id = $1 AND id IN (SELECT audio_source_id FROM gone)`,
    [userId, linkId, keptKeys]
  );
  return rowCount ?? 0;
}

/** Le service ne repond pas (delai, coupure, 5xx, quota) : rien a reprocher au lien. */
function serviceDown(err: unknown): boolean {
  const e = err as { isAxiosError?: boolean; response?: { status?: number } } | null;
  if (!e?.isAxiosError) return false;
  const status = e.response?.status;
  return status === undefined || status === 429 || status >= 500;
}

const SERVICE_DOWN: Record<ImportProvider, { code: string; message: string }> = {
  spotify: {
    code: "spotify_unavailable",
    message: "Spotify ne répond pas en ce moment. Réessaie dans une minute, ou colle le lien Deezer de la même playlist.",
  },
  deezer: { code: "deezer_unavailable", message: "Deezer ne répond pas en ce moment. Réessaie dans une minute." },
  youtube: { code: "youtube_unavailable", message: "YouTube ne répond pas en ce moment. Réessaie dans une minute." },
};

/** Ce que le joueur lit quand la lecture d'un lien ou de ses titres echoue. */
function importFailure(provider: ImportProvider, err: unknown, parsed?: ParsedUrl): { status: number; code: string; message: string } {
  if (serviceDown(err)) return { status: 503, ...SERVICE_DOWN[provider] };
  if (parsed?.type === "user") {
    return {
      status: 400,
      code: "profile_unreadable",
      message: "Ce profil n'a pas pu être lu. Colle plutôt le lien d'une de tes playlists : dans l'appli, Partager puis Copier le lien.",
    };
  }
  return {
    status: 400,
    code: "import_failed",
    message: "Cette playlist n'a pas pu être lue. Vérifie qu'elle est publique, puis réessaie.",
  };
}

const EMPTY_PLAYLIST = "Cette playlist est vide ou privée. Passe-la en publique dans l'appli, puis réessaie.";

/** Aucun morceau retrouve : Deezer ne les a pas, ou Deezer n'a pas repondu. */
function youtubeNothingMessage(report: YoutubeMatchReport): string {
  return report.unchecked > 0
    ? "On n'a pas pu chercher les morceaux de cette playlist pour l'instant. Réessaie dans un moment."
    : `Aucun des ${report.examined} morceaux de cette playlist n'a été retrouvé avec un extrait. Essaie une autre playlist.`;
}

/** Plusieurs playlists YouTube (jamais aujourd'hui : un lien = une playlist) : on additionne. */
function addReports(a: YoutubeMatchReport | null, b: YoutubeMatchReport | null): YoutubeMatchReport | null {
  if (!a || !b) return a ?? b;
  return {
    playlistSize: a.playlistSize + b.playlistSize,
    examined: a.examined + b.examined,
    found: a.found + b.found,
    notFound: a.notFound + b.notFound,
    unchecked: a.unchecked + b.unchecked,
    stoppedBy: a.stoppedBy ?? b.stoppedBy,
  };
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

    const link = await profileLinkOrFail(req, res, url);
    if (!link) return;
    const { parsed } = link;

    try {
      const playlists = await fetchPublicPlaylists(parsed);

      // La carte de bibliotheque : nom + image du lien. Pour une playlist c'est
      // direct ; pour un profil on tente le nom/avatar du compte (Deezer public),
      // sinon on retombe sur la premiere playlist ou un libelle generique.
      let label: string | null = null;
      let imageUrl: string | null = null;
      if (parsed.provider === "youtube") {
        // Rien de YouTube n'est garde plus de 30 jours (regles Google) : ni le nom ni l'image de la playlist.
        label = isYoutubeMusic(link.url) ? "Playlist YouTube Music" : "Playlist YouTube";
        imageUrl = null;
      } else if (parsed.type === "playlist") {
        label = playlists[0]?.name ?? "Playlist";
        imageUrl = playlists[0]?.cover ?? null;
      } else {
        if (parsed.provider === "deezer") {
          try {
            const { data } = await axios.get(`${DEEZER_API}/user/${encodeURIComponent(parsed.id)}`, { timeout: 6000 });
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
          // L'adresse longue (arrivee d'un lien court) : le dedoublonnage des liens la reconnait.
          url: link.url,
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
      if (failYoutube(res, err)) return;
      logger.error("import_playlists_failed", { url, error: err });
      const failure = importFailure(parsed.provider, err, parsed);
      fail(res, failure.code, failure.message, failure.status);
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
    if (!isProvider(provider)) {
      fail(res, "invalid_provider", "Provider doit être 'spotify', 'deezer' ou 'youtube'.");
      return;
    }

    try {
      const { tracks, youtube } = await playlistTracks(provider, playlistId);
      if (tracks.length === 0) {
        if (youtube) {
          fail(res, "youtube_none_found", youtubeNothingMessage(youtube), 422, { youtube });
          return;
        }
        fail(res, "empty_playlist", EMPTY_PLAYLIST);
        return;
      }

      const ownLink = await ownLinkId(context.user.id, linkId);
      let synced = 0;
      for (const track of tracks) {
        try {
          await upsertTrack(context.user.id, track, playlistId, ownLink);
          synced++;
        } catch (err) {
          logger.error("import_track_failed", { title: track.title, error: err });
        }
      }

      logImportIsrc(provider, tracks);
      ok(res, { synced, failed: tracks.length - synced, total: tracks.length, ...(youtube ? { youtube } : {}) });

      // Pre-resolve a batch of Deezer previews in background
      preResolveInBackground(context.user.id);
    } catch (err) {
      if (failYoutube(res, err)) return;
      logger.error("import_sync_failed", { provider, playlistId, error: err });
      const failure = importFailure(provider, err);
      fail(res, failure.code, failure.message, failure.status);
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
    if (!isProvider(provider)) {
      fail(res, "invalid_provider", "Provider doit être 'spotify', 'deezer' ou 'youtube'.");
      return;
    }
    // Un lien YouTube est une seule playlist ; au-dela, ce n'est pas notre front.
    if (provider === "youtube" && playlistIds.length > 1) {
      fail(res, "too_many_playlists", "Une seule playlist YouTube à la fois.");
      return;
    }

    // Une playlist seule (Spotify, Deezer) s'importe en entier : coupee aux 50
    // premiers titres, elle redonnait toujours les memes, meme reimportee (T37).
    // Un profil garde sa limite par playlist (10 par defaut, import rapide).
    // YouTube garde la sienne : chaque video coute une recherche chez Deezer.
    const wholePlaylist = provider !== "youtube" && playlistIds.length === 1;
    const perPlaylistLimit = wholePlaylist
      ? PLAYLIST_TRACKS_MAX
      : Number.isFinite(maxTracksPerPlaylist) && maxTracksPerPlaylist! > 0
        ? Math.min(maxTracksPerPlaylist!, PLAYLIST_TRACKS_MAX)
        : 10;

    try {
      const ownLink = await ownLinkId(context.user.id, linkId);
      const seen = new Set<string>();
      let synced = 0;
      let total = 0;
      let withIsrc = 0;
      let youtube: YoutubeMatchReport | null = null;
      // Une playlist seule, lue en entier (sous le plafond, sans page en echec)
      // et toute rangee : alors seulement la carte perd les morceaux qui ne
      // sont plus dans la playlist. Un profil ou YouTube, lus en partie
      // (limite par playlist, premieres videos), ne retirent jamais rien.
      let complete = wholePlaylist;
      const kept: string[] = [];

      for (const playlistId of playlistIds) {
        const fetched = await playlistTracks(provider, playlistId, perPlaylistLimit);
        youtube = addReports(youtube, fetched.youtube);
        complete &&= fetched.complete && fetched.tracks.length < perPlaylistLimit;
        const tracks = fetched.tracks;
        for (const track of tracks) {
          const key = `${track.provider}:${track.externalId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          total++;
          if (track.isrc) withIsrc++;

          try {
            await upsertTrack(context.user.id, track, playlistId, ownLink);
            synced++;
            kept.push(key);
          } catch (err) {
            complete = false;
            logger.error("import_track_failed", { title: track.title, error: err });
          }
        }
      }

      if (total === 0) {
        if (youtube) {
          fail(res, "youtube_none_found", youtubeNothingMessage(youtube), 422, { youtube });
          return;
        }
        fail(res, "empty_playlists", EMPTY_PLAYLIST);
        return;
      }

      if (ownLink !== null && complete) {
        try {
          const removed = await pruneCard(context.user.id, ownLink, kept);
          if (removed > 0) logger.info("import_card_pruned", { provider, removed });
        } catch (err) {
          // Les titres sont la ; seul le menage de la carte a echoue.
          logger.error("import_card_prune_failed", { error: err });
        }
      }

      logger.info("import_isrc", { provider, total, withIsrc });
      ok(res, { synced, failed: total - synced, total, ...(youtube ? { youtube } : {}) });

      // Pre-resolve a batch of Deezer previews in background
      preResolveInBackground(context.user.id);
    } catch (err) {
      if (failYoutube(res, err)) return;
      logger.error("import_sync_all_failed", { provider, error: err });
      const failure = importFailure(provider, err);
      fail(res, failure.code, failure.message, failure.status);
    }
  },
};
