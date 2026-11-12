import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { ipRateLimitKey } from "../utils/rateLimitKey";

/**
 * Limites propres a l'import YouTube, devant /api/import et /api/quick-play.
 * Un import YouTube coute jusqu'a 5 unites du quota Google (10 000 par jour)
 * et jusqu'a 200 recherches Deezer : sans borne, une seule IP pouvait vider le
 * quota du jour ou occuper le debit Deezer des parties en cours.
 *
 * - 20 requetes YouTube par 10 min et par IP (un import = 2 requetes : la
 *   playlist puis ses titres) ; une soiree derriere une box partage l'IP.
 * - Un seul import YouTube a la fois par IP.
 * Les requetes Spotify et Deezer ne sont pas comptees.
 */
export const YOUTUBE_MAX_PER_WINDOW = 20;
export const YOUTUBE_WINDOW_MS = 10 * 60_000;

const YOUTUBE_URL = /^(https?:\/\/)?([a-z0-9-]+\.)?(youtube\.com|youtu\.be)(\/|$|\?)/i;

/** Vrai si la requete vise YouTube : un lien YouTube, ou provider "youtube". */
export function isYoutubeRequest(req: Request): boolean {
  const body = (req.body ?? {}) as { url?: unknown; provider?: unknown };
  if (body.provider === "youtube") return true;
  return typeof body.url === "string" && YOUTUBE_URL.test(body.url.trim());
}

function bypass(req: Request): boolean {
  const key = process.env.E2E_BYPASS_KEY;
  return Boolean(key && req.headers["x-e2e-key"] === key);
}

export function createYoutubeLimiter(): RequestHandler {
  return rateLimit({
    windowMs: YOUTUBE_WINDOW_MS,
    max: YOUTUBE_MAX_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `yt:${ipRateLimitKey(req.ip)}`,
    skip: req => bypass(req) || !isYoutubeRequest(req),
    message: {
      success: false,
      error: { code: "rate_limited", message: "Beaucoup d'imports YouTube d'un coup. Attends quelques minutes avant le prochain." },
    },
  });
}

const inFlight = new Set<string>();

/** Un import YouTube a la fois par IP ; la place se libere quand la reponse part. */
export function youtubeOneAtATime(req: Request, res: Response, next: NextFunction): void {
  if (!isYoutubeRequest(req) || bypass(req)) {
    next();
    return;
  }
  const key = ipRateLimitKey(req.ip);
  if (inFlight.has(key)) {
    res.status(429).json({
      success: false,
      data: null,
      error: { code: "youtube_busy", message: "Un import YouTube est déjà en cours. Attends qu'il finisse." },
    });
    return;
  }
  inFlight.add(key);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    inFlight.delete(key);
  };
  res.on("finish", release);
  res.on("close", release);
  next();
}

/** Le compteur commun a l'import et a la partie rapide. */
export const youtubeLimiter: RequestHandler = createYoutubeLimiter();
