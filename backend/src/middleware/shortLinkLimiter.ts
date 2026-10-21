import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { ipRateLimitKey } from "../utils/rateLimitKey";
import { isShortLink } from "../services/shortLinkResolver";

/**
 * Limite propre aux liens courts des applis, devant l'import et la partie
 * rapide. Ouvrir un lien court, c'est jusqu'a 5 requetes sortantes vers Deezer
 * ou Branch (Spotify) : sans cette limite, une seule IP pouvait en lancer
 * 10 par seconde par /api/quick-play (sans compte), occuper les 5 places du
 * resolveur et faire bloquer l'IP du serveur chez eux. Les liens longs ne sont
 * pas comptes. Une resolution a la fois par IP en plus (shortLinkResolver).
 *
 * Une soiree derriere une seule box partage une IP : 10 liens courts par
 * minute pour toute la tablee. Un lien deja ouvert sort du cache, mais compte.
 */
export const SHORT_LINK_MAX_PER_MINUTE = 10;

/** Le compteur commun a l'import et a la partie rapide (meme IP, meme quota). */
export const shortLinkLimiter: RequestHandler = createShortLinkLimiter();

export function createShortLinkLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    max: SHORT_LINK_MAX_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => ipRateLimitKey(req.ip),
    // Seulement les liens courts ; la cle E2E de la pile passe outre, comme
    // pour authLimiter (index.ts).
    skip: req => {
      const key = process.env.E2E_BYPASS_KEY;
      if (key && req.headers["x-e2e-key"] === key) return true;
      const url = (req.body as { url?: unknown } | undefined)?.url;
      return typeof url !== "string" || !isShortLink(url);
    },
    message: {
      success: false,
      error: { code: "rate_limited", message: "Beaucoup de liens courts d'un coup. Attends une minute, ou colle l'adresse complète." },
    },
  });
}
