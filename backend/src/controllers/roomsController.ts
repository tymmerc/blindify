import { Request, Response } from "express";
import { pool } from "../config/db";
import { io } from "../socket";

function genRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const roomsController = {
  async createRoom(req: Request, res: Response): Promise<void> {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const { rows: users } = await pool.query(`SELECT id FROM users WHERE access_token=$1`, [token]);
    if (!users.length) return void res.status(401).json({ error: "unauthorized" });

    const code = genRoomCode();
    const { rows } = await pool.query(
      `INSERT INTO multiplayer_rooms (room_code, host_user_id, status)
       VALUES ($1,$2,'waiting') RETURNING id, room_code`,
      [code, users[0].id]
    );

    res.json({ roomId: rows[0].id, roomCode: rows[0].room_code });
  },

  async joinRoom(req: Request, res: Response): Promise<void> {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const { code } = req.params;
    const { rows: users } = await pool.query(
      `SELECT id, username FROM users WHERE access_token=$1`,
      [token]
    );
    if (!users.length) return void res.status(401).json({ error: "unauthorized" });

    const { rows: rooms } = await pool.query(
      `SELECT id FROM multiplayer_rooms WHERE room_code=$1`,
      [code]
    );
    if (!rooms.length) return void res.status(404).json({ error: "room_not_found" });

    await pool.query(
      `INSERT INTO room_participants (room_id, user_id)
       VALUES ($1,$2) ON CONFLICT (room_id, user_id) DO NOTHING`,
      [rooms[0].id, users[0].id]
    );

    io.to(code).emit("player-joined", { username: users[0].username });
    res.json({ ok: true });
  },
};
