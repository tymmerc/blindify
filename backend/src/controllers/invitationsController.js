"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitationsController = void 0;
const db_1 = require("../config/db");
const session_1 = require("../utils/session");
const response_1 = require("../utils/response");
const presence_1 = require("../services/presence");
const social_1 = require("../services/social");
const socket_1 = require("../socket");
async function loadRoom(roomCode) {
    const { rows } = await db_1.pool.query(`SELECT id, room_code, host_user_id, status, max_players, session_id
     FROM multiplayer_rooms
     WHERE room_code=$1
     LIMIT 1`, [roomCode]);
    return rows[0] ?? null;
}
async function assertRoomCapacity(room) {
    const { rows } = await db_1.pool.query(`SELECT COUNT(*)::INT AS total FROM room_participants WHERE room_id=$1`, [room.id]);
    if (rows[0]?.total >= room.max_players) {
        throw new Error("room_full");
    }
}
function checkExpiration(invitation) {
    return new Date(invitation.expires_at).getTime() <= Date.now();
}
exports.invitationsController = {
    async send(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        await (0, social_1.expireOldInvitations)();
        const targetId = Number(req.body?.toUserId);
        const roomCode = typeof req.body?.roomCode === "string" ? req.body.roomCode.trim().toUpperCase() : "";
        if (!Number.isFinite(targetId)) {
            (0, response_1.fail)(res, "invalid_user", "Destinataire invalide", 400);
            return;
        }
        if (!roomCode) {
            (0, response_1.fail)(res, "invalid_room", "Code de room requis", 400);
            return;
        }
        if (targetId === context.user.id) {
            (0, response_1.fail)(res, "self_invite", "Impossible de s'auto-inviter", 400);
            return;
        }
        const room = await loadRoom(roomCode);
        if (!room) {
            (0, response_1.fail)(res, "room_not_found", "Salle introuvable", 404);
            return;
        }
        if (room.status !== "waiting") {
            (0, response_1.fail)(res, "room_locked", "La partie est verrouillée", 409);
            return;
        }
        const membership = await db_1.pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [
            room.id,
            context.user.id,
        ]);
        if (!membership.rows.length) {
            (0, response_1.fail)(res, "room_forbidden", "Tu dois être dans la room pour inviter", 403);
            return;
        }
        try {
            await assertRoomCapacity(room);
        }
        catch (err) {
            if (err.message === "room_full") {
                (0, response_1.fail)(res, "room_full", "La salle est pleine", 409);
                return;
            }
            throw err;
        }
        const friendship = await (0, social_1.getFriendshipBetween)(context.user.id, targetId);
        if (!friendship || friendship.status !== "accepted") {
            (0, response_1.fail)(res, "not_friends", "Invitation réservée aux amis", 403);
            return;
        }
        const pending = await (0, social_1.pendingInvitationFor)(room.id, context.user.id, targetId);
        if (pending && !checkExpiration(pending)) {
            (0, response_1.fail)(res, "invite_already_sent", "Invitation déjà envoyée", 409);
            return;
        }
        const expiresAt = new Date(Date.now() + social_1.INVITATION_TTL_MS);
        const { rows } = await db_1.pool.query(`INSERT INTO room_invitations (room_id, room_code, from_user, to_user, status, expires_at)
       VALUES ($1,$2,$3,$4,'pending',$5)
       RETURNING id, room_id, room_code, from_user, to_user, status, expires_at, created_at`, [room.id, room.room_code, context.user.id, targetId, expiresAt]);
        const invitation = rows[0];
        (0, presence_1.emitToUser)(targetId, "room:invite", {
            invitationId: invitation.id,
            roomCode: room.room_code,
            expiresAt: invitation.expires_at,
            fromUser: {
                id: context.user.id,
                username: context.user.username,
                avatar: context.user.avatar ?? null,
            },
        });
        (0, response_1.ok)(res, { invitation });
    },
    async accept(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        await (0, social_1.expireOldInvitations)();
        const invitationId = Number(req.body?.invitationId ?? req.params?.invitationId);
        if (!Number.isFinite(invitationId)) {
            (0, response_1.fail)(res, "invalid_invitation", "Invitation invalide", 400);
            return;
        }
        const invitation = await (0, social_1.fetchPendingInvitation)(invitationId, context.user.id);
        if (!invitation) {
            (0, response_1.fail)(res, "invitation_not_found", "Invitation introuvable ou expirée", 404);
            return;
        }
        if (invitation.status !== "pending" || checkExpiration(invitation)) {
            await db_1.pool.query(`UPDATE room_invitations SET status='expired' WHERE id=$1`, [invitation.id]);
            (0, response_1.fail)(res, "invitation_expired", "Invitation expirée", 410);
            return;
        }
        const friendship = await (0, social_1.getFriendshipBetween)(context.user.id, invitation.from_user);
        if (!friendship || friendship.status !== "accepted") {
            (0, response_1.fail)(res, "not_friends", "Plus d'amitié active avec cet utilisateur", 403);
            return;
        }
        const room = await loadRoom(invitation.room_code);
        if (!room) {
            (0, response_1.fail)(res, "room_not_found", "Salle introuvable", 404);
            return;
        }
        if (room.status !== "waiting") {
            (0, response_1.fail)(res, "room_locked", "La partie est verrouillée", 409);
            return;
        }
        try {
            await assertRoomCapacity(room);
        }
        catch (err) {
            if (err.message === "room_full") {
                (0, response_1.fail)(res, "room_full", "La salle est pleine", 409);
                return;
            }
            throw err;
        }
        const already = await db_1.pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [room.id, context.user.id]);
        if (!already.rows.length) {
            await db_1.pool.query(`INSERT INTO room_participants (room_id, user_id, is_ready)
         VALUES ($1,$2,FALSE)
         ON CONFLICT (room_id, user_id) DO NOTHING`, [room.id, context.user.id]);
            socket_1.io.to(room.room_code).emit("player-joined", {
                userId: context.user.id,
                username: context.user.username,
                roomCode: room.room_code,
            });
        }
        const { rows } = await db_1.pool.query(`UPDATE room_invitations
       SET status='accepted'
       WHERE id=$1
       RETURNING id, room_id, room_code, from_user, to_user, status, expires_at, created_at,
         (SELECT username FROM users WHERE id=from_user) AS from_username,
         (SELECT avatar FROM users WHERE id=from_user) AS from_avatar`, [invitation.id]);
        const updated = rows[0];
        (0, presence_1.emitToUser)(invitation.from_user, "room:invite:accepted", {
            invitationId: invitation.id,
            roomCode: room.room_code,
            userId: context.user.id,
        });
        (0, response_1.ok)(res, { invitation: updated, room, joined: true });
    },
    async decline(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        await (0, social_1.expireOldInvitations)();
        const invitationId = Number(req.body?.invitationId ?? req.params?.invitationId);
        if (!Number.isFinite(invitationId)) {
            (0, response_1.fail)(res, "invalid_invitation", "Invitation invalide", 400);
            return;
        }
        const invitation = await (0, social_1.fetchPendingInvitation)(invitationId, context.user.id);
        if (!invitation || invitation.status !== "pending") {
            (0, response_1.fail)(res, "invitation_not_found", "Invitation introuvable ou expirée", 404);
            return;
        }
        await db_1.pool.query(`UPDATE room_invitations SET status='declined' WHERE id=$1`, [invitation.id]);
        (0, presence_1.emitToUser)(invitation.from_user, "room:invite:declined", {
            invitationId: invitation.id,
            roomCode: invitation.room_code,
            userId: context.user.id,
        });
        (0, response_1.ok)(res, { declined: true });
    },
    async pending(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        await (0, social_1.expireOldInvitations)();
        const { rows } = await db_1.pool.query(`SELECT ri.id, ri.room_id, ri.room_code, ri.from_user, ri.to_user, ri.status, ri.expires_at, ri.created_at,
              u.username AS from_username,
              u.avatar AS from_avatar
       FROM room_invitations ri
       JOIN users u ON u.id = ri.from_user
       WHERE ri.to_user=$1 AND ri.status='pending'
       ORDER BY ri.created_at DESC`, [context.user.id]);
        (0, response_1.ok)(res, { invitations: rows });
    },
};
