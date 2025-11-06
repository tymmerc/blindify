import type { Request, Response } from "express";
import { pool } from "../config/db";
import { io } from "../socket";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import type { MusicProvider } from "../types/user";
import type { AudioSourceRow } from "../types/audio";
import { syncSpotifyLibrary } from "../services/providers/spotifySync";

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

async function fetchAudioSources(
  userId: number,
  provider: MusicProvider,
  count: number
): Promise<AudioSourceRow[]> {
  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata
     FROM audio_sources
     WHERE provider=$1 AND (user_id=$2 OR user_id IS NULL)
     ORDER BY RANDOM()
     LIMIT $3`,
    [provider, userId, count]
  );
  return rows;
}

export const roomsController = {
  async createRoom(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { user } = context;
    const name = typeof req.body?.name === "string" ? req.body.name : null;
    const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "normal";
    const maxPlayers = Number.isFinite(Number(req.body?.maxPlayers))
      ? Math.min(Math.max(Number(req.body.maxPlayers), 2), 16)
      : 8;
    const questionCount = Number.isFinite(Number(req.body?.questionCount))
      ? Math.min(Math.max(Number(req.body.questionCount), 5), 25)
      : 10;

    const code = generateRoomCode();
    const { rows } = await pool.query(
      `INSERT INTO multiplayer_rooms (room_code, host_user_id, name, status, max_players, question_count, difficulty)
       VALUES ($1,$2,$3,'waiting',$4,$5,$6)
       RETURNING id, room_code, host_user_id, name, status, max_players, question_count, difficulty`,
      [code, user.id, name, maxPlayers, questionCount, difficulty]
    );

    const room = rows[0];

    await pool.query(
      `INSERT INTO room_participants (room_id, user_id, is_ready)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [room.id, user.id]
    );

    ok(res, { room });
  },

  async joinRoom(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { user } = context;
    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";

    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, room_code, max_players, status FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = rows[0];

    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    if (room.status !== "waiting") {
      fail(res, "room_locked", "La partie a déjà démarré", 409);
      return;
    }

    const participants = await pool.query(
      `SELECT COUNT(*)::INT AS total FROM room_participants WHERE room_id=$1`,
      [room.id]
    );
    if (participants.rows[0]?.total >= room.max_players) {
      fail(res, "room_full", "La salle est pleine", 409);
      return;
    }

    await pool.query(
      `INSERT INTO room_participants (room_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [room.id, user.id]
    );

    io.to(room.room_code).emit("player-joined", {
      userId: user.id,
      username: user.username,
    });

    ok(res, { room });
  },

  async details(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const { rows: roomRows } = await pool.query(
      `SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty, session_id
       FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = roomRows[0];
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    const { rows: participantRows } = await pool.query(
      `SELECT rp.user_id, u.username
       FROM room_participants rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.room_id=$1
       ORDER BY rp.joined_at ASC`,
      [room.id]
    );

    ok(res, { room, participants: participantRows });
  },

  async startGame(req: Request, res: Response): Promise<void> {
    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const preferredProvider = req.body?.provider as MusicProvider | undefined;
    const context = await getSessionContext(req, res, {
      provider: preferredProvider,
      requireConnection: preferredProvider !== "guest",
    });
    if (!context) return;

    const { rows: roomRows } = await pool.query(
      `SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty
       FROM multiplayer_rooms
       WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = roomRows[0];
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    if (room.host_user_id !== context.user.id) {
      fail(res, "room_forbidden", "Seul l'hôte peut démarrer la partie", 403);
      return;
    }

    if (room.status !== "waiting") {
      fail(res, "room_locked", "La partie a déjà démarré", 409);
      return;
    }

    const provider: MusicProvider =
      preferredProvider ?? context.connection?.provider ?? context.user.provider ?? "guest";

    if (provider !== "guest" && !context.connection) {
      fail(res, "provider_connection_missing", "Aucune connexion active pour ce mode", 400);
      return;
    }

    let sources = await fetchAudioSources(context.user.id, provider, room.question_count);

    if (sources.length < room.question_count && provider === "spotify" && context.connection) {
      const { connection } = await syncSpotifyLibrary(context.user.id, context.connection, room.question_count);
      if (connection) {
        context.connection = connection;
      }
      sources = await fetchAudioSources(context.user.id, provider, room.question_count);
    }

    if (sources.length < room.question_count) {
      fail(res, "insufficient_tracks", "Pas assez de titres pour lancer la partie", 400, {
        needed: room.question_count,
        available: sources.length,
      });
      return;
    }

    const { rows: sessionRows } = await pool.query(
      `INSERT INTO game_sessions (host_user_id, mode, difficulty, source_provider, total_rounds, state, room_code)
       VALUES ($1,'multiplayer',$2,$3,$4,'in_progress',$5)
       RETURNING id, mode, difficulty, source_provider, total_rounds, started_at`,
      [context.user.id, room.difficulty, provider, room.question_count, room.room_code]
    );
    const session = sessionRows[0];

    await pool.query(
      `UPDATE multiplayer_rooms
       SET status='in_progress', session_id=$2, started_at=NOW()
       WHERE id=$1`,
      [room.id, session.id]
    );

    const { rows: participantRows } = await pool.query<{ user_id: number }>(
      `SELECT user_id FROM room_participants WHERE room_id=$1`,
      [room.id]
    );

    for (const participant of participantRows) {
      await pool.query(
        `INSERT INTO game_participants (session_id, user_id, score)
         VALUES ($1,$2,0)
         ON CONFLICT (session_id, user_id) DO NOTHING`,
        [session.id, participant.user_id]
      );
    }

    const normalizedTracks = sources.map((source, index) => ({
      round: index + 1,
      audioSourceId: source.id,
      type: source.provider,
      track_id: source.external_id ?? source.id,
      title: source.title,
      artist: source.artist,
      album_cover: source.album_cover,
      audio_url: source.audio_url,
      metadata: source.metadata ?? {},
    }));

    for (const track of normalizedTracks) {
      await pool.query(
        `INSERT INTO game_rounds (session_id, round_index, audio_source_id, correct_title, correct_artist)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (session_id, round_index) DO NOTHING`,
        [session.id, track.round, track.audioSourceId, track.title, track.artist]
      );
    }

    io.to(room.room_code).emit("multiplayer:start", {
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
      host: {
        id: context.user.id,
        username: context.user.username,
      },
    });

    ok(res, {
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
    });
  },
};
