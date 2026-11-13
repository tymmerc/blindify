import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { ipRateLimitKey } from "../utils/rateLimitKey";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";
import {
  PHOTO_UPLOAD_MAX_BYTES,
  PhotoError,
  deleteUserPhoto,
  parsePhotoFile,
  processPhoto,
  readUserPhoto,
  saveUserPhoto,
} from "../services/userPhotos";

// Par adresse IP (une IPv6 compte pour son /64). Une soiree se joue derriere
// une seule box : douze joueurs qui mettent leur photo et en changent une fois,
// c'est deja 24 envois. 40 en 10 minutes laisse passer la tablee et borne un
// script. Chaque envoi coute un decodage d'image : plafond global en plus.
export const PHOTO_WINDOW_MS = 10 * 60_000;
export const PHOTO_MAX_PER_WINDOW = 40;
export const PHOTO_GLOBAL_WINDOW_MS = 60 * 60_000;
export const PHOTO_GLOBAL_MAX = 600;

const limitedBody = {
  success: false,
  data: null,
  error: { code: "rate_limited", message: "Beaucoup de photos d'un coup. Réessaie dans quelques minutes." },
};

// La cle E2E de la pile passe outre, comme pour authLimiter (index.ts).
const e2eBypass = (req: Request): boolean => {
  const key = process.env.E2E_BYPASS_KEY;
  return Boolean(key) && req.headers["x-e2e-key"] === key;
};

export function createPhotoLimiters(): RequestHandler[] {
  return [
    rateLimit({
      windowMs: PHOTO_GLOBAL_WINDOW_MS,
      max: PHOTO_GLOBAL_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: () => "global",
      skip: e2eBypass,
      message: limitedBody,
    }),
    rateLimit({
      windowMs: PHOTO_WINDOW_MS,
      max: PHOTO_MAX_PER_WINDOW,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: req => ipRateLimitKey(req.ip),
      skip: e2eBypass,
      message: limitedBody,
    }),
  ];
}

// Le corps est lu en octets bruts quel que soit le type annonce : le format
// est verifie sur le contenu (services/userPhotos.ts), pas sur l'en-tete.
const rawImage = express.raw({ type: () => true, limit: PHOTO_UPLOAD_MAX_BYTES });

function readBody(req: Request, res: Response, next: NextFunction): void {
  rawImage(req, res, (err?: unknown) => {
    if (err) {
      const tooLarge = (err as { type?: unknown }).type === "entity.too.large";
      fail(
        res,
        tooLarge ? "image_too_large" : "invalid_body",
        tooLarge ? "Cette photo est trop lourde (6 Mo au plus)." : "Envoi de la photo interrompu, réessaie.",
        tooLarge ? 413 : 400
      );
      return;
    }
    next();
  });
}

const PHOTO_ERRORS: Record<PhotoError["code"], { status: number; message: string }> = {
  not_an_image: { status: 415, message: "Ce fichier n'est pas une photo. Prends un JPEG, un PNG ou un WebP." },
  image_too_large: { status: 413, message: "Cette photo est trop grande. Essaie avec une autre." },
  image_unreadable: { status: 422, message: "Impossible de lire cette photo. Essaie avec une autre." },
};

async function upload(req: Request, res: Response): Promise<void> {
  const context = await getSessionContext(req, res, { autoExtend: true });
  if (!context) return;
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    fail(res, "image_required", "Aucune photo reçue.", 400);
    return;
  }
  try {
    const image = await processPhoto(body);
    const avatar = await saveUserPhoto(context.user.id, image);
    ok(res, { avatar }, 201);
  } catch (err) {
    if (err instanceof PhotoError) {
      const { status, message } = PHOTO_ERRORS[err.code];
      fail(res, err.code, message, status);
      return;
    }
    logger.error("photo_upload_failed", { error: err, userId: context.user.id });
    fail(res, "photo_upload_failed", "La photo n'a pas pu être enregistrée. Réessaie.", 500);
  }
}

async function remove(req: Request, res: Response): Promise<void> {
  const context = await getSessionContext(req, res, { autoExtend: true });
  if (!context) return;
  try {
    await deleteUserPhoto(context.user.id);
    ok(res, { avatar: null });
  } catch (err) {
    logger.error("photo_delete_failed", { error: err, userId: context.user.id });
    fail(res, "photo_delete_failed", "La photo n'a pas pu être retirée. Réessaie.", 500);
  }
}

/**
 * La photo elle-meme. Sans session : l'Activite Discord, l'ecran spectateur et
 * l'image de partage l'affichent aussi. L'adresse ne se devine pas (id
 * aleatoire, change a chaque photo) et ne circule qu'entre joueurs d'une salle
 * et sur le profil ; elle n'est pas indexee.
 */
async function serve(req: Request, res: Response): Promise<void> {
  const id = parsePhotoFile(String(req.params.file ?? ""));
  if (!id) {
    fail(res, "not_found", "Photo introuvable", 404);
    return;
  }
  try {
    const image = await readUserPhoto(id);
    if (!image) {
      fail(res, "not_found", "Photo introuvable", 404);
      return;
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", String(image.length));
    // Une adresse = une photo pour toujours (nouvel id a chaque changement).
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("X-Robots-Tag", "noindex, noimageindex");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.status(200).end(image);
  } catch (err) {
    logger.error("photo_read_failed", { error: err });
    fail(res, "photo_read_failed", "Photo indisponible", 500);
  }
}

export const photosController = { upload, remove, serve };

export function createPhotosRouter(limiters: RequestHandler[] = createPhotoLimiters()): Router {
  const router = Router();
  router.post("/", ...limiters, readBody, (req, res) => void upload(req, res));
  router.delete("/", (req, res) => void remove(req, res));
  router.get("/:file", (req, res) => void serve(req, res));
  return router;
}

export default createPhotosRouter();
