/**
 * Lien d'overlay OBS du mode streamer (T5). Meme forme que le lien spectateur
 * de T18 (spectatorToken.ts) : <expiration>.<HMAC-SHA256 base64url>, signe sur
 * le code de la salle, son id en base et l'expiration.
 *
 * Secret a part, OVERLAY_SECRET (32 caracteres au moins, `openssl rand -hex 32`),
 * pour pouvoir le changer sans casser les liens spectateur. Sans lui, pas de
 * lien d'overlay : le streamer le voit dans le lobby.
 *
 * L'overlay recoit l'extrait (il joue le son dans OBS) : ce lien ne doit
 * jamais sortir de chez le streamer. D'ou la signature, et une duree limitee
 * a une longue soiree de live.
 */
import { signRoomToken, verifyRoomToken, type SpectatorTokenCheck } from "./spectatorToken";

export const OVERLAY_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function readOverlaySecret(env: Env = process.env): string | null {
  const value = env.OVERLAY_SECRET?.trim();
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

export function signOverlayToken(input: { roomCode: string; roomId: number; expiresAt: number }, secret: string): string {
  return signRoomToken("overlay", input, secret);
}

export function verifyOverlayToken(
  args: { roomCode: string; roomId: number; token: unknown; now?: number },
  secret: string,
): SpectatorTokenCheck {
  return verifyRoomToken("overlay", OVERLAY_TTL_MS, args, secret);
}

/** Adresse de la page overlay du front, a coller dans une source navigateur d'OBS. */
export function overlayLink(frontendBase: string, roomCode: string, token: string): string {
  const base = frontendBase.replace(/\/+$/, "");
  return `${base}/streamer/overlay/?salle=${encodeURIComponent(roomCode)}&jeton=${encodeURIComponent(token)}`;
}
