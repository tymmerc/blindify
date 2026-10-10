import { Router } from "express";
import rateLimit from "express-rate-limit";
import { discordController } from "../controllers/discordController";

const router = Router();

// /api/rooms est exempte du limiteur general (le lobby le sonde). Cette route
// n'est appelee qu'a l'entree dans le salon : une limite serree par adresse,
// avec le meme contournement E2E que /api/auth (la pile de test joue plusieurs
// salons depuis la machine du serveur).
const roomLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "rate_limited", message: "Trop de requêtes. Réessaye dans 1 minute." } },
  skip: req => {
    const key = process.env.E2E_BYPASS_KEY;
    return Boolean(key) && req.headers["x-e2e-key"] === key;
  },
});

router.get("/config", (req, res) => discordController.config(req, res));
router.post("/room", roomLimiter, (req, res) => discordController.room(req, res));

export default router;
