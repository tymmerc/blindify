import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { fail, ok } from "../utils/response";
import type { MusicProvider } from "../types/user";
import type { PresenceState } from "../services/presence";
import { emitToUser, getPresenceForUsers } from "../services/presence";
import { ensureSocialTables, type FriendRow, type FriendStatus, getFriendshipBetween } from "../services/social";

type FriendView = {
  id: number;
  userId: number;
  username: string | null;
  avatar: string | null;
  provider: MusicProvider;
  status: FriendStatus;
  direction: "incoming" | "outgoing" | "accepted";
  createdAt: string;
  presence: PresenceState;
};

type FriendJoinRow = FriendRow & {
  friend_id: number;
  friend_username: string | null;
  friend_avatar: string | null;
  friend_provider: MusicProvider;
};

function mapFriend(row: FriendJoinRow, currentUserId: number, presence: PresenceState): FriendView {
  const direction: FriendView["direction"] =
    row.status === "accepted"
      ? "accepted"
      : row.requester_id === currentUserId
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
    presence,
  };
}

async function fetchFriendships(userId: number): Promise<{
  friends: FriendView[];
  incoming: FriendView[];
  outgoing: FriendView[];
}> {
  const { rows } = await pool.query<FriendJoinRow>(
    `
      SELECT
        f.id,
        f.requester_id,
        f.receiver_id,
        f.status,
        f.created_at,
        f.updated_at,
        CASE WHEN f.requester_id = $1 THEN f.receiver_id ELSE f.requester_id END AS friend_id,
        u.username AS friend_username,
        u.avatar AS friend_avatar,
        u.provider AS friend_provider
      FROM friends f
      JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.receiver_id ELSE f.requester_id END
      WHERE (f.requester_id = $1 OR f.receiver_id = $1) AND f.status <> 'blocked'
      ORDER BY f.updated_at DESC, f.created_at DESC
    `,
    [userId]
  );

  const presence = getPresenceForUsers(rows.map(r => r.friend_id));
  const friends: FriendView[] = [];
  const incoming: FriendView[] = [];
  const outgoing: FriendView[] = [];

  for (const row of rows) {
    const view = mapFriend(row, userId, presence[row.friend_id]);
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

async function fetchFriendView(friendshipId: number, currentUserId: number): Promise<FriendView | null> {
  const { rows } = await pool.query<FriendJoinRow>(
    `
      SELECT
        f.id,
        f.requester_id,
        f.receiver_id,
        f.status,
        f.created_at,
        f.updated_at,
        CASE WHEN f.requester_id = $2 THEN f.receiver_id ELSE f.requester_id END AS friend_id,
        u.username AS friend_username,
        u.avatar AS friend_avatar,
        u.provider AS friend_provider
      FROM friends f
      JOIN users u ON u.id = CASE WHEN f.requester_id = $2 THEN f.receiver_id ELSE f.requester_id END
      WHERE f.id=$1
      LIMIT 1
    `,
    [friendshipId, currentUserId]
  );
  const row = rows[0];
  if (!row) return null;
  const presence = getPresenceForUsers([row.friend_id])[row.friend_id];
  return mapFriend(row, currentUserId, presence);
}

function parseTargetUser(body: any, params: any): number | null {
  if (Number.isFinite(Number(body?.userId))) return Number(body.userId);
  if (Number.isFinite(Number(params?.userId))) return Number(params.userId);
  return null;
}

async function ensureUserExists(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE id=$1 LIMIT 1`, [userId]);
  return Boolean(rowCount);
}

export const friendsController = {
  async list(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureSocialTables();

    const payload = await fetchFriendships(context.user.id);
    ok(res, payload);
  },

  async request(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    await ensureSocialTables();

    const targetIdFromBody = parseTargetUser(req.body, req.params);
    const rawName = typeof req.body?.username === "string" ? req.body.username.trim() : "";

    let targetUserId: number | null = targetIdFromBody;

    if (!targetUserId) {
      if (!rawName) {
        fail(res, "invalid_identifier", "Pseudo ou identifiant requis", 400);
        return;
      }
      const { rows } = await pool.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
        [rawName]
      );
      const exact = rows[0];
      if (!exact) {
        fail(res, "user_not_found", "Aucun joueur avec ce pseudo", 404);
        return;
      }
      targetUserId = exact.id;
    }

    if (targetUserId === context.user.id) {
      fail(res, "self_friend", "Tu ne peux pas t'ajouter toi-même", 400);
      return;
    }

    if (!(await ensureUserExists(targetUserId))) {
      fail(res, "user_not_found", "Joueur introuvable", 404);
      return;
    }

    const existing = await getFriendshipBetween(context.user.id, targetUserId);
    if (existing) {
      if (existing.status === "accepted") {
        fail(res, "already_friends", "Vous êtes déjà amis", 400);
        return;
      }
      if (existing.status === "blocked") {
        fail(res, "relation_blocked", "Relation bloquée", 409);
        return;
      }
      if (existing.requester_id === context.user.id) {
        fail(res, "request_already_sent", "Invitation déjà envoyée", 400);
        return;
      }
      const { rows } = await pool.query<{ id: number }>(
        `UPDATE friends
         SET status='accepted', updated_at=NOW()
         WHERE id=$1
         RETURNING id`,
        [existing.id]
      );
      const friendship = await fetchFriendView(rows[0].id, context.user.id);
      if (friendship) {
        emitToUser(targetUserId, "friend:accepted", { friendship, autoAccepted: true });
        emitToUser(context.user.id, "friend:accepted", { friendship, autoAccepted: true });
        ok(res, { friendship, autoAccepted: true });
        return;
      }
    }

    const { rows: createdRows } = await pool.query<{ id: number }>(
      `INSERT INTO friends (requester_id, receiver_id, status)
       VALUES ($1,$2,'pending')
       RETURNING id`,
      [context.user.id, targetUserId]
    );

    const friendship = await fetchFriendView(createdRows[0].id, context.user.id);
    if (friendship) {
      emitToUser(targetUserId, "friend:request", {
        fromUserId: context.user.id,
        username: context.user.username,
        avatar: (context.user as any).avatar ?? null,
        friendship,
      });
    }
    ok(res, { friendship });
  },

  async accept(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureSocialTables();

    const targetId = parseTargetUser(req.body, req.params);
    if (!targetId || targetId === context.user.id) {
      fail(res, "invalid_user", "Identifiant invalide", 400);
      return;
    }

    if (!(await ensureUserExists(targetId))) {
      fail(res, "user_not_found", "Joueur introuvable", 404);
      return;
    }

    const existing = await getFriendshipBetween(context.user.id, targetId);
    if (!existing || existing.status === "blocked") {
      fail(res, "friendship_not_found", "Invitation introuvable", 404);
      return;
    }
    if (existing.status === "accepted") {
      const friendship = await fetchFriendView(existing.id, context.user.id);
      ok(res, { friendship, alreadyAccepted: true });
      return;
    }
    if (existing.requester_id === context.user.id) {
      fail(res, "cannot_accept_own_request", "Invitation déjà envoyée", 400);
      return;
    }

    const { rows } = await pool.query<{ id: number }>(
      `UPDATE friends
       SET status='accepted', updated_at=NOW()
       WHERE id=$1
       RETURNING id`,
      [existing.id]
    );

    const friendship = await fetchFriendView(rows[0].id, context.user.id);
    if (friendship) {
      emitToUser(targetId, "friend:accepted", { friendship });
      emitToUser(context.user.id, "friend:accepted", { friendship });
    }
    ok(res, { friendship });
  },

  async decline(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    await ensureSocialTables();

    const targetId = parseTargetUser(req.body, req.params);
    if (!targetId || targetId === context.user.id) {
      fail(res, "invalid_user", "Identifiant invalide", 400);
      return;
    }

    if (!(await ensureUserExists(targetId))) {
      fail(res, "user_not_found", "Joueur introuvable", 404);
      return;
    }

    const existing = await getFriendshipBetween(context.user.id, targetId);
    if (!existing || existing.status !== "pending" || existing.receiver_id !== context.user.id) {
      fail(res, "friendship_not_found", "Invitation introuvable", 404);
      return;
    }

    await pool.query(`UPDATE friends SET status='blocked', updated_at=NOW() WHERE id=$1`, [existing.id]);
    emitToUser(targetId, "friend:request:declined", {
      byUserId: context.user.id,
      friendshipId: existing.id,
    });
    ok(res, { declined: true });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureSocialTables();

    const targetId = parseTargetUser(req.body, req.params);
    if (!targetId || targetId === context.user.id) {
      fail(res, "invalid_user", "Identifiant invalide", 400);
      return;
    }

    if (!(await ensureUserExists(targetId))) {
      fail(res, "user_not_found", "Joueur introuvable", 404);
      return;
    }

    const { rowCount } = await pool.query(
      `DELETE FROM friends WHERE (requester_id=$1 AND receiver_id=$2) OR (requester_id=$2 AND receiver_id=$1)`,
      [context.user.id, targetId]
    );

    if (!rowCount) {
      fail(res, "friendship_not_found", "Lien d'amitié introuvable", 404);
      return;
    }

    emitToUser(targetId, "friend:removed", { userId: context.user.id });
    ok(res, { removed: true });
  },
};
