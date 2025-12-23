import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { fail, ok } from "../utils/response";
import { emitToUser } from "../services/presence";
import {
  ensureSocialTables,
  expireOldInvitations,
  type RoomInvitationRow,
  type ExpiredInvitation,
  getFriendshipBetween,
  INVITATION_TTL_MS,
  pendingInvitationFor,
  fetchPendingInvitation,
} from "../services/social";
import { io } from "../socket";

/*
Flow critique (invitation multijoueur) :
 1. A envoie /api/invitations/send → validation (amis, room ouverte, capacité).
 2. Invitation persistée avec TTL, event socket "room:invite" pour B.
 3. B accepte /api/invitations/accept → validation complète (ami + room + non expirée).
 4. Backend ajoute B dans la room, met l'invitation à jour.
 5. Events socket : "room:invite:accepted" (A), "player-joined" (room).
 6. Front redirige B sur la room et s'y connecte en socket.
*/

type RoomSummary = {
  id: number;
  room_code: string;
  host_user_id: number;
  status: string;
  max_players: number;
  session_id: number | null;
};

type InvitationView = RoomInvitationRow & {
  from_username: string | null;
  from_avatar: string | null;
};

async function loadRoom(roomCode: string): Promise<RoomSummary | null> {
  const { rows } = await pool.query<RoomSummary>(
    `SELECT id, room_code, host_user_id, status, max_players, session_id
     FROM multiplayer_rooms
     WHERE room_code=$1
     LIMIT 1`,
    [roomCode]
  );
  return rows[0] ?? null;
}

async function assertRoomCapacity(room: RoomSummary): Promise<void> {
  const { rows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::INT AS total FROM room_participants WHERE room_id=$1`,
    [room.id]
  );
  if (rows[0]?.total >= room.max_players) {
    throw new Error("room_full");
  }
}

function checkExpiration(invitation: RoomInvitationRow): boolean {
  return new Date(invitation.expires_at).getTime() <= Date.now();
}

function emitExpired(expired: ExpiredInvitation[]): void {
  expired.forEach(invite => {
    const payload = {
      invitationId: invite.id,
      roomCode: invite.room_code,
    };
    emitToUser(invite.to_user, "room:invite:expired", payload);
    emitToUser(invite.from_user, "room:invite:expired", payload);
  });
}

export const invitationsController = {
  async send(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    await ensureSocialTables();
    emitExpired(await expireOldInvitations());

    const targetId = Number(req.body?.toUserId);
    const roomCode = typeof req.body?.roomCode === "string" ? req.body.roomCode.trim().toUpperCase() : "";

    if (!Number.isFinite(targetId)) {
      fail(res, "invalid_user", "Destinataire invalide", 400);
      return;
    }
    if (!roomCode) {
      fail(res, "invalid_room", "Code de room requis", 400);
      return;
    }
    if (targetId === context.user.id) {
      fail(res, "self_invite", "Impossible de s'auto-inviter", 400);
      return;
    }

    const room = await loadRoom(roomCode);
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }
    if (room.status !== "waiting") {
      fail(res, "room_locked", "La partie est verrouillée", 409);
      return;
    }

    const membership = await pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [
      room.id,
      context.user.id,
    ]);
    if (!membership.rows.length) {
      fail(res, "room_forbidden", "Tu dois être dans la room pour inviter", 403);
      return;
    }

    try {
      await assertRoomCapacity(room);
    } catch (err) {
      if ((err as Error).message === "room_full") {
        fail(res, "room_full", "La salle est pleine", 409);
        return;
      }
      throw err;
    }

    const friendship = await getFriendshipBetween(context.user.id, targetId);
    if (!friendship || friendship.status !== "accepted") {
      fail(res, "not_friends", "Invitation réservée aux amis", 403);
      return;
    }

    const pending = await pendingInvitationFor(room.id, context.user.id, targetId);
    if (pending && !checkExpiration(pending)) {
      fail(res, "invite_already_sent", "Invitation déjà envoyée", 409);
      return;
    }

    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const { rows } = await pool.query<RoomInvitationRow>(
      `INSERT INTO room_invitations (room_id, room_code, from_user, to_user, status, expires_at)
       VALUES ($1,$2,$3,$4,'pending',$5)
       RETURNING id, room_id, room_code, from_user, to_user, status, expires_at, created_at`,
      [room.id, room.room_code, context.user.id, targetId, expiresAt]
    );
    const invitation = rows[0];

    emitToUser(targetId, "room:invite", {
      invitationId: invitation.id,
      roomCode: room.room_code,
      expiresAt: invitation.expires_at,
      fromUser: {
        id: context.user.id,
        username: context.user.username,
        avatar: (context.user as any).avatar ?? null,
      },
    });

    ok(res, { invitation });
  },

  async accept(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    await ensureSocialTables();
    emitExpired(await expireOldInvitations());

    const invitationId = Number(req.body?.invitationId ?? req.params?.invitationId);
    if (!Number.isFinite(invitationId)) {
      fail(res, "invalid_invitation", "Invitation invalide", 400);
      return;
    }

    const invitation = await fetchPendingInvitation(invitationId, context.user.id);
    if (!invitation) {
      fail(res, "invitation_not_found", "Invitation introuvable ou expirée", 404);
      return;
    }
    if (invitation.status !== "pending" || checkExpiration(invitation)) {
      await pool.query(`UPDATE room_invitations SET status='expired' WHERE id=$1`, [invitation.id]);
      const payload = { invitationId: invitation.id, roomCode: invitation.room_code };
      emitToUser(invitation.to_user, "room:invite:expired", payload);
      emitToUser(invitation.from_user, "room:invite:expired", payload);
      fail(res, "invitation_expired", "Invitation expirée", 410);
      return;
    }

    const friendship = await getFriendshipBetween(context.user.id, invitation.from_user);
    if (!friendship || friendship.status !== "accepted") {
      fail(res, "not_friends", "Plus d'amitié active avec cet utilisateur", 403);
      return;
    }

    const room = await loadRoom(invitation.room_code);
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }
    if (room.status !== "waiting") {
      fail(res, "room_locked", "La partie est verrouillée", 409);
      return;
    }

    try {
      await assertRoomCapacity(room);
    } catch (err) {
      if ((err as Error).message === "room_full") {
        fail(res, "room_full", "La salle est pleine", 409);
        return;
      }
      throw err;
    }

    const already = await pool.query(
      `SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`,
      [room.id, context.user.id]
    );
    if (!already.rows.length) {
      await pool.query(
        `INSERT INTO room_participants (room_id, user_id, is_ready)
         VALUES ($1,$2,FALSE)
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [room.id, context.user.id]
      );
      io.to(room.room_code).emit("player-joined", {
        userId: context.user.id,
        username: context.user.username,
        roomCode: room.room_code,
      });
    }

    const { rows } = await pool.query<InvitationView>(
      `UPDATE room_invitations
       SET status='accepted'
       WHERE id=$1
       RETURNING id, room_id, room_code, from_user, to_user, status, expires_at, created_at,
         (SELECT username FROM users WHERE id=from_user) AS from_username,
         (SELECT avatar FROM users WHERE id=from_user) AS from_avatar`,
      [invitation.id]
    );
    const updated = rows[0];

    emitToUser(invitation.from_user, "room:invite:accepted", {
      invitationId: invitation.id,
      roomCode: room.room_code,
      userId: context.user.id,
    });

    ok(res, { invitation: updated, room, joined: true });
  },

  async decline(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    await ensureSocialTables();
    emitExpired(await expireOldInvitations());

    const invitationId = Number(req.body?.invitationId ?? req.params?.invitationId);
    if (!Number.isFinite(invitationId)) {
      fail(res, "invalid_invitation", "Invitation invalide", 400);
      return;
    }

    const invitation = await fetchPendingInvitation(invitationId, context.user.id);
    if (!invitation || invitation.status !== "pending") {
      fail(res, "invitation_not_found", "Invitation introuvable ou expirée", 404);
      return;
    }

    await pool.query(`UPDATE room_invitations SET status='declined' WHERE id=$1`, [invitation.id]);

    emitToUser(invitation.from_user, "room:invite:declined", {
      invitationId: invitation.id,
      roomCode: invitation.room_code,
      userId: context.user.id,
    });

    ok(res, { declined: true });
  },

  async pending(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    await ensureSocialTables();
    emitExpired(await expireOldInvitations());

    const { rows } = await pool.query<InvitationView>(
      `SELECT ri.id, ri.room_id, ri.room_code, ri.from_user, ri.to_user, ri.status, ri.expires_at, ri.created_at,
              u.username AS from_username,
              u.avatar AS from_avatar
       FROM room_invitations ri
       JOIN users u ON u.id = ri.from_user
       WHERE ri.to_user=$1 AND ri.status='pending'
       ORDER BY ri.created_at DESC`,
      [context.user.id]
    );

    ok(res, { invitations: rows });
  },
};
