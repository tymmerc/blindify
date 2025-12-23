"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVITATION_TTL_MS = void 0;
exports.ensureSocialTables = ensureSocialTables;
exports.getAcceptedFriendIds = getAcceptedFriendIds;
exports.getFriendshipBetween = getFriendshipBetween;
exports.expireOldInvitations = expireOldInvitations;
exports.fetchPendingInvitation = fetchPendingInvitation;
exports.pendingInvitationFor = pendingInvitationFor;
const db_1 = require("../config/db");
exports.INVITATION_TTL_MS = 60000;
async function ensureSocialTables() {
    await db_1.pool.query(`
    CREATE TABLE IF NOT EXISTS friends (
      id SERIAL PRIMARY KEY,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      CHECK (requester_id <> receiver_id)
    )
  `);
    await db_1.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair ON friends (LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))`);
    await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_friends_receiver_status ON friends(receiver_id, status)`);
    await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_friends_requester_status ON friends(requester_id, status)`);
    await db_1.pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='friendships') THEN
        INSERT INTO friends (requester_id, receiver_id, status, created_at, updated_at)
        SELECT requested_by,
               CASE WHEN user_a = requested_by THEN user_b ELSE user_a END,
               status,
               created_at,
               updated_at
        FROM friendships
        ON CONFLICT (LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id)) DO NOTHING;
      END IF;
    END
    $$;
  `);
    await db_1.pool.query(`
    CREATE TABLE IF NOT EXISTS room_invitations (
      id SERIAL PRIMARY KEY,
      room_id INTEGER NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
      room_code VARCHAR(12) NOT NULL,
      from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      CHECK (from_user <> to_user)
    )
  `);
    await db_1.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_room_invitation_unique
     ON room_invitations (room_id, from_user, to_user, status)
     WHERE status='pending'`);
    await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_room_invitation_to_status ON room_invitations(to_user, status)`);
    await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_room_invitation_expires ON room_invitations(expires_at)`);
}
async function getAcceptedFriendIds(userId) {
    const { rows } = await db_1.pool.query(`SELECT CASE WHEN requester_id=$1 THEN receiver_id ELSE requester_id END AS friend_id
     FROM friends
     WHERE (requester_id=$1 OR receiver_id=$1) AND status='accepted'`, [userId]);
    return rows.map(r => r.friend_id);
}
async function getFriendshipBetween(userA, userB) {
    const { rows } = await db_1.pool.query(`SELECT id, requester_id, receiver_id, status, created_at, updated_at
     FROM friends
     WHERE (requester_id=$1 AND receiver_id=$2) OR (requester_id=$2 AND receiver_id=$1)
     LIMIT 1`, [userA, userB]);
    return rows[0] ?? null;
}
async function expireOldInvitations() {
    const { rowCount } = await db_1.pool.query(`UPDATE room_invitations
     SET status='expired'
     WHERE status='pending' AND expires_at <= NOW()`);
    return rowCount ?? 0;
}
async function fetchPendingInvitation(id, userId) {
    const { rows } = await db_1.pool.query(`SELECT id, room_id, room_code, from_user, to_user, status, expires_at, created_at
     FROM room_invitations
     WHERE id=$1 AND to_user=$2
     LIMIT 1`, [id, userId]);
    return rows[0] ?? null;
}
async function pendingInvitationFor(roomId, fromUser, toUser) {
    const { rows } = await db_1.pool.query(`SELECT id, room_id, room_code, from_user, to_user, status, expires_at, created_at
     FROM room_invitations
     WHERE room_id=$1 AND from_user=$2 AND to_user=$3 AND status='pending'
     LIMIT 1`, [roomId, fromUser, toUser]);
    return rows[0] ?? null;
}
