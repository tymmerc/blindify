import { Router } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";

const router = Router();

router.post("/", async (req, res) => {
  const context = await getSessionContext(req, res, { refresh: false });
  if (!context) return;

  const trackId = typeof req.body?.track_id === "string" ? req.body.track_id : null;
  if (!trackId) {
    res.status(400).json({ error: "track_id_required" });
    return;
  }

  await pool.query(
    "INSERT INTO likes(user_id, track_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [context.user.id, trackId]
  );
  res.status(201).json({ track_id: trackId });
});

router.get("/:user_id", async (req, res) => {
  const context = await getSessionContext(req, res, { refresh: false });
  if (!context) return;

  const requestedId = Number(req.params.user_id);
  if (!Number.isFinite(requestedId) || requestedId !== context.user.id) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const result = await pool.query("SELECT track_id FROM likes WHERE user_id=$1", [context.user.id]);
  res.json(result.rows);
});

export default router;
