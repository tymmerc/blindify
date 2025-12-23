"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSpotifyConnection = ensureSpotifyConnection;
exports.syncSpotifyLibrary = syncSpotifyLibrary;
const db_1 = require("../../config/db");
const spotify_1 = require("../../config/spotify");
function isExpired(connection) {
    if (!connection?.expires_at)
        return false;
    return new Date(connection.expires_at).getTime() <= Date.now() + 60000;
}
async function refreshSpotifyConnection(connection) {
    if (!connection.refresh_token) {
        return connection;
    }
    const spotify = (0, spotify_1.makeSpotify)(undefined, connection.refresh_token);
    const refreshed = await spotify.refreshAccessToken();
    const accessToken = refreshed.body.access_token;
    const refreshToken = refreshed.body.refresh_token || connection.refresh_token;
    const expiresAt = new Date(Date.now() + (refreshed.body.expires_in ?? 3600) * 1000).toISOString();
    const { rows } = await db_1.pool.query(`UPDATE user_connections
     SET access_token=$2,
         refresh_token=$3,
         expires_at=$4,
         updated_at=NOW()
     WHERE id=$1
     RETURNING id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at`, [connection.id, accessToken, refreshToken, expiresAt]);
    return rows[0];
}
async function ensureSpotifyConnection(connection) {
    if (!connection.access_token || isExpired(connection)) {
        return refreshSpotifyConnection(connection);
    }
    return connection;
}
async function syncSpotifyLibrary(userId, connection, desiredCount) {
    let working = connection;
    if (!working.access_token || isExpired(working)) {
        working = await refreshSpotifyConnection(connection);
    }
    if (!working.access_token) {
        return { sources: [], connection: working };
    }
    const api = (0, spotify_1.makeSpotify)(working.access_token, working.refresh_token ?? undefined);
    const target = Math.min(Math.max(desiredCount * 3, 30), 200);
    const collected = [];
    for (let offset = 0; offset < 400 && collected.length < target; offset += 50) {
        const response = await api.getMySavedTracks({ limit: 50, offset });
        const items = response.body.items ?? [];
        collected.push(...items);
        if (items.length < 50)
            break;
    }
    const tracks = collected
        .map(item => item.track)
        .filter((track) => Boolean(track?.id && track?.name));
    const inserted = [];
    for (const track of tracks) {
        const metadata = {
            album: track.album?.name ?? null,
            release_date: track.album?.release_date ?? null,
            popularity: track.popularity ?? null,
            provider: "spotify",
        };
        const { rows } = await db_1.pool.query(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, duration_ms, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (provider, external_id)
       DO UPDATE SET
         title=EXCLUDED.title,
         artist=EXCLUDED.artist,
         album_cover=EXCLUDED.album_cover,
         duration_ms=EXCLUDED.duration_ms,
         metadata=EXCLUDED.metadata,
         user_id=EXCLUDED.user_id
       RETURNING id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata`, [
            "spotify",
            track.id,
            userId,
            track.name,
            track.artists?.map(artist => artist?.name).filter(Boolean).join(", ") ?? "Artiste inconnu",
            track.album?.images?.[0]?.url ?? null,
            track.duration_ms ?? null,
            metadata,
        ]);
        inserted.push(rows[0]);
    }
    return { sources: inserted, connection: working };
}
