import { pool } from "../config/db";
import { logger } from "../utils/logger";

/**
 * Relais de l'hote dans un salon Discord (decision de Tym du 10/10/2026).
 *
 * Dans Discord, la salle est le salon : on ne peut pas en recreer une, tout le
 * monde y revient. Si l'hote part, plus personne ne peut lancer ni rejouer.
 * Quand l'hote quitte le lobby ou le podium, le plus ancien joueur encore
 * present devient donc hote. En pleine partie, rien ne change : meme
 * comportement que sur le site (la partie continue, l'hote est marque absent).
 * Les salles du site ne sont jamais concernees.
 *
 * `presentIds` : joueurs encore la (socket vivant), dans n'importe quel ordre ;
 * l'ordre d'arrivee vient de la base. `fallbackId` : celui qui arrive, quand
 * personne d'autre n'est present.
 */
export type RelayResult =
  | { relayed: true; from: number; to: number }
  | { relayed: false; reason: "not_found" | "not_discord" | "not_host" | "in_game" | "nobody" };

type RoomRow = { id: number; host_user_id: number; status: string; discord_instance_id: string | null };

export async function relayDiscordHost(
  roomCode: string,
  leavingHostId: number,
  presentIds: readonly number[],
  fallbackId?: number,
): Promise<RelayResult> {
  const { rows } = await pool.query<RoomRow>(
    `SELECT id, host_user_id, status, discord_instance_id FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
    [roomCode],
  );
  const room = rows[0];
  if (!room) return { relayed: false, reason: "not_found" };
  if (!room.discord_instance_id) return { relayed: false, reason: "not_discord" };
  if (room.host_user_id !== leavingHostId) return { relayed: false, reason: "not_host" };
  if (room.status === "in_progress") return { relayed: false, reason: "in_game" };

  const others = presentIds.filter(id => id !== leavingHostId);
  const { rows: candidates } = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM room_participants
     WHERE room_id=$1 AND user_id = ANY($2::int[])
     ORDER BY joined_at ASC, id ASC LIMIT 1`,
    [room.id, others],
  );
  const next = candidates[0]?.user_id ?? (fallbackId && fallbackId !== leavingHostId ? fallbackId : null);
  if (!next) return { relayed: false, reason: "nobody" };

  // Garde : l'hote n'a pas change entre la lecture et l'ecriture (deux departs simultanes).
  const { rowCount } = await pool.query(
    `UPDATE multiplayer_rooms SET host_user_id=$1 WHERE id=$2 AND host_user_id=$3`,
    [next, room.id, leavingHostId],
  );
  if (!rowCount) return { relayed: false, reason: "not_host" };
  logger.info("discord_host_relayed", { roomCode, from: leavingHostId, to: next });
  return { relayed: true, from: leavingHostId, to: next };
}
