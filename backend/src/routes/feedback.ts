import { Router } from "express";
import rateLimit from "express-rate-limit";
import { parseFeedback } from "../utils/feedbackValidation";
import { saveFeedback } from "../services/feedback";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";

// Par adresse IP. Une soiree se joue derriere UNE box : douze joueurs qui
// donnent leur avis puis signalent un bug, c'est deja 24 envois sur la meme
// adresse en quelques minutes. 40 en 10 minutes laisse passer une vraie
// tablee et borne un script qui voudrait remplir la table.
export const FEEDBACK_WINDOW_MS = 10 * 60_000;
export const FEEDBACK_MAX_PER_WINDOW = 40;

/**
 * POST /api/feedback : retour de fin de partie, ouvert aux invites comme aux
 * visiteurs sans session. On n'enregistre ni compte ni pseudo ni adresse IP.
 * Le controle d'origine (CSRF) est fait en amont pour toute requete POST.
 */
export function createFeedbackRouter(maxPerWindow = FEEDBACK_MAX_PER_WINDOW): Router {
  const router = Router();

  router.use(
    rateLimit({
      windowMs: FEEDBACK_WINDOW_MS,
      max: maxPerWindow,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        data: null,
        error: { code: "rate_limited", message: "Trop de retours d'un coup. Réessaye dans quelques minutes." },
      },
    })
  );

  router.post("/", async (req, res) => {
    const parsed = parseFeedback(req.body);
    if (!parsed.ok) {
      fail(res, parsed.code, parsed.message, 400);
      return;
    }
    const uaHeader = req.headers["user-agent"];
    try {
      const id = await saveFeedback(parsed.value, typeof uaHeader === "string" ? uaHeader : null);
      // Jamais le texte du message dans le journal : il peut contenir n'importe quoi.
      logger.info("feedback_saved", { id, kind: parsed.value.kind, mode: parsed.value.mode });
      ok(res, { received: true }, 201);
    } catch (err) {
      logger.error("feedback_failed", { error: err instanceof Error ? err.message : String(err) });
      fail(res, "feedback_failed", "Impossible d'enregistrer ton retour pour l'instant.", 500);
    }
  });

  return router;
}

export default createFeedbackRouter();
