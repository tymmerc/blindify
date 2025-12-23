"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionToken = createSessionToken;
exports.extendSessionToken = extendSessionToken;
exports.revokeSessionToken = revokeSessionToken;
exports.getSessionContextFromToken = getSessionContextFromToken;
exports.getSessionContext = getSessionContext;
exports.clearSession = clearSession;
const crypto_1 = require("crypto");
const db_1 = require("../config/db");
const response_1 = require("./response");
const DEFAULT_SESSION_TTL = 1000 * 60 * 60 * 24; // 24h
function ensureSessionObject(req) {
    if (!req.session) {
        req.session = {};
    }
    return req.session;
}
async function queryUserById(id) {
    const { rows } = await db_1.pool.query(`SELECT id, provider, provider_id, username, email, avatar, created_at
     FROM users
     WHERE id=$1
     LIMIT 1`, [id]);
    return rows[0] ?? null;
}
async function querySessionByToken(token) {
    const { rows } = await db_1.pool.query(`SELECT token, user_id, created_at, expires_at
     FROM user_sessions
     WHERE token=$1
     LIMIT 1`, [token]);
    return rows[0] ?? null;
}
async function queryConnection(userId, provider) {
    if (!provider) {
        const { rows } = await db_1.pool.query(`SELECT id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at
       FROM user_connections
       WHERE user_id=$1
       ORDER BY updated_at DESC
       LIMIT 1`, [userId]);
        return rows[0] ?? null;
    }
    const { rows } = await db_1.pool.query(`SELECT id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at
     FROM user_connections
     WHERE user_id=$1 AND provider=$2
     LIMIT 1`, [userId, provider]);
    return rows[0] ?? null;
}
async function createSessionToken(userId, ttlMs = DEFAULT_SESSION_TTL) {
    const token = crypto_1.default.randomUUID();
    const expiresAt = new Date(Date.now() + ttlMs);
    const { rows } = await db_1.pool.query(`INSERT INTO user_sessions (token, user_id, expires_at)
     VALUES ($1, $2, $3)
     RETURNING token, user_id, created_at, expires_at`, [token, userId, expiresAt]);
    return rows[0];
}
async function extendSessionToken(token, ttlMs = DEFAULT_SESSION_TTL) {
    const expiresAt = new Date(Date.now() + ttlMs);
    await db_1.pool.query(`UPDATE user_sessions SET expires_at=$2 WHERE token=$1`, [token, expiresAt]);
}
async function revokeSessionToken(token) {
    await db_1.pool.query(`DELETE FROM user_sessions WHERE token=$1`, [token]);
}
async function getSessionContextFromToken(token, options = {}) {
    const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL;
    const sessionRow = await querySessionByToken(token);
    if (!sessionRow) {
        return null;
    }
    if (sessionRow.expires_at && new Date(sessionRow.expires_at) <= new Date()) {
        await revokeSessionToken(token);
        return null;
    }
    const user = await queryUserById(sessionRow.user_id);
    if (!user) {
        return null;
    }
    const desiredProvider = options.provider ?? user.provider;
    const connection = await queryConnection(user.id, desiredProvider);
    if (options.requireConnection && !connection) {
        return null;
    }
    if (options.autoExtend !== false) {
        await extendSessionToken(token, ttlMs);
    }
    return {
        user,
        connection,
        sessionToken: token,
    };
}
async function getSessionContext(req, res, options = {}) {
    const session = ensureSessionObject(req);
    const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL;
    let sessionToken = null;
    let userId = typeof session.userId === "number" ? session.userId : null;
    if (!userId) {
        const authHeader = req.headers.authorization?.trim();
        if (authHeader && authHeader.startsWith("Bearer ")) {
            const candidate = authHeader.slice(7);
            if (candidate) {
                const sessionRow = await querySessionByToken(candidate);
                if (!sessionRow) {
                    if (res)
                        (0, response_1.fail)(res, "unauthorized", "Session expirée ou invalide", 401);
                    return null;
                }
                if (sessionRow.expires_at && new Date(sessionRow.expires_at) <= new Date()) {
                    await revokeSessionToken(candidate);
                    if (res)
                        (0, response_1.fail)(res, "unauthorized", "Session expirée", 401);
                    return null;
                }
                userId = sessionRow.user_id;
                sessionToken = sessionRow.token;
                session.userId = userId;
                session.sessionToken = sessionRow.token;
            }
        }
    }
    else if (typeof session.sessionToken === "string") {
        sessionToken = session.sessionToken;
    }
    if (!userId) {
        if (res)
            (0, response_1.fail)(res, "unauthorized", "Authentification requise", 401);
        return null;
    }
    const user = await queryUserById(userId);
    if (!user) {
        req.session = null;
        if (res)
            (0, response_1.fail)(res, "unauthorized", "Utilisateur introuvable", 401);
        return null;
    }
    session.userId = user.id;
    const desiredProvider = options.provider ?? user.provider;
    const connection = await queryConnection(user.id, desiredProvider);
    if (options.requireConnection && !connection) {
        if (res)
            (0, response_1.fail)(res, "provider_required", "Aucune connexion active pour ce fournisseur", 403);
        return null;
    }
    if (sessionToken && options.autoExtend !== false) {
        await extendSessionToken(sessionToken, ttlMs);
    }
    return {
        user,
        connection,
        sessionToken,
    };
}
function clearSession(req) {
    req.session = null;
}
