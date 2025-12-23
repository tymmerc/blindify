"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.friendsController = void 0;
const db_1 = require("../config/db");
const session_1 = require("../utils/session");
const response_1 = require("../utils/response");
const presence_1 = require("../services/presence");
const social_1 = require("../services/social");
function mapFriend(row, currentUserId, presence) {
    const direction = row.status === "accepted"
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
async function fetchFriendships(userId) {
    const { rows } = await db_1.pool.query(`
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
    `, [userId]);
    const presence = (0, presence_1.getPresenceForUsers)(rows.map(r => r.friend_id));
    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const row of rows) {
        const view = mapFriend(row, userId, presence[row.friend_id]);
        if (view.status === "accepted") {
            friends.push(view);
        }
        else if (view.direction === "incoming") {
            incoming.push(view);
        }
        else {
            outgoing.push(view);
        }
    }
    return { friends, incoming, outgoing };
}
async function fetchFriendView(friendshipId, currentUserId) {
    const { rows } = await db_1.pool.query(`
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
    `, [friendshipId, currentUserId]);
    const row = rows[0];
    if (!row)
        return null;
    const presence = (0, presence_1.getPresenceForUsers)([row.friend_id])[row.friend_id];
    return mapFriend(row, currentUserId, presence);
}
function parseTargetUser(body, params) {
    if (Number.isFinite(Number(body?.userId)))
        return Number(body.userId);
    if (Number.isFinite(Number(params?.userId)))
        return Number(params.userId);
    return null;
}
async function ensureUserExists(userId) {
    const { rowCount } = await db_1.pool.query(`SELECT 1 FROM users WHERE id=$1 LIMIT 1`, [userId]);
    return Boolean(rowCount);
}
exports.friendsController = {
    async list(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        const payload = await fetchFriendships(context.user.id);
        (0, response_1.ok)(res, payload);
    },
    async request(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        const targetIdFromBody = parseTargetUser(req.body, req.params);
        const rawName = typeof req.body?.username === "string" ? req.body.username.trim() : "";
        let targetUserId = targetIdFromBody;
        if (!targetUserId) {
            if (!rawName) {
                (0, response_1.fail)(res, "invalid_identifier", "Pseudo ou identifiant requis", 400);
                return;
            }
            const { rows } = await db_1.pool.query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`, [rawName]);
            const exact = rows[0];
            if (!exact) {
                (0, response_1.fail)(res, "user_not_found", "Aucun joueur avec ce pseudo", 404);
                return;
            }
            targetUserId = exact.id;
        }
        if (targetUserId === context.user.id) {
            (0, response_1.fail)(res, "self_friend", "Tu ne peux pas t'ajouter toi-même", 400);
            return;
        }
        if (!(await ensureUserExists(targetUserId))) {
            (0, response_1.fail)(res, "user_not_found", "Joueur introuvable", 404);
            return;
        }
        const existing = await (0, social_1.getFriendshipBetween)(context.user.id, targetUserId);
        if (existing) {
            if (existing.status === "accepted") {
                (0, response_1.fail)(res, "already_friends", "Vous êtes déjà amis", 400);
                return;
            }
            if (existing.status === "blocked") {
                (0, response_1.fail)(res, "relation_blocked", "Relation bloquée", 409);
                return;
            }
            if (existing.requester_id === context.user.id) {
                (0, response_1.fail)(res, "request_already_sent", "Invitation déjà envoyée", 400);
                return;
            }
            const { rows } = await db_1.pool.query(`UPDATE friends
         SET status='accepted', updated_at=NOW()
         WHERE id=$1
         RETURNING id`, [existing.id]);
            const friendship = await fetchFriendView(rows[0].id, context.user.id);
            if (friendship) {
                (0, presence_1.emitToUser)(targetUserId, "friends:accepted", { friendship, autoAccepted: true });
                (0, presence_1.emitToUser)(context.user.id, "friends:accepted", { friendship, autoAccepted: true });
                (0, response_1.ok)(res, { friendship, autoAccepted: true });
                return;
            }
        }
        const { rows: createdRows } = await db_1.pool.query(`INSERT INTO friends (requester_id, receiver_id, status)
       VALUES ($1,$2,'pending')
       RETURNING id`, [context.user.id, targetUserId]);
        const friendship = await fetchFriendView(createdRows[0].id, context.user.id);
        if (friendship) {
            (0, presence_1.emitToUser)(targetUserId, "friends:request", {
                fromUserId: context.user.id,
                username: context.user.username,
                avatar: context.user.avatar ?? null,
                friendship,
            });
        }
        (0, response_1.ok)(res, { friendship });
    },
    async accept(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        const targetId = parseTargetUser(req.body, req.params);
        if (!targetId || targetId === context.user.id) {
            (0, response_1.fail)(res, "invalid_user", "Identifiant invalide", 400);
            return;
        }
        if (!(await ensureUserExists(targetId))) {
            (0, response_1.fail)(res, "user_not_found", "Joueur introuvable", 404);
            return;
        }
        const existing = await (0, social_1.getFriendshipBetween)(context.user.id, targetId);
        if (!existing || existing.status === "blocked") {
            (0, response_1.fail)(res, "friendship_not_found", "Invitation introuvable", 404);
            return;
        }
        if (existing.status === "accepted") {
            const friendship = await fetchFriendView(existing.id, context.user.id);
            (0, response_1.ok)(res, { friendship, alreadyAccepted: true });
            return;
        }
        if (existing.requester_id === context.user.id) {
            (0, response_1.fail)(res, "cannot_accept_own_request", "Invitation déjà envoyée", 400);
            return;
        }
        const { rows } = await db_1.pool.query(`UPDATE friends
       SET status='accepted', updated_at=NOW()
       WHERE id=$1
       RETURNING id`, [existing.id]);
        const friendship = await fetchFriendView(rows[0].id, context.user.id);
        if (friendship) {
            (0, presence_1.emitToUser)(targetId, "friends:accepted", { friendship });
            (0, presence_1.emitToUser)(context.user.id, "friends:accepted", { friendship });
        }
        (0, response_1.ok)(res, { friendship });
    },
    async decline(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        const targetId = parseTargetUser(req.body, req.params);
        if (!targetId || targetId === context.user.id) {
            (0, response_1.fail)(res, "invalid_user", "Identifiant invalide", 400);
            return;
        }
        if (!(await ensureUserExists(targetId))) {
            (0, response_1.fail)(res, "user_not_found", "Joueur introuvable", 404);
            return;
        }
        const existing = await (0, social_1.getFriendshipBetween)(context.user.id, targetId);
        if (!existing || existing.status !== "pending" || existing.receiver_id !== context.user.id) {
            (0, response_1.fail)(res, "friendship_not_found", "Invitation introuvable", 404);
            return;
        }
        await db_1.pool.query(`UPDATE friends SET status='blocked', updated_at=NOW() WHERE id=$1`, [existing.id]);
        (0, presence_1.emitToUser)(targetId, "friends:request:declined", {
            byUserId: context.user.id,
            friendshipId: existing.id,
        });
        (0, response_1.ok)(res, { declined: true });
    },
    async remove(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res);
        if (!context)
            return;
        await (0, social_1.ensureSocialTables)();
        const targetId = parseTargetUser(req.body, req.params);
        if (!targetId || targetId === context.user.id) {
            (0, response_1.fail)(res, "invalid_user", "Identifiant invalide", 400);
            return;
        }
        if (!(await ensureUserExists(targetId))) {
            (0, response_1.fail)(res, "user_not_found", "Joueur introuvable", 404);
            return;
        }
        const { rowCount } = await db_1.pool.query(`DELETE FROM friends WHERE (requester_id=$1 AND receiver_id=$2) OR (requester_id=$2 AND receiver_id=$1)`, [context.user.id, targetId]);
        if (!rowCount) {
            (0, response_1.fail)(res, "friendship_not_found", "Lien d'amitié introuvable", 404);
            return;
        }
        (0, presence_1.emitToUser)(targetId, "friends:removed", { userId: context.user.id });
        (0, response_1.ok)(res, { removed: true });
    },
};
