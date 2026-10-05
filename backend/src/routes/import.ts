import { Router } from "express";
import rateLimit from "express-rate-limit";
import { importController } from "../controllers/importController";

const router = Router();

// Les imports declenchent des appels a Deezer et Spotify depuis l'adresse du
// VPS : trop d'appels et Deezer (Akamai) bloque cette adresse pour tous les
// joueurs. La limite generale de l'API (600 requetes/min) laissait passer 600
// imports par minute depuis une seule adresse.
// 60 par quart d'heure et par adresse : une soiree se joue derriere UNE box
// (douze joueurs, une adresse publique), chacun fait 2 requetes pour importer
// son profil (playlists puis sync-all), avec de la marge pour les reessais.
export const IMPORT_LIMIT_WINDOW_MS = 15 * 60_000;
export const IMPORT_LIMIT_MAX = 60;

const importLimiter = rateLimit({
  windowMs: IMPORT_LIMIT_WINDOW_MS,
  max: IMPORT_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: "rate_limited", message: "Trop d'imports depuis cette connexion. Réessaye dans quelques minutes." },
  },
  // Meme secret que authLimiter (index.ts) : la pile de test et les E2E
  // tournent depuis le VPS, une exemption par adresse ouvrirait la porte a
  // tout ce qui sort de cette machine.
  skip: req => {
    const key = process.env.E2E_BYPASS_KEY;
    return Boolean(key) && req.headers["x-e2e-key"] === key;
  },
});

router.use(importLimiter);

router.post("/playlists", (req, res) => importController.playlists(req, res));
router.post("/sync", (req, res) => importController.sync(req, res));
router.post("/sync-all", (req, res) => importController.syncAll(req, res));

export default router;
