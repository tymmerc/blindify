import { Router } from "express";
import rateLimit from "express-rate-limit";
import { parseFeedback } from "../utils/feedbackValidation";
import { ipRateLimitKey } from "../utils/rateLimitKey";
import { saveFeedback } from "../services/feedback";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";

// Par adresse IP (une IPv6 compte pour son /64, voir utils/rateLimitKey.ts).
// Une soiree se joue derriere UNE box : douze joueurs qui donnent leur avis
// puis signalent un bug, c'est deja 24 envois sur la meme adresse en quelques
// minutes. 40 en 10 minutes laisse passer une vraie tablee et borne un script
// qui voudrait remplir la table.
export const FEEDBACK_WINDOW_MS = 10 * 60_000;
export const FEEDBACK_MAX_PER_WINDOW = 40;

// Plafond de tout l'endpoint, toutes adresses confondues : meme avec beaucoup
// d'adresses, on n'ecrit pas plus de 300 retours par heure. C'est des dizaines
// de fois le trafic d'une grosse soiree ; si une attaque le remplit, les vrais
// retours sont refuses pendant l'heure, mais la table et le disque restent bornes.
export const FEEDBACK_GLOBAL_WINDOW_MS = 60 * 60_000;
export const FEEDBACK_GLOBAL_MAX = 300;

export interface FeedbackLimits {
  perAddress?: number;
  global?: number;
}

const limitedBody = (message: string) => ({
  success: false,
  data: null,
  error: { code: "rate_limited", message },
});

/**
 * POST /api/feedback : retour de fin de partie, ouvert aux invites comme aux
 * visiteurs sans session. On n'enregistre ni compte ni pseudo ni adresse IP.
 * Le controle d'origine (CSRF) est fait en amont pour toute requete POST.
 */
export function createFeedbackRouter({
  perAddress = FEEDBACK_MAX_PER_WINDOW,
  global = FEEDBACK_GLOBAL_MAX,
}: FeedbackLimits = {}): Router {
  const router = Router();

  // L'ordre compte : une requete refusee par adresse ne consomme pas le
  // plafond commun, donc une seule adresse ne peut pas l'epuiser.
  router.use(
    rateLimit({
      windowMs: FEEDBACK_WINDOW_MS,
      max: perAddress,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: req => ipRateLimitKey(req.ip),
      message: limitedBody("Trop de retours d'un coup. Réessaye dans quelques minutes."),
    })
  );
  router.use(
    rateLimit({
      windowMs: FEEDBACK_GLOBAL_WINDOW_MS,
      max: global,
      // Pas d'en-tetes RateLimit pour ce compteur : ils diraient a tout le
      // monde combien il reste avant de bloquer l'endpoint entier.
      standardHeaders: false,
      legacyHeaders: false,
      keyGenerator: () => "tous",
      message: limitedBody("Beaucoup de retours en ce moment. Réessaye un peu plus tard."),
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
