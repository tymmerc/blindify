"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audioSourcesController = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const db_1 = require("../config/db");
const session_1 = require("../utils/session");
const response_1 = require("../utils/response");
const spotifySync_1 = require("../services/providers/spotifySync");
const DEFAULT_UPLOAD_DIR = path_1.default.join(process.cwd(), "storage", "uploads");
async function ensureUploadDir() {
    const folder = process.env.LOCAL_UPLOAD_DIR || DEFAULT_UPLOAD_DIR;
    await fs_1.default.promises.mkdir(folder, { recursive: true });
    return folder;
}
async function listAudioSources(userId, provider) {
    if (provider) {
        const { rows } = await db_1.pool.query(`SELECT id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata
       FROM audio_sources
       WHERE provider=$1 AND (user_id=$2 OR user_id IS NULL)
       ORDER BY created_at DESC
       LIMIT 200`, [provider, userId]);
        return rows;
    }
    const { rows } = await db_1.pool.query(`SELECT id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata
     FROM audio_sources
     WHERE user_id=$1
     ORDER BY created_at DESC
     LIMIT 200`, [userId]);
    return rows;
}
exports.audioSourcesController = {
    async index(req, res) {
        const provider = req.query.provider ? String(req.query.provider) : undefined;
        const context = await (0, session_1.getSessionContext)(req, res, {
            provider: provider,
            autoExtend: true,
        });
        if (!context)
            return;
        const sources = await listAudioSources(context.user.id, provider);
        (0, response_1.ok)(res, { sources });
    },
    async sync(req, res) {
        const provider = req.body?.provider ?? "spotify";
        const count = Number.isFinite(Number(req.body?.count)) ? Math.min(Math.max(Number(req.body.count), 10), 200) : 50;
        const context = await (0, session_1.getSessionContext)(req, res, {
            provider,
            requireConnection: provider !== "local" && provider !== "guest",
        });
        if (!context)
            return;
        if (provider === "spotify") {
            if (!context.connection) {
                (0, response_1.fail)(res, "spotify_connection_missing", "Connexion Spotify requise", 400);
                return;
            }
            const { sources } = await (0, spotifySync_1.syncSpotifyLibrary)(context.user.id, context.connection, count);
            (0, response_1.ok)(res, { synced: sources.length });
            return;
        }
        (0, response_1.fail)(res, "provider_not_supported", "La synchronisation n'est pas disponible pour ce fournisseur", 400);
    },
    async createLocal(req, res) {
        const { title, artist, data, mimeType, durationMs } = req.body ?? {};
        if (typeof title !== "string" || title.trim().length === 0) {
            (0, response_1.fail)(res, "title_required", "Un titre est requis", 400);
            return;
        }
        if (typeof artist !== "string" || artist.trim().length === 0) {
            (0, response_1.fail)(res, "artist_required", "Un artiste est requis", 400);
            return;
        }
        if (typeof data !== "string" || data.length === 0) {
            (0, response_1.fail)(res, "data_required", "Le fichier audio doit être fourni en base64", 400);
            return;
        }
        const context = await (0, session_1.getSessionContext)(req, res, { autoExtend: true });
        if (!context)
            return;
        const buffer = Buffer.from(data, "base64");
        const size = buffer.byteLength;
        if (size > 10 * 1024 * 1024) {
            (0, response_1.fail)(res, "file_too_large", "Le fichier dépasse la limite de 10 Mo", 413);
            return;
        }
        const folder = await ensureUploadDir();
        const uploadId = crypto_1.default.randomUUID();
        const extension = mimeType === "audio/wav" ? "wav" : "mp3";
        const filename = `${uploadId}.${extension}`;
        const filePath = path_1.default.join(folder, filename);
        await fs_1.default.promises.writeFile(filePath, buffer);
        const { rows: uploadRows } = await db_1.pool.query(`INSERT INTO uploads (user_id, filename, mime_type, size, duration_ms)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`, [context.user.id, filename, mimeType ?? "audio/mpeg", size, durationMs ?? null]);
        const externalId = uploadRows[0].id;
        const metadata = {
            filename,
            path: filePath,
            duration_ms: durationMs ?? null,
        };
        const { rows } = await db_1.pool.query(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata)
       VALUES ('local',$1,$2,$3,$4,NULL,NULL,$5,$6)
       ON CONFLICT (provider, external_id)
       DO UPDATE SET
         title=EXCLUDED.title,
         artist=EXCLUDED.artist,
         duration_ms=EXCLUDED.duration_ms,
         metadata=EXCLUDED.metadata,
         user_id=EXCLUDED.user_id
       RETURNING id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata`, [externalId, context.user.id, title.trim(), artist.trim(), durationMs ?? null, metadata]);
        (0, response_1.ok)(res, { source: rows[0] }, 201);
    },
};
