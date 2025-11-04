import { Router } from "express";
import { pool } from "../config/db";

const router = Router();

router.post("/", async (req, res) => {
  const { user_id, track_id } = req.body;
  await pool.query(
    "INSERT INTO likes(user_id, track_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [user_id, track_id]
  );
  res.json({ status: "ok" });
});

router.get("/:user_id", async (req, res) => {
  const { user_id } = req.params as { user_id: string };
  const r = await pool.query(
    "SELECT track_id FROM likes WHERE user_id=$1",
    [user_id]
  );
  res.json(r.rows);
});

export default router;
