import type { Request, Response } from "express";
import { fail } from "../utils/response";
import { logger } from "../utils/logger";
import { ipRateLimitKey } from "../utils/rateLimitKey";
import { parseProfileLink, type ResolvedProfileLink } from "../services/profileImportService";
import { ShortLinkError, shortLinkFailure } from "../services/shortLinkResolver";

/**
 * Le lien de playlist ou de profil d'une requete (import, partie rapide),
 * lien court des applis compris. null : la reponse d'erreur est deja partie.
 */
export async function profileLinkOrFail(req: Request, res: Response, url: string): Promise<ResolvedProfileLink | null> {
  try {
    // Une resolution de lien court a la fois par joueur (meme cle que les limiteurs).
    const link = await parseProfileLink(url, { clientKey: ipRateLimitKey(req.ip) });
    if (!link) fail(res, "unsupported_url", "URL non reconnue. Utilise un lien de profil ou playlist Spotify ou Deezer.");
    return link;
  } catch (err) {
    if (err instanceof ShortLinkError) {
      logger.warn("short_link_failed", { code: err.code, detail: err.message });
      const { status, message } = shortLinkFailure(err.code);
      fail(res, "short_link_failed", message, status);
      return null;
    }
    logger.error("profile_link_failed", { error: err });
    fail(res, "unsupported_url", "URL non reconnue. Utilise un lien de profil ou playlist Spotify ou Deezer.");
    return null;
  }
}
