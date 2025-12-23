"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleReveal = scheduleReveal;
exports.startRoundAndBroadcast = startRoundAndBroadcast;
exports.broadcastState = broadcastState;
exports.broadcastGameOver = broadcastGameOver;
exports.clearRevealTimer = clearRevealTimer;
const realtimeGame_1 = require("./realtimeGame");
const revealTimers = new Map();
function emitState(io, roomCode) {
    const snapshot = (0, realtimeGame_1.gameStateSnapshot)(roomCode);
    if (snapshot) {
        io.to(roomCode).emit("game:state", snapshot);
    }
    return snapshot;
}
function emitRoundStart(io, state) {
    if (!state.currentTrack)
        return;
    io.to(state.roomCode).emit("game:round:start", {
        roomCode: state.roomCode,
        round: state.currentRound,
        track: state.currentTrack,
        timing: state.timing,
    });
}
function emitRoundReveal(io, state) {
    io.to(state.roomCode).emit("game:round:reveal", {
        roomCode: state.roomCode,
        round: state.currentRound,
        timing: state.timing,
        players: state.players,
    });
}
function emitGameOver(io, state) {
    io.to(state.roomCode).emit("game:over", {
        roomCode: state.roomCode,
        players: state.players,
    });
    // Keep a second event name for compatibility with the prompt wording
    io.to(state.roomCode).emit("game:game:over", {
        roomCode: state.roomCode,
        players: state.players,
    });
}
function scheduleReveal(io, roomCode, revealAt) {
    const existing = revealTimers.get(roomCode);
    if (existing)
        clearTimeout(existing);
    const delay = Math.max(0, revealAt - Date.now());
    const timer = setTimeout(() => {
        revealTimers.delete(roomCode);
        const updated = (0, realtimeGame_1.revealRound)(roomCode);
        if (updated) {
            emitRoundReveal(io, updated);
            emitState(io, roomCode);
            if (updated.status === "finished") {
                emitGameOver(io, updated);
                revealTimers.delete(roomCode);
                (0, realtimeGame_1.clearGame)(roomCode);
            }
        }
    }, delay);
    revealTimers.set(roomCode, timer);
}
function startRoundAndBroadcast(io, roomCode, opts) {
    const state = (0, realtimeGame_1.startNextRound)(roomCode, opts);
    if (!state)
        return undefined;
    if (state.status === "finished") {
        emitGameOver(io, state);
        return state;
    }
    emitRoundStart(io, state);
    emitState(io, roomCode);
    if (state.timing.revealAt) {
        scheduleReveal(io, roomCode, state.timing.revealAt);
    }
    return state;
}
function broadcastState(io, roomCode) {
    return emitState(io, roomCode);
}
function broadcastGameOver(io, roomCode) {
    const snapshot = (0, realtimeGame_1.gameStateSnapshot)(roomCode);
    if (snapshot) {
        emitGameOver(io, snapshot);
    }
    revealTimers.delete(roomCode);
    (0, realtimeGame_1.clearGame)(roomCode);
}
function clearRevealTimer(roomCode) {
    const existing = revealTimers.get(roomCode);
    if (existing) {
        clearTimeout(existing);
        revealTimers.delete(roomCode);
    }
}
