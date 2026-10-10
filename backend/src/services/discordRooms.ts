import fs from "fs";
import path from "path";
import { pool } from "../config/db";
import { generateRoomCode } from "../utils/roomCode";

/**
 * Un salon Discord egale une salle Blindz.
 *
 * Tous ceux qui lancent l'Activite dans le meme salon partagent l'instanceId
 * du SDK. Le premier arrive cree la salle (mode "a distance", comme un duel
 * entre amis), les suivants la retrouvent par cet identifiant, sans code ni
 * QR. L'identifiant vient du client : il donne acces a la salle exactement
 * comme un code de salle, ni plus ni moins (l'entree passe ensuite par le
 * join habituel, avec ses controles).
 *
 * Deux joueurs qui lancent l'Activite au meme instant : un verrou consultatif
 * par instance, dans la transaction, les fait passer l'un apres l'autre ; le
 * second retrouve la salle du premier. Un index unique (migration 006) tient
 * la meme promesse cote base.
 */

// Un identifiant d'instance observe fait une soixantaine de caracteres
// (i-<19 chiffres>-gc-<19>-<19>) : 128 laisse de la marge si Discord l'allonge.
export const DISCORD_INSTANCE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

export function isValidInstanceId(value: unknown): value is string {
  return typeof value === "string" && DISCORD_INSTANCE_ID_PATTERN.test(value);
}

export type DiscordRoomRow = {
  id: number;
  room_code: string;
  host_user_id: number;
  name: string | null;
  status: string;
  max_players: number;
  question_count: number;
  difficulty: string;
  mode: string;
  host_plays: boolean;
  auto_advance: boolean;
  session_id: number | null;
  round_duration_ms: number | null;
  discord_instance_id: string;
};

// Memes valeurs par defaut que POST /api/rooms/create.
const MAX_PLAYERS = 12;
const QUESTION_COUNT = 10;

const ROOM_COLUMNS =
  "id, room_code, host_user_id, name, status, max_players, question_count, difficulty, mode, host_plays, auto_advance, session_id, round_duration_ms, discord_instance_id";

export async function resolveDiscordRoom(
  instanceId: string,
  host: { id: number },
  nickname: string | null,
): Promise<{ room: DiscordRoomRow; created: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [instanceId]);
    const existing = await client.query<DiscordRoomRow>(
      `SELECT ${ROOM_COLUMNS} FROM multiplayer_rooms WHERE discord_instance_id=$1 ORDER BY id DESC LIMIT 1`,
      [instanceId],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { room: existing.rows[0], created: false };
    }
    const inserted = await client.query<DiscordRoomRow>(
      `INSERT INTO multiplayer_rooms
         (room_code, host_user_id, name, status, max_players, question_count, difficulty, mode, host_plays, auto_advance, discord_instance_id)
       VALUES ($1, $2, NULL, 'waiting', $3, $4, 'normal', $5, FALSE, FALSE, $6)
       RETURNING ${ROOM_COLUMNS}`,
      [generateRoomCode(), host.id, MAX_PLAYERS, QUESTION_COUNT, "friends", instanceId],
    );
    const room = inserted.rows[0];
    await client.query(
      `INSERT INTO room_participants (room_id, user_id, is_ready, nickname)
       VALUES ($1, $2, TRUE, $3)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [room.id, host.id, nickname],
    );
    await client.query("COMMIT");
    return { room, created: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// dist/services en prod, src/services en test : le dossier migrations est a
// la racine du backend dans les deux cas (il entre dans l'image Docker).
const MIGRATION = path.resolve(__dirname, "../../migrations/006_discord_rooms.sql");

/**
 * Rejoue la migration 006 (idempotente) au demarrage : la pile de test et la
 * CI partent du schema de la prod et ne l'ont pas encore. En prod, elle est
 * appliquee a la main avec le deploiement, et ce rejeu ne prend aucun verrou
 * (rien a creer).
 */
export async function ensureDiscordSchema(): Promise<void> {
  const sql = await fs.promises.readFile(MIGRATION, "utf8");
  await pool.query(sql);
}
