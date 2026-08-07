import { Router } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";

const router = Router();
const MAX_MESSAGE = 2000;

// Report de bug in-app. Auth optionnelle : un invite peut aussi signaler un souci.
router.post("/", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    fail(res, "message_required", "Decris le souci avant d'envoyer.", 400);
    return;
  }
  const pageUrl = typeof req.body?.pageUrl === "string" ? req.body.pageUrl.slice(0, 500) : null;
  const uaHeader = req.headers["user-agent"];
  const userAgent = typeof uaHeader === "string" ? uaHeader.slice(0, 500) : null;

  // Pas de `res` passe a getSessionContext => pas de 401 si pas de session.
  const context = await getSessionContext(req).catch(() => null);
  const userId = context?.user.id ?? null;

  try {
    await pool.query(
      `INSERT INTO bug_reports (user_id, message, page_url, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [userId, message.slice(0, MAX_MESSAGE), pageUrl, userAgent]
    );
    ok(res, { received: true }, 201);
  } catch (err) {
    fail(res, "report_failed", "Impossible d'enregistrer le report pour l'instant.", 500);
  }
});

export default router;
