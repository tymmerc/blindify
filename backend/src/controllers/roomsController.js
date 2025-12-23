"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomsController = void 0;
const axios_1 = require("axios");
const spotify_preview_finder_1 = require("spotify-preview-finder");
const db_1 = require("../config/db");
const socket_1 = require("../socket");
const session_1 = require("../utils/session");
const response_1 = require("../utils/response");
const spotifySync_1 = require("../services/providers/spotifySync");
const realtimeGame_1 = require("../services/realtimeGame");
const realtimeOrchestrator_1 = require("../services/realtimeOrchestrator");
async function fetchGlobalRandomSources(count) {
    if (count <= 0)
        return [];
    const { rows } = await db_1.pool.query(`SELECT s.id,
            s.user_id AS user_id,
            s.provider,
            s.external_id,
            s.title,
            s.artist,
            s.album_cover,
            s.audio_url,
            s.duration_ms,
            s.metadata
     FROM audio_sources s
     ORDER BY RANDOM()
     LIMIT $1`, [count * 2]);
    return rows;
}
function generateRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
async function ensureRoomParticipantPrefs() {
    await db_1.pool.query(`ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS source_pref TEXT`);
    await db_1.pool.query(`ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS playlist_pref TEXT`);
}
async function ensureRoomFlags() {
    await db_1.pool.query(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN DEFAULT FALSE`);
}
async function fetchAudioSources(userIds, provider, count, opts = {}) {
    const extraConds = [];
    const params = [];
    const userList = Array.isArray(userIds) ? userIds : [userIds];
    // Base conditions
    params.push(userList);
    const userCond = opts.likedOnly ? `l.user_id = ANY($1)` : `(s.user_id = ANY($1) OR s.user_id IS NULL)`;
    let providerCond = "";
    if (provider !== "any") {
        params.push(provider);
        providerCond = opts.likedOnly ? `AND s.provider = $2` : `AND provider = $2`;
    }
    if (opts.playlistId) {
        params.push(opts.playlistId);
        extraConds.push(`metadata->>'playlist_id' = $${params.length}`);
    }
    if (opts.timeRange) {
        params.push(opts.timeRange);
        extraConds.push(`metadata->>'time_range' = $${params.length}`);
    }
    const extraClause = extraConds.length ? `AND ${extraConds.join(" AND ")}` : "";
    if (opts.likedOnly) {
        params.push(count);
        const limitIndex = params.length;
        const { rows } = await db_1.pool.query(`SELECT s.id, s.user_id AS user_id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata
       FROM audio_sources s
       INNER JOIN likes l ON l.audio_source_id = s.id
       WHERE ${userCond} ${providerCond} ${extraClause}
       ORDER BY RANDOM()
       LIMIT $${limitIndex}`, params);
        return rows;
    }
    params.push(count);
    const limitIndex = params.length;
    const { rows } = await db_1.pool.query(`SELECT s.id, s.user_id AS user_id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata
     FROM audio_sources s
     WHERE ${userCond} ${providerCond} ${extraClause}
     ORDER BY RANDOM()
     LIMIT $${limitIndex}`, params);
    return rows;
}
async function hydratePreviewUrl(source, opts = {}) {
    if (source.provider !== "spotify")
        return source.audio_url ?? null;
    const title = source.title?.trim();
    const artist = source.artist?.trim();
    if (!title)
        return null;
    try {
        const searchUrl = "https://api.spotify.com/v1/search";
        const queries = [
            [`track:${title}`, artist ? `artist:${artist}` : ""].filter(Boolean).join(" "),
            title,
        ];
        let preview = null;
        if (opts.accessToken) {
            for (const q of queries) {
                if (preview)
                    break;
                if (!q)
                    continue;
                const { data } = await axios_1.default.get(searchUrl, {
                    params: { q, type: "track", limit: 1, market: "from_token" },
                    headers: { Authorization: `Bearer ${opts.accessToken}` },
                });
                preview = data?.tracks?.items?.[0]?.preview_url ?? null;
            }
        }
        if (!preview && opts.allowScrape) {
            try {
                const finderResult = await (0, spotify_preview_finder_1.default)(title, artist ?? undefined, 1);
                if (finderResult?.success && finderResult.results?.length) {
                    preview = finderResult.results[0]?.previewUrls?.[0] ?? null;
                }
            }
            catch (err) {
                console.error("preview_scrape_failed", { id: source.id, err });
            }
        }
        if (preview) {
            await db_1.pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [preview, source.id]);
            return preview;
        }
        return null;
    }
    catch (err) {
        console.error("preview_lookup_failed", { id: source.id, err });
        return null;
    }
}
function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
async function collectPlayableSources(userIds, provider, desiredCount, opts) {
    const candidateLimit = Math.min(desiredCount * 8, 400);
    let candidates = await fetchAudioSources(userIds, provider, candidateLimit, {
        likedOnly: opts.likedOnly,
        playlistId: opts.playlistId,
        timeRange: opts.timeRange,
    });
    // Hydrate Spotify previews even when provider="any"
    if (opts.accessToken) {
        await Promise.all(candidates.map(async (source) => {
            if (source.provider !== "spotify" || source.audio_url)
                return;
            const preview = await hydratePreviewUrl(source, {
                accessToken: opts.accessToken,
                allowScrape: opts.allowScrape !== false,
            });
            if (preview) {
                source.audio_url = preview;
                console.log("preview_found", { sourceId: source.id, title: source.title });
            }
        }));
    }
    else if (opts.allowScrape !== false) {
        await Promise.all(candidates.map(async (source) => {
            if (source.provider !== "spotify" || source.audio_url)
                return;
            const preview = await hydratePreviewUrl(source, { allowScrape: true });
            if (preview) {
                source.audio_url = preview;
                console.log("preview_found_scrape_only", { sourceId: source.id, title: source.title });
            }
        }));
    }
    const playable = shuffle(candidates.filter(source => Boolean(source.audio_url)));
    const unique = new Map();
    for (const source of playable) {
        const key = source.external_id ?? String(source.id);
        if (unique.has(key))
            continue;
        unique.set(key, source);
        if (unique.size >= desiredCount)
            break;
    }
    return Array.from(unique.values());
}
async function syncPlaylistTracks(userId, playlistId, accessToken) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
    let nextUrl = `${url}?limit=100`;
    while (nextUrl) {
        const response = await axios_1.default.get(nextUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = response.data;
        const items = data.items ?? [];
        for (const item of items) {
            const track = item.track;
            if (!track?.id || !track?.name)
                continue;
            const artist = track.artists?.map(a => a?.name).filter(Boolean).join(", ") || "Artiste inconnu";
            const cover = track.album?.images?.[0]?.url ?? null;
            const metadata = {
                album: track.album?.name ?? null,
                release_date: track.album?.release_date ?? null,
                playlist_id: playlistId,
                provider: "spotify",
            };
            await db_1.pool.query(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, duration_ms, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (provider, external_id)
         DO UPDATE SET
           title=EXCLUDED.title,
           artist=EXCLUDED.artist,
           album_cover=EXCLUDED.album_cover,
           duration_ms=EXCLUDED.duration_ms,
           metadata=EXCLUDED.metadata,
           user_id=EXCLUDED.user_id`, ["spotify", track.id, userId, track.name, artist, cover, track.duration_ms ?? null, metadata]);
        }
        nextUrl = data.next ?? null;
    }
}
async function syncTopTracks(userId, timeRange, accessToken) {
    const url = `https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=${timeRange}`;
    const { data } = await axios_1.default.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const items = data?.items ?? [];
    for (const track of items) {
        if (!track?.id || !track?.name)
            continue;
        const artist = track.artists?.map(a => a?.name).filter(Boolean).join(", ") || "Artiste inconnu";
        const cover = track.album?.images?.[0]?.url ?? null;
        const metadata = {
            album: track.album?.name ?? null,
            release_date: track.album?.release_date ?? null,
            time_range: timeRange,
            provider: "spotify",
        };
        await db_1.pool.query(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, duration_ms, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (provider, external_id)
       DO UPDATE SET
         title=EXCLUDED.title,
         artist=EXCLUDED.artist,
         album_cover=EXCLUDED.album_cover,
         duration_ms=EXCLUDED.duration_ms,
         metadata=EXCLUDED.metadata,
         user_id=EXCLUDED.user_id`, ["spotify", track.id, userId, track.name, artist, cover, track.duration_ms ?? null, metadata]);
    }
}
exports.roomsController = {
    async createRoom(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await ensureRoomFlags();
        const { user } = context;
        const name = typeof req.body?.name === "string" ? req.body.name : null;
        const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "normal";
        const autoAdvance = Boolean(req.body?.autoAdvance);
        const maxPlayers = Number.isFinite(Number(req.body?.maxPlayers))
            ? Math.min(Math.max(Number(req.body.maxPlayers), 2), 16)
            : 8;
        const questionCount = Number.isFinite(Number(req.body?.questionCount))
            ? Math.min(Math.max(Number(req.body.questionCount), 5), 25)
            : 10;
        const code = generateRoomCode();
        const { rows } = await db_1.pool.query(`INSERT INTO multiplayer_rooms (room_code, host_user_id, name, status, max_players, question_count, difficulty)
       VALUES ($1,$2,$3,'waiting',$4,$5,$6)
      RETURNING id, room_code, host_user_id, name, status, max_players, question_count, difficulty`, [code, user.id, name, maxPlayers, questionCount, difficulty]);
        const room = rows[0];
        await db_1.pool.query(`UPDATE multiplayer_rooms SET auto_advance=$1 WHERE id=$2`, [autoAdvance, room.id]);
        room.auto_advance = autoAdvance;
        await db_1.pool.query(`INSERT INTO room_participants (room_id, user_id, is_ready)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (room_id, user_id) DO NOTHING`, [room.id, user.id]);
        (0, response_1.ok)(res, { room });
    },
    async joinRoom(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        const { user } = context;
        const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
        if (!code) {
            (0, response_1.fail)(res, "room_code_missing", "Code de salle requis", 400);
            return;
        }
        const { rows } = await db_1.pool.query(`SELECT id, room_code, max_players, status FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`, [code]);
        const room = rows[0];
        if (!room) {
            (0, response_1.fail)(res, "room_not_found", "Salle introuvable", 404);
            return;
        }
        if (room.status !== "waiting") {
            (0, response_1.fail)(res, "room_locked", "La partie a déjà démarré", 409);
            return;
        }
        const participants = await db_1.pool.query(`SELECT COUNT(*)::INT AS total FROM room_participants WHERE room_id=$1`, [room.id]);
        if (participants.rows[0]?.total >= room.max_players) {
            (0, response_1.fail)(res, "room_full", "La salle est pleine", 409);
            return;
        }
        await db_1.pool.query(`INSERT INTO room_participants (room_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (room_id, user_id) DO NOTHING`, [room.id, user.id]);
        socket_1.io.to(room.room_code).emit("player-joined", {
            userId: user.id,
            username: user.username,
            roomCode: room.room_code,
        });
        (0, response_1.ok)(res, { room });
    },
    async details(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await ensureRoomParticipantPrefs();
        const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
        if (!code) {
            (0, response_1.fail)(res, "room_code_missing", "Code de salle requis", 400);
            return;
        }
        const { rows: roomRows } = await db_1.pool.query(`SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty, session_id, auto_advance
       FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`, [code]);
        const room = roomRows[0];
        if (!room) {
            (0, response_1.fail)(res, "room_not_found", "Salle introuvable", 404);
            return;
        }
        const { rows: participantRows } = await db_1.pool.query(`SELECT rp.user_id, u.username
       FROM room_participants rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.room_id=$1
       ORDER BY rp.joined_at ASC`, [room.id]);
        const { rows: prefRows } = await db_1.pool.query(`SELECT source_pref, playlist_pref FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [room.id, context.user.id]);
        (0, response_1.ok)(res, { room, participants: participantRows, selfPreference: prefRows[0] ?? null });
    },
    async preferences(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await ensureRoomParticipantPrefs();
        const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
        if (!code) {
            (0, response_1.fail)(res, "room_code_missing", "Code de salle requis", 400);
            return;
        }
        const source = typeof req.body?.source === "string" ? req.body.source : null;
        const playlistId = typeof req.body?.playlistId === "string" ? req.body.playlistId.trim() : null;
        const allowedSources = new Set(["library", "liked", "playlist", "top_week", "top_month", "top_all"]);
        if (!source || !allowedSources.has(source)) {
            (0, response_1.fail)(res, "invalid_source", "Source invalide", 400);
            return;
        }
        const { rows: roomRows } = await db_1.pool.query(`SELECT id FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`, [code]);
        const room = roomRows[0];
        if (!room) {
            (0, response_1.fail)(res, "room_not_found", "Salle introuvable", 404);
            return;
        }
        const membership = await db_1.pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2`, [room.id, context.user.id]);
        if (!membership.rows.length) {
            (0, response_1.fail)(res, "room_forbidden", "Tu n'es pas dans cette salle", 403);
            return;
        }
        await db_1.pool.query(`UPDATE room_participants
       SET source_pref=$3, playlist_pref=$4
       WHERE room_id=$1 AND user_id=$2`, [room.id, context.user.id, source, playlistId]);
        (0, response_1.ok)(res, { source, playlistId });
    },
    async state(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
        if (!code) {
            (0, response_1.fail)(res, "room_code_missing", "Code de salle requis", 400);
            return;
        }
        const { rows: roomRows } = await db_1.pool.query(`SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty, session_id, auto_advance
       FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`, [code]);
        const room = roomRows[0];
        if (!room) {
            (0, response_1.fail)(res, "room_not_found", "Salle introuvable", 404);
            return;
        }
        const participant = await db_1.pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [room.id, context.user.id]);
        if (!participant.rows.length) {
            (0, response_1.fail)(res, "room_forbidden", "Tu n'es pas dans cette salle", 403);
            return;
        }
        if (room.status !== "in_progress" || !room.session_id) {
            (0, response_1.ok)(res, { room, session: null, tracks: [] });
            return;
        }
        const { rows: sessions } = await db_1.pool.query(`SELECT id, mode, difficulty, source_provider, total_rounds, started_at
       FROM game_sessions WHERE id=$1 LIMIT 1`, [room.session_id]);
        const session = sessions[0];
        if (!session) {
            (0, response_1.ok)(res, { room, session: null, tracks: [] });
            return;
        }
        const { rows: trackRows } = await db_1.pool.query(`SELECT gr.round_index AS round,
              s.id AS "audioSourceId",
              s.provider AS type,
              COALESCE(s.external_id, s.id::text) AS track_id,
              s.title,
              s.artist,
              s.album_cover,
              s.audio_url,
              s.metadata
       FROM game_rounds gr
       LEFT JOIN audio_sources s ON s.id = gr.audio_source_id
       WHERE gr.session_id=$1
       ORDER BY gr.round_index ASC`, [session.id]);
        const gameState = (0, realtimeGame_1.gameStateSnapshot)(room.room_code) ?? null;
        (0, response_1.ok)(res, {
            room,
            session: {
                id: session.id,
                mode: session.mode,
                difficulty: session.difficulty,
                provider: session.source_provider,
                totalRounds: session.total_rounds,
                startedAt: session.started_at,
                roomCode: room.room_code,
                currentRound: gameState?.currentRound ?? null,
                autoAdvance: room.auto_advance ?? false,
            },
            tracks: trackRows,
            gameState,
        });
    },
    async startGame(req, res) {
        const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
        if (!code) {
            (0, response_1.fail)(res, "room_code_missing", "Code de salle requis", 400);
            return;
        }
        const sourceParam = typeof req.body?.source === "string" ? req.body.source : "library";
        const preferredProvider = req.body?.provider;
        const playlistId = typeof req.body?.playlistId === "string" ? req.body.playlistId.trim() : null;
        const likedOnly = sourceParam === "liked";
        const topRange = sourceParam === "top_week"
            ? "short_term"
            : sourceParam === "top_month"
                ? "medium_term"
                : sourceParam === "top_all"
                    ? "long_term"
                    : null;
        const context = await (0, session_1.getSessionContext)(req, res, {
            provider: preferredProvider,
            requireConnection: preferredProvider !== "guest",
        });
        if (!context)
            return;
        const { rows: roomRows } = await db_1.pool.query(`SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty
       FROM multiplayer_rooms
       WHERE room_code=$1 LIMIT 1`, [code]);
        const room = roomRows[0];
        if (!room) {
            (0, response_1.fail)(res, "room_not_found", "Salle introuvable", 404);
            return;
        }
        if (room.host_user_id !== context.user.id) {
            (0, response_1.fail)(res, "room_forbidden", "Seul l'hôte peut démarrer la partie", 403);
            return;
        }
        if (room.status !== "waiting") {
            (0, response_1.fail)(res, "room_locked", "La partie a déjà démarré", 409);
            return;
        }
        const provider = preferredProvider ?? context.connection?.provider ?? context.user.provider ?? "guest";
        const autoAdvanceFlag = typeof req.body?.autoAdvance === "boolean" ? req.body.autoAdvance : room.auto_advance ?? false;
        if (room.auto_advance !== autoAdvanceFlag) {
            await db_1.pool.query(`UPDATE multiplayer_rooms SET auto_advance=$1 WHERE id=$2`, [autoAdvanceFlag, room.id]);
            room.auto_advance = autoAdvanceFlag;
        }
        // Pour mélanger les bibliothèques de tous les joueurs, on ne filtre pas sur un provider spécifique
        const poolProvider = "any";
        await ensureRoomParticipantPrefs();
        if (provider !== "guest" && !context.connection) {
            (0, response_1.fail)(res, "provider_connection_missing", "Aucune connexion active pour ce mode", 400);
            return;
        }
        if ((playlistId || topRange) && provider !== "spotify") {
            (0, response_1.fail)(res, "playlist_provider_invalid", "Les playlists ou tops nécessitent Spotify.", 400);
            return;
        }
        if (topRange && !context.connection?.access_token) {
            (0, response_1.fail)(res, "provider_connection_missing", "Connexion Spotify requise pour ce mode", 400);
            return;
        }
        if (playlistId && provider === "spotify" && context.connection?.access_token) {
            try {
                await syncPlaylistTracks(context.user.id, playlistId, context.connection.access_token);
            }
            catch (err) {
                console.error("sync_playlist_failed_multi", { playlistId, err });
            }
        }
        if (topRange && provider === "spotify" && context.connection?.access_token) {
            try {
                await syncTopTracks(context.user.id, topRange, context.connection.access_token);
            }
            catch (err) {
                console.error("sync_top_tracks_failed_multi", { timeRange: topRange, err });
            }
        }
        const { rows: participantRows } = await db_1.pool.query(`SELECT user_id, source_pref, playlist_pref FROM room_participants WHERE room_id=$1`, [room.id]);
        const participantIds = participantRows.map(p => p.user_id);
        const collected = [];
        const seen = new Set();
        const pushUnique = (list) => {
            for (const src of list) {
                const key = src.external_id ?? String(src.id);
                if (seen.has(key))
                    continue;
                seen.add(key);
                collected.push(src);
                if (collected.length >= room.question_count)
                    break;
            }
        };
        // Préférences par joueur
        const prefMap = new Map();
        for (const row of participantRows) {
            prefMap.set(row.user_id, { source: row.source_pref, playlist: row.playlist_pref });
        }
        const allowedSources = ["library", "liked", "playlist", "top_week", "top_month", "top_all"];
        const normalizeSource = (val) => {
            if (!val)
                return sourceParam;
            const lower = val.toLowerCase();
            if (allowedSources.includes(lower))
                return lower;
            return sourceParam;
        };
        // Charger les connexions Spotify de tous les participants pour synchroniser au besoin
        const { rows: connRows } = await db_1.pool.query(`SELECT id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at
       FROM user_connections
       WHERE user_id = ANY($1::int[])`, [participantIds]);
        const connectionMap = new Map();
        for (const row of connRows) {
            connectionMap.set(row.user_id, {
                id: row.id,
                user_id: row.user_id,
                provider: row.provider,
                access_token: row.access_token,
                refresh_token: row.refresh_token,
                expires_at: row.expires_at,
                scope: row.scope,
                created_at: row.created_at ?? new Date().toISOString(),
                updated_at: row.updated_at ?? new Date().toISOString(),
            });
        }
        // Prélever un quota par joueur pour garantir la diversité
        const perUserCount = Math.max(1, Math.ceil(room.question_count / Math.max(1, participantIds.length)));
        const contribution = new Map();
        for (const pid of participantIds) {
            const pref = prefMap.get(pid);
            const choice = normalizeSource(pref?.source ?? sourceParam);
            const likedChoice = choice === "liked";
            const playlistChoice = choice === "playlist" ? pref?.playlist ?? playlistId ?? undefined : undefined;
            const timeChoice = choice === "top_week" ? "short_term" : choice === "top_month" ? "medium_term" : choice === "top_all" ? "long_term" : undefined;
            // Si la source nécessite Spotify mais que le joueur n'a pas de connexion, on saute
            const userConn = connectionMap.get(pid);
            const needsSpotify = likedChoice || choice === "playlist" || Boolean(timeChoice);
            if (needsSpotify && !(userConn?.provider === "spotify" && userConn.access_token)) {
                continue;
            }
            // Si le joueur a une connexion Spotify, on sync sa librairie/playlist/top avant de tirer ses pistes
            if (userConn?.provider === "spotify" && userConn.access_token) {
                try {
                    await (0, spotifySync_1.syncSpotifyLibrary)(pid, { ...userConn, provider: "spotify" }, room.question_count);
                    if (choice === "playlist" && playlistChoice) {
                        await syncPlaylistTracks(pid, playlistChoice, userConn.access_token);
                    }
                    if (timeChoice) {
                        await syncTopTracks(pid, timeChoice, userConn.access_token);
                    }
                }
                catch (err) {
                    console.error("sync_participant_library_failed", { userId: pid, choice, err });
                }
            }
            const slice = await fetchAudioSources(pid, poolProvider, perUserCount, {
                likedOnly: likedChoice,
                playlistId: playlistChoice,
                timeRange: timeChoice,
            });
            contribution.set(pid, (contribution.get(pid) ?? 0) + slice.length);
            pushUnique(slice);
        }
        // Compléter avec le pool commun si besoin
        if (collected.length < room.question_count) {
            const fill = await collectPlayableSources(participantIds, poolProvider, room.question_count, {
                likedOnly: false,
                playlistId: undefined,
                timeRange: undefined,
                accessToken: context.connection?.access_token ?? undefined,
            });
            pushUnique(fill);
        }
        let sources = collected;
        if (sources.length < room.question_count && provider === "spotify" && context.connection) {
            const { connection } = await (0, spotifySync_1.syncSpotifyLibrary)(context.user.id, context.connection, room.question_count);
            if (connection) {
                context.connection = connection;
            }
            sources = await collectPlayableSources(participantIds, poolProvider, room.question_count, {
                likedOnly,
                playlistId: playlistId ?? undefined,
                timeRange: topRange ?? undefined,
                accessToken: connection?.access_token ?? undefined,
            });
        }
        // Si toujours insuffisant, compléter avec le pool global (provider "any")
        if (sources.length < room.question_count) {
            const remaining = room.question_count - sources.length;
            const fallback = await collectPlayableSources(participantIds, "any", remaining, {
                likedOnly: false,
                playlistId: undefined,
                timeRange: undefined,
                allowScrape: false,
            });
            const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
            for (const candidate of fallback) {
                const key = candidate.external_id ?? String(candidate.id);
                if (existingKeys.has(key))
                    continue;
                sources.push(candidate);
                existingKeys.add(key);
                if (sources.length >= room.question_count)
                    break;
            }
        }
        // Garantir au moins une piste par joueur en tirant directement dans sa bibliothèque, puis dans le pool global
        for (const pid of participantIds) {
            const hasOne = sources.some(src => src.user_id === pid);
            if (hasOne)
                continue;
            const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
            const personalPool = await fetchAudioSources(pid, poolProvider, 3, {});
            let injected = false;
            for (const candidate of personalPool) {
                const key = candidate.external_id ?? String(candidate.id);
                if (existingKeys.has(key))
                    continue;
                sources.push(candidate);
                existingKeys.add(key);
                injected = true;
                break;
            }
            if (!injected) {
                const globals = await fetchGlobalRandomSources(3);
                for (const candidate of globals) {
                    const key = candidate.external_id ?? String(candidate.id);
                    if (existingKeys.has(key))
                        continue;
                    sources.push(candidate);
                    existingKeys.add(key);
                    break;
                }
            }
            if (sources.length >= room.question_count)
                break;
        }
        // Fallback ultime : tirer dans la table globale (sans filtre user) pour éviter l'erreur bloquante
        if (sources.length < room.question_count) {
            const missing = room.question_count - sources.length;
            const globals = await fetchGlobalRandomSources(missing * 2);
            const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
            for (const candidate of globals) {
                const key = candidate.external_id ?? String(candidate.id);
                if (existingKeys.has(key))
                    continue;
                sources.push(candidate);
                existingKeys.add(key);
                if (sources.length >= room.question_count)
                    break;
            }
        }
        // Dernier filet : si rien du tout, on s'arrête avec un message explicite
        if (sources.length === 0) {
            (0, response_1.fail)(res, "insufficient_tracks", "Pas assez de titres pour lancer la partie", 400, {
                needed: room.question_count,
                available: 0,
            });
            return;
        }
        // Mélange final pour intercaler les sources entre joueurs (et accepter un nombre réduit si besoin)
        const cappedCount = Math.max(1, Math.min(sources.length, room.question_count));
        sources = shuffle(sources).slice(0, cappedCount);
        // Ajuster le nombre de rounds à ce qui est réellement disponible (borné par la demande)
        const effectiveRounds = Math.max(1, sources.length);
        const { rows: sessionRows } = await db_1.pool.query(`INSERT INTO game_sessions (host_user_id, mode, difficulty, source_provider, total_rounds, state, room_code)
       VALUES ($1,'multiplayer',$2,$3,$4,'in_progress',$5)
       RETURNING id, mode, difficulty, source_provider, total_rounds, started_at`, [context.user.id, room.difficulty, provider, effectiveRounds, room.room_code]);
        const session = sessionRows[0];
        await db_1.pool.query(`UPDATE multiplayer_rooms
       SET status='in_progress', session_id=$2, started_at=NOW()
       WHERE id=$1`, [room.id, session.id]);
        for (const participant of participantRows) {
            await db_1.pool.query(`INSERT INTO game_participants (session_id, user_id, score)
         VALUES ($1,$2,0)
         ON CONFLICT (session_id, user_id) DO NOTHING`, [session.id, participant.user_id]);
        }
        const { rows: participantUsers } = await db_1.pool.query(`SELECT id, username, avatar FROM users WHERE id = ANY($1::int[])`, [participantIds]);
        const usernameMap = new Map();
        const avatarMap = new Map();
        participantUsers.forEach(u => {
            usernameMap.set(u.id, u.username);
            avatarMap.set(u.id, u.avatar);
        });
        const normalizedTracks = sources.map((source, index) => ({
            round: index + 1,
            audioSourceId: source.id,
            type: source.provider,
            track_id: source.external_id ?? source.id,
            title: source.title,
            artist: source.artist,
            album_cover: source.album_cover,
            audio_url: source.audio_url,
            metadata: {
                ...(source.metadata ?? {}),
                owner_user_id: source.user_id ?? null,
                owner_username: source.user_id
                    ? usernameMap.get(source.user_id ?? 0) ?? null
                    : null,
                owner_avatar: source.user_id
                    ? avatarMap.get(source.user_id ?? 0) ?? null
                    : null,
            },
        }));
        for (const track of normalizedTracks) {
            await db_1.pool.query(`INSERT INTO game_rounds (session_id, round_index, audio_source_id, correct_title, correct_artist)
         VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (session_id, round_index) DO NOTHING`, [session.id, track.round, track.audioSourceId, track.title, track.artist]);
        }
        const roundTracks = normalizedTracks.map(t => ({
            round: t.round,
            trackId: String(t.track_id),
            audioSourceId: t.audioSourceId,
            title: t.title,
            artist: t.artist,
            previewUrl: t.audio_url,
            albumCover: t.album_cover,
            metadata: t.metadata ?? {},
        }));
        (0, realtimeGame_1.bootstrapGameState)({
            roomCode: room.room_code,
            hostUserId: room.host_user_id,
            tracks: roundTracks,
            participantIds: participantIds.map(id => ({
                userId: id,
                username: usernameMap.get(id) ?? null,
                avatar: avatarMap.get(id) ?? null,
            })),
        });
        // Start round 1 immediately in a server-authoritative way
        (0, realtimeOrchestrator_1.startRoundAndBroadcast)(socket_1.io, room.room_code, { forceRound: 1, startAt: Date.now() + 1000 });
        const snapshot = (0, realtimeOrchestrator_1.broadcastState)(socket_1.io, room.room_code);
        (0, response_1.ok)(res, {
            session: {
                id: session.id,
                mode: session.mode,
                difficulty: session.difficulty,
                provider: session.source_provider,
                totalRounds: session.total_rounds,
                startedAt: session.started_at,
                roomCode: room.room_code,
            },
            tracks: normalizedTracks,
            gameState: snapshot,
        });
    },
};
