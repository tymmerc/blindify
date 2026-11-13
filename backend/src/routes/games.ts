import { Router } from "express";
import rateLimit from "express-rate-limit";
import { gamesController } from "../controllers/gamesController";
import { ipRateLimitKey } from "../utils/rateLimitKey";

const router = Router();

// Un lien neuf par manche ratee, au plus : 20 par minute laisse de la marge
// a une famille derriere la meme adresse, sans ouvrir un relais vers Deezer.
const previewLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => ipRateLimitKey(req.ip),
});

router.post("/solo", gamesController.startSoloGame);
router.post("/solo/start", gamesController.startSoloGame); // legacy alias
router.post("/solo/complete", gamesController.recordSoloResult);
router.post("/solo/preview", previewLimiter, gamesController.refreshSoloPreview);
router.get("/history", gamesController.history);

export default router;
