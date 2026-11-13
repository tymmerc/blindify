import fs from "fs";
import path from "path";
import sharp from "sharp";
import type { PoolClient } from "pg";
import { pool } from "../config/db";

/**
 * Photo de profil (T39), table user_photos (migration 008).
 *
 * Ce qu'arrive du navigateur n'est jamais garde tel quel : on lit les premiers
 * octets pour savoir si c'est vraiment un JPEG, un PNG ou un WebP (l'extension
 * et le type annonce ne prouvent rien), puis sharp redresse l'image, la
 * recadre en carre, la reduit a 256 px et la reencode en WebP. Le reencodage
 * laisse tomber toutes les metadonnees (EXIF, position GPS, profil).
 *
 * L'adresse affichee est rangee dans users.avatar, deja lue par la salle, le
 * socket et les amis : la photo suit le joueur partout sans toucher ces
 * chemins. Elle commence par PHOTO_PATH_PREFIX, relative a l'API ; le front la
 * complete avec l'adresse de l'API (PlayerAvatar).
 */

export const PHOTO_PATH_PREFIX = "/api/photos/";
export const PHOTO_SIZE_PX = 256;
/** Ce qu'on accepte a l'envoi. Le front reduit deja la photo, c'est une marge. */
export const PHOTO_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
/** Plafond de la photo reencodee, le meme que la contrainte de la table. */
export const PHOTO_MAX_BYTES = 256 * 1024;
// Une photo de telephone fait 12 a 50 Mpx ; au-dela on refuse sans decoder
// (une petite image peut annoncer des dimensions enormes).
const MAX_INPUT_PIXELS = 60_000_000;

export type PhotoInputType = "jpeg" | "png" | "webp";

export class PhotoError extends Error {
  constructor(public readonly code: "not_an_image" | "image_too_large" | "image_unreadable") {
    super(code);
    this.name = "PhotoError";
  }
}

/** Le vrai format, lu dans les octets magiques. null si ce n'en est aucun des trois. */
export function detectImageType(data: Buffer): PhotoInputType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

// Machine partagee : une image a la fois, pas de cache de libvips en memoire.
sharp.cache(false);
sharp.concurrency(1);

/** Recadre, reduit et reencode. Lance PhotoError si l'entree ne convient pas. */
export async function processPhoto(data: Buffer): Promise<Buffer> {
  if (data.length > PHOTO_UPLOAD_MAX_BYTES) throw new PhotoError("image_too_large");
  const type = detectImageType(data);
  if (!type) throw new PhotoError("not_an_image");

  let out: Buffer;
  try {
    // Le decodeur est force sur le format reconnu : jamais de SVG, PDF ou
    // autre format que libvips saurait lire derriere un faux en-tete.
    const image = sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false });
    const meta = await image.metadata();
    if (meta.format !== type) throw new PhotoError("not_an_image");
    out = await image
      .rotate() // applique l'orientation EXIF avant qu'elle disparaisse
      .resize(PHOTO_SIZE_PX, PHOTO_SIZE_PX, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (err) {
    if (err instanceof PhotoError) throw err;
    const message = err instanceof Error ? err.message : "";
    if (/pixel limit/i.test(message)) throw new PhotoError("image_too_large");
    throw new PhotoError("image_unreadable");
  }
  if (out.length > PHOTO_MAX_BYTES) throw new PhotoError("image_too_large");
  return out;
}

export function photoPath(id: string): string {
  return `${PHOTO_PATH_PREFIX}${id}.webp`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** L'id d'une adresse /api/photos/<id>.webp, ou null si elle n'en est pas une. */
export function parsePhotoFile(file: string): string | null {
  const match = /^([0-9a-f-]{36})\.webp$/.exec(file);
  return match && UUID.test(match[1]) ? match[1] : null;
}

/**
 * Enregistre la photo deja traitee et la met en avatar. Un nouvel id a chaque
 * fois : l'ancienne adresse ne sert plus. Rend la nouvelle adresse.
 */
export async function saveUserPhoto(userId: number, image: Buffer): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO user_photos (user_id, image, mime_type)
       VALUES ($1, $2, 'image/webp')
       ON CONFLICT (user_id) DO UPDATE
         SET id = gen_random_uuid(), image = EXCLUDED.image, created_at = NOW()
       RETURNING id`,
      [userId, image]
    );
    const avatar = photoPath(rows[0].id);
    await client.query(`UPDATE users SET avatar = $2 WHERE id = $1`, [userId, avatar]);
    await client.query("COMMIT");
    return avatar;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Retire la photo du joueur. L'avatar ne repart a vide que s'il etait cette photo. */
export async function deleteUserPhoto(userId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM user_photos WHERE user_id = $1`, [userId]);
    await client.query(
      `UPDATE users SET avatar = NULL WHERE id = $1 AND avatar LIKE $2`,
      [userId, `${PHOTO_PATH_PREFIX}%`]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function readUserPhoto(id: string): Promise<Buffer | null> {
  const { rows } = await pool.query<{ image: Buffer }>(`SELECT image FROM user_photos WHERE id = $1`, [id]);
  return rows[0]?.image ?? null;
}

/**
 * T26 : le compte reprend la photo de l'invite s'il n'en a pas. S'il en a
 * une, il la garde ; celle de l'invite part avec lui (janitor, cascade).
 * A appeler dans la transaction de absorbGuest.
 */
export async function moveGuestPhoto(client: PoolClient, guestId: number, accountId: number): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `UPDATE user_photos SET user_id = $2
     WHERE user_id = $1 AND NOT EXISTS (SELECT 1 FROM user_photos WHERE user_id = $2)
     RETURNING id`,
    [guestId, accountId]
  );
  if (!rows[0]) return;
  await client.query(`UPDATE users SET avatar = $2 WHERE id = $1`, [accountId, photoPath(rows[0].id)]);
  await client.query(`UPDATE users SET avatar = NULL WHERE id = $1`, [guestId]);
}

// dist/services en prod, src/services en test : le dossier migrations est a
// la racine du backend dans les deux cas (il entre dans l'image Docker).
const MIGRATION = path.resolve(__dirname, "../../migrations/008_user_photos.sql");

/** Rejoue la migration 008 (idempotente) au demarrage, comme 005 et 006. */
export async function ensureUserPhotosSchema(): Promise<void> {
  const sql = await fs.promises.readFile(MIGRATION, "utf8");
  await pool.query(sql);
}
