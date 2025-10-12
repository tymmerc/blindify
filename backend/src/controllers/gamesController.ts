import { Request, Response } from "express";
import { pool } from "../config/db";

export const gamesController = {
  async startSoloGame(req: Request, res: Response): Promise<void> {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "No token" });
      return;
    }

    const userRes = await pool.query(`SELECT id FROM users WHERE access_token=$1`, [token]);
    if (!userRes.rows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const userId = userRes.rows[0].id;

    const tracks = await pool.query(
      `SELECT * FROM tracks WHERE user_id=$1 AND preview_url IS NOT NULL ORDER BY RANDOM() LIMIT 10`,
      [userId]
    );

    const game = await pool.query(
      `INSERT INTO games (host_id, mode) VALUES ($1,'solo') RETURNING id`,
      [userId]
    );
    const gameId = game.rows[0].id;

    for (let i = 0; i < tracks.rows.length; i++) {
      await pool.query(
        `INSERT INTO game_tracks (game_id, track_id, "order") VALUES ($1,$2,$3)`,
        [gameId, tracks.rows[i].id, i + 1]
      );
    }

    res.json({ game_id: gameId, tracks: tracks.rows });
  },

  async history(req: Request, res: Response): Promise<void> {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await pool.query(`SELECT id FROM users WHERE access_token=$1`, [token]);
    if (!user.rows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const userId = user.rows[0].id;

    const history = await pool.query(
      `SELECT * FROM game_summary WHERE host_name=(SELECT username FROM users WHERE id=$1) ORDER BY created_at DESC`,
      [userId]
    );
    res.json(history.rows);
  },

  async detailedStats(req: Request, res: Response): Promise<void> {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await pool.query(`SELECT id FROM users WHERE access_token=$1`, [token]);
    if (!user.rows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const userId = user.rows[0].id;

    const stats = await pool.query(
      `SELECT 
        COUNT(*) AS total_games,
        COALESCE(MAX(score),0) AS best_score,
        COALESCE(AVG(score),0) AS avg_score
       FROM game_players WHERE user_id=$1`,
      [userId]
    );

    res.json(stats.rows[0]);
  },
};
