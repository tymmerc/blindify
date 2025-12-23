"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../config/db");
const session_1 = require("../utils/session");
const response_1 = require("../utils/response");
const spotifySync_1 = require("../services/providers/spotifySync");
const spotify_1 = require("../config/spotify");
const router = (0, express_1.Router)();
router.post("/", async (req, res) => {
    const context = await (0, session_1.getSessionContext)(req, res, {
        provider: "spotify",
        autoExtend: true,
        requireConnection: false,
    });
    if (!context)
        return;
    const sourceId = typeof req.body?.audio_source_id === "string" ? req.body.audio_source_id : null;
    if (!sourceId) {
        (0, response_1.fail)(res, "audio_source_id_required", "Un identifiant de source audio est requis", 400);
        return;
    }
    await db_1.pool.query(`INSERT INTO likes(user_id, audio_source_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [context.user.id, sourceId]);
    // Si le titre est un track Spotify et que l'utilisateur a une connexion avec le scope adéquat,
    // on l'ajoute aussi aux titres likés côté Spotify.
    try {
        const { rows } = await db_1.pool.query(`SELECT external_id, provider FROM audio_sources WHERE id=$1 LIMIT 1`, [sourceId]);
        const audio = rows[0];
        const spotifyId = audio?.external_id;
        if (audio?.provider === "spotify" && spotifyId && context.connection?.access_token) {
            const scopes = new Set((context.connection.scope ?? []).map(scope => scope.toLowerCase()));
            if (scopes.has("user-library-modify")) {
                const refreshed = await (0, spotifySync_1.ensureSpotifyConnection)(context.connection);
                const api = (0, spotify_1.makeSpotify)(refreshed.access_token ?? undefined, refreshed.refresh_token ?? undefined);
                try {
                    await api.addToMySavedTracks([spotifyId]);
                    // Ignore response; best-effort sync
                }
                catch (err) {
                    console.error("spotify_add_saved_track_failed", { spotifyId, err });
                }
            }
            else {
                console.warn("spotify_missing_scope_user_library_modify", { userId: context.user.id });
            }
        }
    }
    catch (err) {
        console.error("like_spotify_sync_failed", err);
    }
    (0, response_1.ok)(res, { audioSourceId: sourceId }, 201);
});
router.get("/:user_id", async (req, res) => {
    const context = await (0, session_1.getSessionContext)(req, res);
    if (!context)
        return;
    const requestedId = Number(req.params.user_id);
    if (!Number.isFinite(requestedId) || requestedId !== context.user.id) {
        (0, response_1.fail)(res, "forbidden", "Accès refusé", 403);
        return;
    }
    const result = await db_1.pool.query(`SELECT audio_source_id FROM likes WHERE user_id=$1`, [context.user.id]);
    (0, response_1.ok)(res, { likes: result.rows });
});
exports.default = router;
