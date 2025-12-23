import { pool } from "../config/db";

export type FriendStatus = "pending" | "accepted" | "blocked";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";

export type FriendRow = {
  id: number;
  requester_id: number;
  receiver_id: number;
  status: FriendStatus;
  created_at: string;
  updated_at: string;
};

export type RoomInvitationRow = {
  id: number;
  room_id: number;
  room_code: string;
  from_user: number;
  to_user: number;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
};

export const INVITATION_TTL_MS = 60_000;
let socialInitialized = false;

export async function ensureSocialTables(): Promise<void> {
  // Single table for pending/accepted/blocked to keep idempotence and uniqueness in one place.
  // Invariants: (LEAST(requester_id, receiver_id), GREATEST(...)) unique; status ∈ {pending, accepted, blocked}; requester_id <> receiver_id.
  // TODO(social-v2): split into friend_requests + friendships when we need audit/history per state transition and archiving (condition: backlog item SOC-41 approved + migration window).
  await pool.query(`
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
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair ON friends (LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friends_receiver_status ON friends(receiver_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friends_requester_status ON friends(requester_id, status)`);
  await pool.query(`
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

  await pool.query(`
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
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_room_invitation_unique
     ON room_invitations (room_id, from_user, to_user, status)
     WHERE status='pending'`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_room_invitation_to_status ON room_invitations(to_user, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_room_invitation_expires ON room_invitations(expires_at)`);
  socialInitialized = true;
}

export async function getAcceptedFriendIds(userId: number): Promise<number[]> {
  if (!socialInitialized) {
    await ensureSocialTables();
  }
  const { rows } = await pool.query<{ friend_id: number }>(
    `SELECT CASE WHEN requester_id=$1 THEN receiver_id ELSE requester_id END AS friend_id
     FROM friends
     WHERE (requester_id=$1 OR receiver_id=$1) AND status='accepted'`,
    [userId]
  );
  return rows.map(r => r.friend_id);
}

export async function getFriendshipBetween(userA: number, userB: number): Promise<FriendRow | null> {
  const { rows } = await pool.query<FriendRow>(
    `SELECT id, requester_id, receiver_id, status, created_at, updated_at
     FROM friends
     WHERE (requester_id=$1 AND receiver_id=$2) OR (requester_id=$2 AND receiver_id=$1)
     LIMIT 1`,
    [userA, userB]
  );
  return rows[0] ?? null;
}

export type ExpiredInvitation = { id: number; to_user: number; room_code: string };

export async function expireOldInvitations(): Promise<ExpiredInvitation[]> {
  const { rows } = await pool.query<ExpiredInvitation>(
    `UPDATE room_invitations
     SET status='expired'
     WHERE status='pending' AND expires_at <= NOW()
     RETURNING id, to_user, room_code`
  );
  return rows ?? [];
}

export async function fetchPendingInvitation(id: number, userId: number): Promise<RoomInvitationRow | null> {
  const { rows } = await pool.query<RoomInvitationRow>(
    `SELECT id, room_id, room_code, from_user, to_user, status, expires_at, created_at
     FROM room_invitations
     WHERE id=$1 AND to_user=$2
     LIMIT 1`,
    [id, userId]
  );
  return rows[0] ?? null;
}

export async function pendingInvitationFor(roomId: number, fromUser: number, toUser: number): Promise<RoomInvitationRow | null> {
  const { rows } = await pool.query<RoomInvitationRow>(
    `SELECT id, room_id, room_code, from_user, to_user, status, expires_at, created_at
     FROM room_invitations
     WHERE room_id=$1 AND from_user=$2 AND to_user=$3 AND status='pending'
     LIMIT 1`,
    [roomId, fromUser, toUser]
  );
  return rows[0] ?? null;
}
