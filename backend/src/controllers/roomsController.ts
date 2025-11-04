import { Request, Response } from "express";
import { pool } from "../config/db";
import { io } from "../socket";
import { getSessionContext } from "../utils/session";

function genRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const roomsController = {
  async createRoom(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res, { refresh: false });
    if (!context) return;
    const {
      user: { id: userId },
    } = context;

    const code = genRoomCode();
    const { rows } = await pool.query(
      `INSERT INTO multiplayer_rooms (room_code, host_user_id, status)
       VALUES ($1,$2,'waiting') RETURNING id, room_code`,
      [code, userId]
    );

    res.json({ roomId: rows[0].id, roomCode: rows[0].room_code });
  },

  async joinRoom(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res, { refresh: false });
    if (!context) return;
    const {
      user: { id: userId, username },
    } = context;

    const { code } = req.params;

    const { rows: rooms } = await pool.query(
      `SELECT id FROM multiplayer_rooms WHERE room_code=$1`,
      [code]
    );
    if (!rooms.length) return void res.status(404).json({ error: "room_not_found" });

    await pool.query(
      `INSERT INTO room_participants (room_id, user_id)
       VALUES ($1,$2) ON CONFLICT (room_id, user_id) DO NOTHING`,
      [rooms[0].id, userId]
    );

    io.to(code).emit("player-joined", { username });
    res.json({ ok: true });
  },
};
