import type { Request, Response } from "express";
import { pool } from "../config/db";
import { io } from "../socket";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
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
};
