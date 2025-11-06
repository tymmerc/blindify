import { Router } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";

const router = Router();

router.post("/", async (req, res) => {
  const context = await getSessionContext(req, res);
  if (!context) return;

  const sourceId =
    typeof req.body?.audio_source_id === "string" ? req.body.audio_source_id : null;
  if (!sourceId) {
    fail(res, "audio_source_id_required", "Un identifiant de source audio est requis", 400);
    return;
  }

  await pool.query(
    `INSERT INTO likes(user_id, audio_source_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [context.user.id, sourceId]
  );
  ok(res, { audioSourceId: sourceId }, 201);
});

router.get("/:user_id", async (req, res) => {
  const context = await getSessionContext(req, res);
  if (!context) return;

  const requestedId = Number(req.params.user_id);
  if (!Number.isFinite(requestedId) || requestedId !== context.user.id) {
    fail(res, "forbidden", "Accès refusé", 403);
    return;
  }

  const result = await pool.query(
    `SELECT audio_source_id FROM likes WHERE user_id=$1`,
    [context.user.id]
  );
  ok(res, { likes: result.rows });
});

export default router;
