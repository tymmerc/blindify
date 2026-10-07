import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import type { MusicProvider } from "../types/user";
import type { AudioSourceRow } from "../types/audio";
import { UNOWNED } from "../services/userTracks";

const DEFAULT_UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

async function ensureUploadDir(): Promise<string> {
  const folder = process.env.LOCAL_UPLOAD_DIR || DEFAULT_UPLOAD_DIR;
  await fs.promises.mkdir(folder, { recursive: true });
  return folder;
}

const SOURCE_COLUMNS = `s.id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata`;

/**
 * Les morceaux du joueur (ses liens joueur-morceau : un morceau peut etre a
 * plusieurs joueurs), et avec un service, le fonds commun de ce service en
 * plus (morceaux que personne n'a importes).
 */
async function listAudioSources(userId: number, provider?: MusicProvider): Promise<AudioSourceRow[]> {
  if (provider) {
    const { rows } = await pool.query<AudioSourceRow>(
      `SELECT id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata
       FROM (
         SELECT ${SOURCE_COLUMNS}, s.created_at
         FROM user_audio_sources ua JOIN audio_sources s ON s.id = ua.audio_source_id
         WHERE ua.user_id = $2 AND s.provider = $1
         UNION ALL
         SELECT ${SOURCE_COLUMNS}, s.created_at
         FROM audio_sources s
         WHERE s.provider = $1 AND ${UNOWNED("s")}
       ) AS sources
       ORDER BY created_at DESC
       LIMIT 200`,
      [provider, userId]
    );
    return rows;
  }

  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT ${SOURCE_COLUMNS}
     FROM user_audio_sources ua JOIN audio_sources s ON s.id = ua.audio_source_id
     WHERE ua.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT 200`,
    [userId]
  );
  return rows;
}

export const audioSourcesController = {
  async index(req: Request, res: Response): Promise<void> {
    const provider = req.query.provider ? String(req.query.provider) : undefined;

    const context = await getSessionContext(req, res, {
      provider: provider as MusicProvider | undefined,
      autoExtend: true,
    });
    if (!context) return;

    const sources = await listAudioSources(context.user.id, provider as MusicProvider | undefined);
    ok(res, { sources });
  },

  async sync(_req: Request, res: Response): Promise<void> {
    fail(res, "provider_not_supported", "La synchronisation n'est pas disponible", 400);
  },

  async createLocal(req: Request, res: Response): Promise<void> {
    const { title, artist, data, mimeType, durationMs } = req.body ?? {};

    if (typeof title !== "string" || title.trim().length === 0) {
      fail(res, "title_required", "Un titre est requis", 400);
      return;
    }

    if (typeof artist !== "string" || artist.trim().length === 0) {
      fail(res, "artist_required", "Un artiste est requis", 400);
      return;
    }

    if (typeof data !== "string" || data.length === 0) {
      fail(res, "data_required", "Le fichier audio doit être fourni en base64", 400);
      return;
    }

    const context = await getSessionContext(req, res, { autoExtend: true });
    if (!context) return;

    const buffer = Buffer.from(data, "base64");
    const size = buffer.byteLength;
    if (size > 10 * 1024 * 1024) {
      fail(res, "file_too_large", "Le fichier dépasse la limite de 10 Mo", 413);
      return;
    }

    const folder = await ensureUploadDir();
    const uploadId = crypto.randomUUID();
    const extension = mimeType === "audio/wav" ? "wav" : "mp3";
    const filename = `${uploadId}.${extension}`;
    const filePath = path.join(folder, filename);

    await fs.promises.writeFile(filePath, buffer);

    const { rows: uploadRows } = await pool.query(
      `INSERT INTO uploads (user_id, filename, mime_type, size, duration_ms)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [context.user.id, filename, mimeType ?? "audio/mpeg", size, durationMs ?? null]
    );

    const externalId = uploadRows[0].id as string;
    const metadata = {
      filename,
      path: filePath,
      duration_ms: durationMs ?? null,
    };

    const { rows } = await pool.query<AudioSourceRow>(
      `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata)
       VALUES ('local',$1,$2,$3,$4,NULL,NULL,$5,$6)
       ON CONFLICT (provider, external_id)
       DO UPDATE SET
         title=EXCLUDED.title,
         artist=EXCLUDED.artist,
         duration_ms=EXCLUDED.duration_ms,
         metadata=EXCLUDED.metadata,
         user_id=COALESCE(audio_sources.user_id, EXCLUDED.user_id)
       RETURNING id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata`,
      [externalId, context.user.id, title.trim(), artist.trim(), durationMs ?? null, metadata]
    );

    ok(res, { source: rows[0] }, 201);
  },
};
