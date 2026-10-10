import crypto from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { discordController } from "../controllers/discordController";

const router = Router();

// /api/rooms est exempte du limiteur general (le lobby le sonde). Cette route
// n'est appelee qu'a l'entree dans le salon : une limite serree, avec le meme
// contournement E2E que /api/auth (la pile de test joue plusieurs salons
// depuis la machine du serveur).
//
// Par session plutot que par adresse quand la session est la : les joueurs
// Discord arrivent tous par le proxy de Discord, qui cache leur adresse. Par
// adresse, dix salons simultanes partageaient un seul compteur. Sans session,
// la requete est refusee de toute facon (401), le compteur par adresse suffit.
export function discordRoomLimitKey(req: { ip?: string; headers: Record<string, unknown> }): string {
  const header = req.headers.authorization;
  const token = typeof header === "string" && header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return `ip:${req.ip ?? "?"}`;
  // L'empreinte, jamais le jeton lui-meme (il ne doit vivre nulle part ailleurs qu'en base, hache).
  return `sess:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 32)}`;
}

const roomLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => discordRoomLimitKey(req),
  message: { success: false, error: { code: "rate_limited", message: "Trop de requêtes. Réessaye dans 1 minute." } },
  skip: req => {
    const key = process.env.E2E_BYPASS_KEY;
    return Boolean(key) && req.headers["x-e2e-key"] === key;
  },
});

router.get("/config", (req, res) => discordController.config(req, res));
router.post("/room", roomLimiter, (req, res) => discordController.room(req, res));

export default router;
