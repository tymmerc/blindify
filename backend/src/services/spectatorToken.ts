/**
 * Lien spectateur (T18, decision de Tym du 28/10/2026) : Tym recoit par mail
 * un lien pour regarder une partie en direct. Le lien porte un jeton signe :
 *
 *   <expiration en ms>.<HMAC-SHA256 en base64url>
 *
 * La signature couvre le code de la salle ET son id en base (un code peut
 * resservir a une autre salle plus tard) et l'expiration. Le secret est
 * SPECTATEUR_SECRET, pose par Tym dans l'environnement du backend (32
 * caracteres au moins, `openssl rand -hex 32`). Sans lui, pas de lien.
 * Le jeton ne se deduit jamais du code : il faut le secret.
 */
import crypto from "crypto";

export const SPECTATOR_TTL_MS = 3 * 60 * 60 * 1000;
/** Marge d'horloge acceptee sur l'expiration annoncee (jeton signe ailleurs). */
const CLOCK_SLACK_MS = 60_000;
const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 120;
const TOKEN_FORMAT = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/;

export type SpectatorTokenInput = { roomCode: string; roomId: number; expiresAt: number };
export type SpectatorTokenCheck =
  | { ok: true; expiresAt: number }
  | { ok: false; reason: "malformed" | "expired" | "too_long" | "bad_signature" };

/** Le secret, ou null s'il manque ou s'il est trop court. Jamais affiche. */
export function readSpectatorSecret(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string | null {
  const value = env.SPECTATEUR_SECRET?.trim();
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

/**
 * Usage du jeton, mele a la signature : un jeton spectateur ne vaut rien comme
 * jeton d'overlay (T5), et inversement, meme avec le meme secret.
 */
export type RoomTokenPurpose = "spectateur" | "overlay";

function signature(purpose: RoomTokenPurpose, { roomCode, roomId, expiresAt }: SpectatorTokenInput, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`blindz-${purpose}:v1:${roomCode}:${roomId}:${expiresAt}`)
    .digest("base64url");
}

export function signRoomToken(purpose: RoomTokenPurpose, input: SpectatorTokenInput, secret: string): string {
  return `${input.expiresAt}.${signature(purpose, input, secret)}`;
}

export function signSpectatorToken(input: SpectatorTokenInput, secret: string): string {
  return signRoomToken("spectateur", input, secret);
}

/**
 * Verifie un jeton pour une salle donnee. Ne leve jamais : toute entree
 * inattendue est un refus "malformed".
 */
export function verifySpectatorToken(
  args: { roomCode: string; roomId: number; token: unknown; now?: number },
  secret: string,
): SpectatorTokenCheck {
  return verifyRoomToken("spectateur", SPECTATOR_TTL_MS, args, secret);
}

/** Verification commune aux jetons de salle (spectateur, overlay). */
export function verifyRoomToken(
  purpose: RoomTokenPurpose,
  ttlMs: number,
  { roomCode, roomId, token, now = Date.now() }: { roomCode: string; roomId: number; token: unknown; now?: number },
  secret: string,
): SpectatorTokenCheck {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "malformed" };
  const match = TOKEN_FORMAT.exec(token);
  if (!match) return { ok: false, reason: "malformed" };
  const expiresAt = Number(match[1]);
  const expected = Buffer.from(signature(purpose, { roomCode, roomId, expiresAt }, secret));
  const given = Buffer.from(match[2]);
  // Longueurs egales garanties par TOKEN_FORMAT (43 caracteres) : comparaison
  // a temps constant.
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (expiresAt <= now) return { ok: false, reason: "expired" };
  if (expiresAt - now > ttlMs + CLOCK_SLACK_MS) return { ok: false, reason: "too_long" };
  return { ok: true, expiresAt };
}

/** Lien de la page spectateur du front (FRONTEND_URL, ou SPECTATEUR_BASE_URL). */
export function spectatorLink(frontendBase: string, roomCode: string, token: string): string {
  const base = frontendBase.replace(/\/+$/, "");
  return `${base}/spectateur/?salle=${encodeURIComponent(roomCode)}&jeton=${encodeURIComponent(token)}`;
}
