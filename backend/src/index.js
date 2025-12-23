"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Minimal File polyfill for Node 18 (used by undici dependencies)
if (!globalThis.File) {
    class PolyfillFile extends Blob {
        constructor(bits = [], name, options = {}) {
            super(bits, options);
            this.name = name;
            this.lastModified = options.lastModified ?? Date.now();
        }
    }
    globalThis.File = PolyfillFile;
}
const express_1 = require("express");
const http_1 = require("http");
const cors_1 = require("cors");
const helmet_1 = require("helmet");
const express_rate_limit_1 = require("express-rate-limit");
const express_slow_down_1 = require("express-slow-down");
const cookie_session_1 = require("cookie-session");
const dotenv_1 = require("dotenv");
const db_1 = require("./config/db");
const socket_1 = require("./socket");
const auth_1 = require("./routes/auth");
const games_1 = require("./routes/games");
const likes_1 = require("./routes/likes");
const rooms_1 = require("./routes/rooms");
const stats_1 = require("./routes/stats");
const audioSources_1 = require("./routes/audioSources");
const friends_1 = require("./routes/friends");
const invitations_1 = require("./routes/invitations");
const response_1 = require("./utils/response");
const realtimeGame_1 = require("./services/realtimeGame");
const realtimeOrchestrator_1 = require("./services/realtimeOrchestrator");
const session_1 = require("./utils/session");
const presence_1 = require("./services/presence");
const social_1 = require("./services/social");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.set("trust proxy", 1);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === "CHANGE_ME") {
    console.error("❌ SESSION_SECRET is not set. Please define a strong secret in the environment.");
    process.exit(1);
}
const server = http_1.default.createServer(app);
const frontendBase = (process.env.FRONTEND_URL || "https://tymmerc.eu/blindify").replace(/\/$/, "");
const isProd = process.env.NODE_ENV === "production";
const isFrontendHttps = frontendBase.startsWith("https://");
const secureCookies = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProd && isFrontendHttps;
const sameSite = secureCookies ? "none" : "lax";
const cookieDomain = process.env.COOKIE_DOMAIN || (isProd ? "tymmerc.eu" : undefined);
const allowedOrigins = [
    frontendBase,
    "https://tymmerc.eu",
    "https://tymmerc.eu/blindify",
    "https://blindify-chi.vercel.app",
    "https://blindify-production.up.railway.app",
    "http://localhost:3000",
    "http://localhost:5173",
].filter(Boolean);
// Background cleanup for expired invitations (every 30s)
setInterval(() => {
    (0, social_1.expireOldInvitations)().catch(err => console.error("invitation_cleanup_failed", err));
}, 30000);
function parseCookies(header) {
    if (!header)
        return {};
    const raw = Array.isArray(header) ? header.join(";") : header;
    return raw.split(";").reduce((acc, part) => {
        const [key, ...rest] = part.trim().split("=");
        if (!key)
            return acc;
        const value = rest.join("=");
        try {
            acc[key] = decodeURIComponent(value || "");
        }
        catch {
            acc[key] = value || "";
        }
        return acc;
    }, {});
}
function extractSessionToken(socket) {
    const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
    const headerAuth = socket.handshake.headers.authorization;
    const bearer = typeof headerAuth === "string" && headerAuth.toLowerCase().startsWith("bearer ")
        ? headerAuth.slice(7).trim()
        : null;
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const cookieToken = cookies["blindify_session_token"] ?? null;
    return authToken || bearer || cookieToken || null;
}
async function requireRoomAccess(roomCode, userId) {
    const { rows: roomRows } = await db_1.pool.query(`SELECT id, room_code, host_user_id, status, session_id
     FROM multiplayer_rooms
     WHERE room_code=$1
     LIMIT 1`, [roomCode]);
    const room = roomRows[0];
    if (!room)
        return null;
    const membership = await db_1.pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [
        room.id,
        userId,
    ]);
    if (!membership.rows.length)
        return null;
    return { room, isHost: room.host_user_id === userId };
}
function emitRoomError(socket, roomCode, message, code = "forbidden") {
    socket.emit("room:error", {
        roomCode,
        code,
        message,
        serverTimestamp: Date.now(),
    });
}
const io = (0, socket_1.initSocket)(server, allowedOrigins);
io.use(async (socket, next) => {
    try {
        const token = extractSessionToken(socket);
        if (!token)
            return next(new Error("unauthorized"));
        const context = await (0, session_1.getSessionContextFromToken)(token, { autoExtend: true });
        if (!context)
            return next(new Error("unauthorized"));
        socket.data.auth = context;
        return next();
    }
    catch (err) {
        return next(new Error("unauthorized"));
    }
});
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "blob:", "*"],
            "font-src": ["'self'", "data:"],
            "connect-src": ["'self'", "https://api.spotify.com", ...allowedOrigins],
            "frame-ancestors": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": allowedOrigins.length ? allowedOrigins : ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true,
}));
app.use(express_1.default.json({ limit: "15mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => req.path?.startsWith("/api/rooms") ||
        req.path?.startsWith("/api/auth") ||
        req.path?.startsWith("/socket.io"),
});
app.use(apiLimiter);
app.use((0, express_slow_down_1.default)({
    windowMs: 60000,
    delayAfter: 120,
    delayMs: () => 50,
    skip: req => req.path?.startsWith("/api/rooms") ||
        req.path?.startsWith("/api/auth") ||
        req.path?.startsWith("/socket.io"),
}));
app.use((0, cookie_session_1.default)({
    name: "blindify_session",
    secret: sessionSecret,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite,
    secure: secureCookies,
    domain: cookieDomain,
    httpOnly: true,
}));
app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        return next();
    }
    const origin = req.headers.origin || "";
    const referer = req.headers.referer || "";
    const allowed = allowedOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
    if (!allowed) {
        return (0, response_1.fail)(res, "forbidden", "Requête refusée (origine non autorisée)", 403);
    }
    next();
});
app.get("/health", (_req, res) => {
    (0, response_1.ok)(res, { status: "ok" });
});
app.get("/api/health", (_req, res) => {
    (0, response_1.ok)(res, { status: "ok" });
});
app.get("/api/friends/activity", async (req, res) => {
    const context = await (0, session_1.getSessionContext)(req, res);
    if (!context)
        return;
    const friendIds = await (0, social_1.getAcceptedFriendIds)(context.user.id);
    if (!friendIds.length) {
        (0, response_1.ok)(res, { friends: [] });
        return;
    }
    const presence = (0, presence_1.getPresenceForUsers)(friendIds);
    const { rows: userRows } = await db_1.pool.query(`SELECT id, username FROM users WHERE id = ANY($1::int[])`, [friendIds]);
    const nameMap = new Map();
    userRows.forEach(u => nameMap.set(u.id, u.username));
    const friends = friendIds.map(id => ({
        userId: id,
        username: nameMap.get(id) ?? null,
        roomCode: presence[id]?.roomCode ?? null,
        state: presence[id]?.status ?? "offline",
        updatedAt: presence[id]?.updatedAt ?? Date.now(),
    }));
    (0, response_1.ok)(res, { friends });
});
app.use("/auth", auth_1.default);
app.use("/api/auth", auth_1.default);
app.use("/api/games", games_1.default);
app.use("/api/likes", likes_1.default);
app.use("/api/rooms", rooms_1.default);
app.use("/api/stats", stats_1.default);
app.use("/api/audio-sources", audioSources_1.default);
app.use("/api/friends", friends_1.default);
app.use("/api/invitations", invitations_1.default);
async function broadcastFriendPresence(userId, username) {
    const friendIds = await (0, social_1.getAcceptedFriendIds)(userId);
    if (!friendIds.length)
        return;
    const state = (0, presence_1.getPresence)(userId);
    const payload = {
        userId,
        username,
        roomCode: state.roomCode,
        status: state.status,
        updatedAt: state.updatedAt,
    };
    for (const fid of friendIds) {
        (0, presence_1.emitToUser)(fid, "friends:status:update", payload);
    }
}
async function pushFriendPresenceSnapshot(userId, socketId) {
    const friendIds = await (0, social_1.getAcceptedFriendIds)(userId);
    if (!friendIds.length)
        return;
    const presence = (0, presence_1.getPresenceForUsers)(friendIds);
    const { rows } = await db_1.pool.query(`SELECT id, username FROM users WHERE id = ANY($1::int[])`, [friendIds]);
    const nameMap = new Map();
    rows.forEach(u => nameMap.set(u.id, u.username));
    const snapshot = friendIds.map(id => ({
        userId: id,
        username: nameMap.get(id) ?? null,
        roomCode: presence[id]?.roomCode ?? null,
        status: presence[id]?.status ?? "offline",
        updatedAt: presence[id]?.updatedAt ?? Date.now(),
    }));
    io.to(socketId).emit("friends:status:init", snapshot);
}
io.on("connection", socket => {
    const auth = socket.data.auth;
    if (!auth?.user) {
        socket.emit("room:error", {
            code: "unauthorized",
            message: "Authentification requise",
            serverTimestamp: Date.now(),
        });
        socket.disconnect(true);
        return;
    }
    const currentUser = auth.user;
    const presence = (0, presence_1.registerSocket)(currentUser.id, socket.id);
    if (presence.status !== "playing") {
        (0, presence_1.setPresence)(currentUser.id, "online", null);
    }
    broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => { });
    pushFriendPresenceSnapshot(currentUser.id, socket.id).catch(() => { });
    const sendStateToSocket = (roomCode) => {
        const snapshot = (0, realtimeGame_1.gameStateSnapshot)(roomCode);
        if (snapshot) {
            socket.emit("game:state", snapshot);
        }
    };
    socket.on("room:join", async ({ roomCode }) => {
        if (!roomCode)
            return;
        const access = await requireRoomAccess(roomCode, currentUser.id);
        if (!access) {
            emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
            return;
        }
        socket.join(roomCode);
        (0, realtimeGame_1.upsertPlayer)(roomCode, {
            userId: currentUser.id,
            username: currentUser.username ?? null,
            avatar: currentUser.avatar ?? null,
        });
        io.to(roomCode).emit("room:presence", {
            type: "joined",
            roomCode,
            user: { id: currentUser.id, username: currentUser.username ?? undefined },
            serverTimestamp: Date.now(),
        });
        sendStateToSocket(roomCode);
        (0, presence_1.setPresence)(currentUser.id, "playing", roomCode);
        broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => { });
    });
    socket.on("room:leave", async ({ roomCode }) => {
        if (!roomCode)
            return;
        socket.leave(roomCode);
        const access = await requireRoomAccess(roomCode, currentUser.id);
        if (!access)
            return;
        (0, realtimeGame_1.removePlayer)(roomCode, currentUser.id);
        io.to(roomCode).emit("room:presence", {
            type: "left",
            roomCode,
            userId: currentUser.id,
            serverTimestamp: Date.now(),
        });
        (0, realtimeOrchestrator_1.broadcastState)(io, roomCode);
        (0, presence_1.setPresence)(currentUser.id, "online", null);
        broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => { });
    });
    socket.on("game:answer", async ({ roomCode, guess, sourceUserId }) => {
        if (!roomCode)
            return;
        const access = await requireRoomAccess(roomCode, currentUser.id);
        if (!access) {
            emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
            return;
        }
        const state = (0, realtimeGame_1.getGameState)(roomCode);
        if (!state) {
            emitRoomError(socket, roomCode, "Partie introuvable pour cette salle.");
            return;
        }
        (0, realtimeGame_1.recordAnswer)(roomCode, currentUser.id, guess ?? "", sourceUserId);
        const updated = (0, realtimeGame_1.getGameState)(roomCode);
        (0, realtimeOrchestrator_1.broadcastState)(io, roomCode);
        // Si tous les joueurs ont répondu, révéler immédiatement
        const everyoneAnswered = updated?.status === "playing" &&
            updated.currentTrack &&
            Object.values(updated.players).length > 0 &&
            Object.values(updated.players).every(p => p.hasAnswered);
        if (everyoneAnswered) {
            (0, realtimeOrchestrator_1.clearRevealTimer)(roomCode);
            const revealed = (0, realtimeGame_1.revealRound)(roomCode);
            if (revealed) {
                io.to(roomCode).emit("game:round:reveal", {
                    roomCode,
                    round: revealed.currentRound,
                    timing: revealed.timing,
                    players: revealed.players,
                });
                (0, realtimeOrchestrator_1.broadcastState)(io, roomCode);
                if (revealed.status === "finished") {
                    (0, realtimeOrchestrator_1.broadcastGameOver)(io, roomCode);
                }
            }
        }
    });
});
socket.on("game:ready", async ({ roomCode }) => {
    if (!roomCode)
        return;
    const access = await requireRoomAccess(roomCode, currentUser.id);
    if (!access) {
        emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
        return;
    }
    const existing = (0, realtimeGame_1.getGameState)(roomCode);
    if (!existing) {
        emitRoomError(socket, roomCode, "Aucune partie en cours.");
        return;
    }
    const before = (0, realtimeGame_1.getGameState)(roomCode);
    const state = (0, realtimeGame_1.markReady)(roomCode, currentUser.id);
    if (!state)
        return;
    if (state.status === "playing" && state.currentTrack && state.timing.revealAt && state.currentRound !== before?.currentRound) {
        io.to(roomCode).emit("game:round:start", {
            roomCode,
            round: state.currentRound,
            track: state.currentTrack,
            timing: state.timing,
        });
        (0, realtimeOrchestrator_1.scheduleReveal)(io, roomCode, state.timing.revealAt);
    }
    else if (state.status === "finished") {
        (0, realtimeOrchestrator_1.broadcastGameOver)(io, roomCode);
        (0, realtimeOrchestrator_1.clearRevealTimer)(roomCode);
    }
    (0, realtimeOrchestrator_1.broadcastState)(io, roomCode);
});
socket.on("game:leave", async ({ roomCode }) => {
    if (!roomCode)
        return;
    socket.leave(roomCode);
    (0, realtimeGame_1.removePlayer)(roomCode, currentUser.id);
    (0, realtimeOrchestrator_1.broadcastState)(io, roomCode);
});
socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    for (const roomCode of rooms) {
        (0, realtimeGame_1.removePlayer)(roomCode, currentUser.id);
        io.to(roomCode).emit("room:presence", {
            type: "disconnected",
            roomCode,
            socketId: socket.id,
            userId: currentUser.id,
            serverTimestamp: Date.now(),
        });
    }
});
const tick = setInterval(() => {
    socket.emit("server:tick", { serverTimestamp: Date.now() });
}, 5000);
socket.on("disconnect", () => {
    clearInterval(tick);
    const state = (0, presence_1.unregisterSocket)(currentUser.id, socket.id);
    if (state.status === "offline") {
        broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => { });
    }
});
;
app.use((_req, res) => {
    (0, response_1.fail)(res, "not_found", "Ressource introuvable", 404);
});
app.use((err, _req, res, _next) => {
    console.error("internal_error", err);
    (0, response_1.fail)(res, "internal_error", "Erreur interne du serveur", 500);
});
const PORT = Number(process.env.PORT) || 8080;
async function bootstrap() {
    try {
        await db_1.pool.query("SELECT 1");
        console.log("✅ PostgreSQL ready");
    }
    catch (error) {
        console.error("❌ Database connection failed", error);
        process.exit(1);
    }
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Blindify API listening on port ${PORT}`);
    });
}
bootstrap();
