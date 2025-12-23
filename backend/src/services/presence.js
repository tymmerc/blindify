"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocket = registerSocket;
exports.unregisterSocket = unregisterSocket;
exports.setPresence = setPresence;
exports.getPresence = getPresence;
exports.getPresenceForUsers = getPresenceForUsers;
exports.getUserSockets = getUserSockets;
exports.emitToUser = emitToUser;
const socket_1 = require("../socket");
const presenceByUser = new Map();
const socketsByUser = new Map();
function now() {
    return Date.now();
}
function registerSocket(userId, socketId) {
    const existing = socketsByUser.get(userId) ?? new Set();
    existing.add(socketId);
    socketsByUser.set(userId, existing);
    const current = presenceByUser.get(userId);
    const state = {
        status: current?.status === "playing" ? "playing" : "online",
        roomCode: current?.roomCode ?? null,
        updatedAt: now(),
    };
    presenceByUser.set(userId, state);
    return state;
}
function unregisterSocket(userId, socketId) {
    const existing = socketsByUser.get(userId);
    if (existing) {
        existing.delete(socketId);
        if (!existing.size) {
            socketsByUser.delete(userId);
        }
        else {
            socketsByUser.set(userId, existing);
        }
    }
    const hasOtherSockets = socketsByUser.get(userId)?.size;
    const state = hasOtherSockets
        ? {
            status: presenceByUser.get(userId)?.status ?? "online",
            roomCode: presenceByUser.get(userId)?.roomCode ?? null,
            updatedAt: now(),
        }
        : { status: "offline", roomCode: null, updatedAt: now() };
    presenceByUser.set(userId, state);
    return state;
}
function setPresence(userId, status, roomCode = null) {
    const state = { status, roomCode, updatedAt: now() };
    presenceByUser.set(userId, state);
    return state;
}
function getPresence(userId) {
    return presenceByUser.get(userId) ?? { status: "offline", roomCode: null, updatedAt: now() };
}
function getPresenceForUsers(userIds) {
    const payload = {};
    const timestamp = now();
    for (const id of userIds) {
        payload[id] = presenceByUser.get(id) ?? { status: "offline", roomCode: null, updatedAt: timestamp };
    }
    return payload;
}
function getUserSockets(userId) {
    return socketsByUser.get(userId) ?? null;
}
function emitToUser(userId, event, payload) {
    const sockets = socketsByUser.get(userId);
    if (!sockets || !sockets.size)
        return;
    sockets.forEach(socketId => {
        socket_1.io.to(socketId).emit(event, payload);
    });
}
