/**
 * Un mot apres Oui ou Pas trop (T32, demande de Tym du 07/11/2026).
 *
 * L'avis part au clic, comme avant : on ne le perd pas si le joueur ferme.
 * Le serveur rend alors un jeton qui permet, une seule fois, d'ajouter un
 * texte a CETTE ligne de game_feedback :
 *
 *   <id>.<HMAC-SHA256 en base64url>
 *
 * - Une seule ligne par avis : les compteurs Oui / Pas trop ne bougent pas.
 * - Le jeton ne se deduit pas de l'id (les id se suivent) : il faut le secret.
 * - Le texte ne s'ecrit que sur un avis sans message, cree il y a moins
 *   d'une heure. Un deuxieme envoi ne remplace jamais le premier.
 *
 * Secret : SESSION_SECRET (toujours pose sur le backend). A defaut, une cle
 * tiree au demarrage : un redemarrage entre le clic et le texte fait alors
 * seulement refuser le texte, l'avis reste.
 */
import crypto from "crypto";
import { pool } from "../config/db";
import type { FeedbackAnswer, FeedbackMode } from "../utils/feedbackValidation";

export const FOLLOW_UP_WINDOW_MINUTES = 60;
const TOKEN_FORMAT = /^([1-9]\d{0,9})\.([A-Za-z0-9_-]{43})$/;
const MAX_TOKEN_LENGTH = 60;
const MAX_ID = 2_147_483_647;

let fallbackKey: string | null = null;

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (!fallbackKey) fallbackKey = crypto.randomBytes(32).toString("hex");
  return fallbackKey;
}

function signature(id: number, key: string): string {
  return crypto.createHmac("sha256", key).update(`blindz-avis-suite:v1:${id}`).digest("base64url");
}

export function signFollowUp(id: number, key = secret()): string {
  return `${id}.${signature(id, key)}`;
}

/** L'id de l'avis si le jeton est bon, sinon null. Ne leve jamais. */
export function verifyFollowUp(token: unknown, key = secret()): number | null {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const match = TOKEN_FORMAT.exec(token);
  if (!match) return null;
  const id = Number(match[1]);
  if (id > MAX_ID) return null;
  const expected = Buffer.from(signature(id, key));
  const given = Buffer.from(match[2]);
  // Longueurs egales garanties par TOKEN_FORMAT (43 caracteres).
  return crypto.timingSafeEqual(expected, given) ? id : null;
}

export type FollowUpSaved = { mode: FeedbackMode; answer: FeedbackAnswer };

/**
 * Ajoute le texte a l'avis. null si l'avis n'existe plus, a deja un texte ou
 * date de plus d'une heure : rien n'est ecrit.
 */
export async function saveFollowUp(id: number, message: string): Promise<FollowUpSaved | null> {
  const { rows } = await pool.query<FollowUpSaved>(
    `UPDATE game_feedback SET message = $2
     WHERE id = $1 AND kind = 'avis' AND message IS NULL
       AND created_at > NOW() - INTERVAL '${FOLLOW_UP_WINDOW_MINUTES} minutes'
     RETURNING mode, answer`,
    [id, message]
  );
  return rows[0] ?? null;
}
