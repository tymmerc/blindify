import { Router } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { ensureSpotifyConnection } from "../services/providers/spotifySync";
import { makeSpotify } from "../config/spotify";

const router = Router();

router.post("/", async (req, res) => {
  const context = await getSessionContext(req, res, {
    provider: "spotify",
    autoExtend: true,
    requireConnection: false,
  });
  if (!context) return;

  const sourceId =
    typeof req.body?.audio_source_id === "string" ? req.body.audio_source_id : null;
  if (!sourceId) {
    fail(res, "audio_source_id_required", "Un identifiant de source audio est requis", 400);
    return;
  }

  await pool.query(
    `INSERT INTO likes(user_id, audio_source_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [context.user.id, sourceId]
  );

  // Si le titre est un track Spotify et que l'utilisateur a une connexion avec le scope adéquat,
  // on l'ajoute aussi aux titres likés côté Spotify.
  try {
    const { rows } = await pool.query<{ external_id: string | null; provider: string }>(
      `SELECT external_id, provider FROM audio_sources WHERE id=$1 LIMIT 1`,
      [sourceId]
    );
    const audio = rows[0];
    const spotifyId = audio?.external_id;
    if (audio?.provider === "spotify" && spotifyId && context.connection?.access_token) {
      const scopes = new Set((context.connection.scope ?? []).map(scope => scope.toLowerCase()));
      if (scopes.has("user-library-modify")) {
        const refreshed = await ensureSpotifyConnection(context.connection);
        const api = makeSpotify(refreshed.access_token ?? undefined, refreshed.refresh_token ?? undefined);
        try {
          await api.addToMySavedTracks([spotifyId]);
          // Ignore response; best-effort sync
        } catch (err) {
          console.error("spotify_add_saved_track_failed", { spotifyId, err });
        }
      } else {
        console.warn("spotify_missing_scope_user_library_modify", { userId: context.user.id });
      }
    }
  } catch (err) {
    console.error("like_spotify_sync_failed", err);
  }

  ok(res, { audioSourceId: sourceId }, 201);
});

router.get("/:user_id", async (req, res) => {
  const context = await getSessionContext(req, res);
  if (!context) return;

  const requestedId = Number(req.params.user_id);
  if (!Number.isFinite(requestedId) || requestedId !== context.user.id) {
    fail(res, "forbidden", "Accès refusé", 403);
    return;
  }

  const result = await pool.query(
    `SELECT audio_source_id FROM likes WHERE user_id=$1`,
    [context.user.id]
  );
  ok(res, { likes: result.rows });
});

export default router;
