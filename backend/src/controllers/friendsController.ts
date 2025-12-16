import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { fail, ok } from "../utils/response";
import type { MusicProvider } from "../types/user";

type FriendshipRow = {
  id: number;
  user_a: number;
  user_b: number;
  status: "pending" | "accepted";
  requested_by: number;
  created_at: string;
  updated_at: string;
  friend_id: number;
  friend_username: string | null;
  friend_avatar: string | null;
  friend_provider: MusicProvider;
};

type FriendView = {
  id: number;
  userId: number;
  username: string | null;
  avatar: string | null;
  provider: MusicProvider;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "accepted";
  createdAt: string;
};

function normalizePair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

async function ensureFriendshipsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      CHECK (user_a <> user_b),
      UNIQUE(user_a, user_b)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_user_a ON friendships(user_a)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships(user_b)`);
}

function mapFriend(row: FriendshipRow, currentUserId: number): FriendView {
  const direction =
    row.status === "accepted"
      ? "accepted"
      : row.requested_by === currentUserId
        ? "outgoing"
        : "incoming";
  return {
    id: row.id,
    userId: row.friend_id,
    username: row.friend_username,
    avatar: row.friend_avatar,
    provider: row.friend_provider,
    status: row.status,
    direction,
    createdAt: row.created_at,
  };
}

async function fetchFriendships(userId: number): Promise<{
  friends: FriendView[];
  incoming: FriendView[];
  outgoing: FriendView[];
}> {
  const { rows } = await pool.query<FriendshipRow>(
    `
      SELECT
        f.id,
        f.user_a,
        f.user_b,
        f.status,
        f.requested_by,
        f.created_at,
        f.updated_at,
        u.id AS friend_id,
        u.username AS friend_username,
        u.avatar AS friend_avatar,
        u.provider AS friend_provider
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
      WHERE f.user_a = $1 OR f.user_b = $1
      ORDER BY f.updated_at DESC, f.created_at DESC
    `,
    [userId]
  );

  const friends: FriendView[] = [];
  const incoming: FriendView[] = [];
  const outgoing: FriendView[] = [];

  for (const row of rows) {
    const view = mapFriend(row, userId);
    if (view.status === "accepted") {
      friends.push(view);
    } else if (view.direction === "incoming") {
      incoming.push(view);
    } else {
      outgoing.push(view);
    }
  }

  return { friends, incoming, outgoing };
}

export const friendsController = {
  async list(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureFriendshipsTable();

    const payload = await fetchFriendships(context.user.id);
    ok(res, payload);
  },

  async request(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureFriendshipsTable();

    const raw = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    if (!raw) {
      fail(res, "invalid_username", "Nom d'utilisateur requis", 400);
      return;
    }

    const { rows: exactRows } = await pool.query<{
      id: number;
      username: string | null;
      provider: MusicProvider;
      avatar: string | null;
    }>(
      `SELECT id, username, provider, avatar
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [raw]
    );
    let target = exactRows[0];

    if (!target) {
      const pattern = `%${raw}%`;
      const { rows: fuzzyRows } = await pool.query<{
        id: number;
        username: string | null;
        provider: MusicProvider;
        avatar: string | null;
      }>(
        `SELECT id, username, provider, avatar
         FROM users
         WHERE username ILIKE $1
         ORDER BY username ASC
         LIMIT 5`,
        [pattern]
      );
      if (!fuzzyRows.length) {
        fail(res, "user_not_found", "Aucun joueur avec ce pseudo", 404);
        return;
      }
      if (fuzzyRows.length > 1) {
        fail(res, "user_ambiguous", "Plusieurs joueurs trouvés, précise le pseudo complet.", 409, {
          suggestions: fuzzyRows.map(row => row.username).filter(Boolean).slice(0, 3),
        });
        return;
      }
      target = fuzzyRows[0];
    }

    if (target.id === context.user.id) {
      fail(res, "self_friend", "Tu ne peux pas t'ajouter toi-même", 400);
      return;
    }

    const [userA, userB] = normalizePair(context.user.id, target.id);

    const { rows: existingRows } = await pool.query<{
      id: number;
      status: "pending" | "accepted";
      requested_by: number;
    }>(
      `SELECT id, status, requested_by
       FROM friendships
       WHERE user_a=$1 AND user_b=$2
       LIMIT 1`,
      [userA, userB]
    );
    const existing = existingRows[0];

    if (existing) {
      if (existing.status === "accepted") {
        fail(res, "already_friends", "Vous êtes déjà amis", 400);
        return;
      }
      if (existing.status === "pending") {
        if (existing.requested_by === context.user.id) {
          fail(res, "request_already_sent", "Invitation déjà envoyée", 400);
          return;
        }
        const { rows: updatedRows } = await pool.query<FriendshipRow>(
          `UPDATE friendships
           SET status='accepted', updated_at=NOW()
           WHERE id=$1
           RETURNING *,
             CASE WHEN user_a = $2 THEN user_b ELSE user_a END AS friend_id,
             (SELECT username FROM users WHERE id = CASE WHEN user_a = $2 THEN user_b ELSE user_a END) AS friend_username,
             (SELECT avatar FROM users WHERE id = CASE WHEN user_a = $2 THEN user_b ELSE user_a END) AS friend_avatar,
             (SELECT provider FROM users WHERE id = CASE WHEN user_a = $2 THEN user_b ELSE user_a END) AS friend_provider`,
          [existing.id, context.user.id]
        );
        const friendship = mapFriend(updatedRows[0], context.user.id);
        ok(res, { friendship, autoAccepted: true });
        return;
      }
    }

    const { rows: createdRows } = await pool.query<FriendshipRow>(
      `INSERT INTO friendships (user_a, user_b, status, requested_by)
       VALUES ($1,$2,'pending',$3)
       RETURNING *,
         CASE WHEN user_a = $3 THEN user_b ELSE user_a END AS friend_id,
         (SELECT username FROM users WHERE id = CASE WHEN user_a = $3 THEN user_b ELSE user_a END) AS friend_username,
         (SELECT avatar FROM users WHERE id = CASE WHEN user_a = $3 THEN user_b ELSE user_a END) AS friend_avatar,
         (SELECT provider FROM users WHERE id = CASE WHEN user_a = $3 THEN user_b ELSE user_a END) AS friend_provider`,
      [userA, userB, context.user.id]
    );
    const friendship = mapFriend(createdRows[0], context.user.id);
    ok(res, { friendship });
  },

  async accept(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const targetId = Number(req.params?.userId);
    if (!Number.isFinite(targetId)) {
      fail(res, "invalid_user", "Identifiant invalide", 400);
      return;
    }
    if (targetId === context.user.id) {
      fail(res, "self_friend", "Action impossible sur ton propre compte", 400);
      return;
    }

    await ensureFriendshipsTable();

    const [userA, userB] = normalizePair(context.user.id, targetId);

    const { rows: pendingRows } = await pool.query<FriendshipRow>(
      `SELECT
         f.*,
         CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END AS friend_id,
         u.username AS friend_username,
         u.avatar AS friend_avatar,
         u.provider AS friend_provider
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
       WHERE f.user_a=$2 AND f.user_b=$3
       LIMIT 1`,
      [context.user.id, userA, userB]
    );
    const existing = pendingRows[0];
    if (!existing) {
      fail(res, "friendship_not_found", "Invitation introuvable", 404);
      return;
    }
    if (existing.status === "accepted") {
      const friendship = mapFriend(existing, context.user.id);
      ok(res, { friendship, alreadyAccepted: true });
      return;
    }
    if (existing.requested_by === context.user.id) {
      fail(res, "cannot_accept_own_request", "Tu as déjà envoyé cette invitation", 400);
      return;
    }

    const { rows: updatedRows } = await pool.query<FriendshipRow>(
      `UPDATE friendships
       SET status='accepted', updated_at=NOW()
       WHERE id=$1
       RETURNING *,
         CASE WHEN user_a = $2 THEN user_b ELSE user_a END AS friend_id,
         (SELECT username FROM users WHERE id = CASE WHEN user_a = $2 THEN user_b ELSE user_a END) AS friend_username,
         (SELECT avatar FROM users WHERE id = CASE WHEN user_a = $2 THEN user_b ELSE user_a END) AS friend_avatar,
         (SELECT provider FROM users WHERE id = CASE WHEN user_a = $2 THEN user_b ELSE user_a END) AS friend_provider`,
      [existing.id, context.user.id]
    );

    const friendship = mapFriend(updatedRows[0], context.user.id);
    ok(res, { friendship });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const targetId = Number(req.params?.userId);
    if (!Number.isFinite(targetId)) {
      fail(res, "invalid_user", "Identifiant invalide", 400);
      return;
    }
    if (targetId === context.user.id) {
      fail(res, "self_friend", "Action impossible sur ton propre compte", 400);
      return;
    }

    await ensureFriendshipsTable();

    const [userA, userB] = normalizePair(context.user.id, targetId);
    const { rowCount } = await pool.query(`DELETE FROM friendships WHERE user_a=$1 AND user_b=$2`, [userA, userB]);

    if (!rowCount) {
      fail(res, "friendship_not_found", "Lien d'amitié introuvable", 404);
      return;
    }

    ok(res, { removed: true });
  },
};
