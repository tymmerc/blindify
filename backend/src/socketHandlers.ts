import type { Server, Socket } from "socket.io";
import { pool } from "./config/db";
import {
  gameStateSnapshot,
  getGameState as getRealtimeState,
  allAnswerablePlayers,
  markReady as markReadyState,
  recordAnswer,
  revealRound,
  removePlayer,
  upsertPlayer,
  markDisconnected,
  markReconnected,
  getGameMode,
} from "./services/realtimeGame";
import {
  broadcastGameOver,
  broadcastState,
  clearRevealTimer,
  scheduleReveal,
} from "./services/realtimeOrchestrator";
import { getSessionContextFromToken, type SessionContext } from "./utils/session";
import {
  getPresence,
  getPresenceForUsers,
  emitToUser,
  registerSocket,
  recordHeartbeat,
  setPresence,
  unregisterSocket,
} from "./services/presence";
import { getAcceptedFriendIds } from "./services/social";
import {
  handleStreamerGuess,
  advanceStreamerRound,
  getStreamerSnapshot,
  cleanupStreamer,
} from "./services/streamerOrchestrator";
import { GameMode } from "./types/game";
import { logger } from "./utils/logger";

// ---------------------------------------------------------------------------
// Cookie / Session helpers
// ---------------------------------------------------------------------------

export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  if (!header) return {};
  const raw = Array.isArray(header) ? header.join(";") : header;
  return raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    const value = rest.join("=");
    try {
      acc[key] = decodeURIComponent(value || "");
    } catch {
      acc[key] = value || "";
    }
    return acc;
  }, {});
}

export function extractSessionToken(socket: Socket): string | null {
  const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
  const headerAuth = socket.handshake.headers.authorization;
  const bearer =
    typeof headerAuth === "string" && headerAuth.toLowerCase().startsWith("bearer ")
      ? headerAuth.slice(7).trim()
      : null;
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const cookieToken = cookies["blindify_session_token"] ?? null;
  return authToken || bearer || cookieToken || null;
}

// ---------------------------------------------------------------------------
// Room access
// ---------------------------------------------------------------------------

export type RoomAccess = {
  id: number;
  room_code: string;
  host_user_id: number;
  status: string;
  session_id: number | null;
};

export async function requireRoomAccess(roomCode: string, userId: number): Promise<{ room: RoomAccess; isHost: boolean } | null> {
  const { rows: roomRows } = await pool.query<RoomAccess>(
    `SELECT id, room_code, host_user_id, status, session_id
     FROM multiplayer_rooms
     WHERE room_code=$1
     LIMIT 1`,
    [roomCode]
  );
  const room = roomRows[0];
  if (!room) return null;
  const membership = await pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`, [
    room.id,
    userId,
  ]);
  if (!membership.rows.length) return null;
  return { room, isHost: room.host_user_id === userId };
}

export function emitRoomError(socket: Socket, roomCode: string, message: string, code = "forbidden"): void {
  socket.emit("room:error", {
    roomCode,
    code,
    message,
    serverTimestamp: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Friend presence helpers
// ---------------------------------------------------------------------------

export async function broadcastFriendPresence(userId: number, username: string | null) {
  const friendIds = await getAcceptedFriendIds(userId);
  if (!friendIds.length) return;
  const state = getPresence(userId);
  const payload = {
    userId,
    username,
    online: state.online,
    activity: state.activity,
    context: state.context ?? null,
    roomCode: state.roomCode,
    status: state.status,
    updatedAt: state.updatedAt,
  };
  for (const fid of friendIds) {
    emitToUser(fid, "friends:status:update", payload);
  }
}

export async function pushFriendPresenceSnapshot(io: Server, userId: number, socketId: string) {
  const friendIds = await getAcceptedFriendIds(userId);
  if (!friendIds.length) return;
  const presence = getPresenceForUsers(friendIds);
  const { rows } = await pool.query<{ id: number; username: string | null }>(
    `SELECT id, username FROM users WHERE id = ANY($1::int[])`,
    [friendIds]
  );
  const nameMap = new Map<number, string | null>();
  rows.forEach(u => nameMap.set(u.id, u.username));
  const snapshot = friendIds.map(id => ({
    userId: id,
    username: nameMap.get(id) ?? null,
    online: presence[id]?.online ?? false,
    activity: presence[id]?.activity ?? "idle",
    context: presence[id]?.context ?? null,
    roomCode: presence[id]?.roomCode ?? null,
    status: presence[id]?.status ?? "offline",
    updatedAt: presence[id]?.updatedAt ?? Date.now(),
  }));
  io.to(socketId).emit("friends:status:init", snapshot);
}

// ---------------------------------------------------------------------------
// Main socket registration
// ---------------------------------------------------------------------------

export function registerSocketHandlers(io: Server, lastKnownUsername: Map<number, string | null>): void {
  io.use(async (socket, next) => {
    try {
      const token = extractSessionToken(socket);
      if (!token) {
        logger.debug(`socket middleware: no token for ${socket.id}`);
        return next(new Error("unauthorized"));
      }
      const context = await getSessionContextFromToken(token, { autoExtend: true });
      if (!context) {
        logger.debug(`socket middleware: invalid token for ${socket.id}`);
        return next(new Error("unauthorized"));
      }
      (socket.data as { auth?: SessionContext }).auth = context;
      return next();
    } catch (err) {
      logger.debug(`socket middleware: error for ${socket.id}: ${err}`);
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", socket => {
    logger.debug(`socket connected: ${socket.id}`);
    const auth = (socket.data as { auth?: SessionContext }).auth;
    if (!auth?.user) {
      logger.debug(`socket ${socket.id} rejected: no auth`);
      socket.emit("room:error", {
        code: "unauthorized",
        message: "Authentification requise",
        serverTimestamp: Date.now(),
      });
      socket.disconnect(true);
      return;
    }

    const currentUser = auth.user;
    logger.debug(`socket ${socket.id} authenticated as user ${currentUser.id} (${currentUser.username})`);
    lastKnownUsername.set(currentUser.id, currentUser.username ?? null);

    const beforePresence = getPresence(currentUser.id);
    const presence = registerSocket(currentUser.id, socket.id);
    const contextChanged =
      beforePresence.context?.id !== presence.context?.id || beforePresence.context?.type !== presence.context?.type;
    const stateChanged =
      beforePresence.status !== presence.status ||
      beforePresence.online !== presence.online ||
      beforePresence.activity !== presence.activity ||
      beforePresence.roomCode !== presence.roomCode;
    if (stateChanged || contextChanged) {
      broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
    }
    pushFriendPresenceSnapshot(io, currentUser.id, socket.id).catch(() => {});

    socket.on("presence:heartbeat", () => {
      const before = getPresence(currentUser.id);
      const after = recordHeartbeat(currentUser.id);
      const contextChanged =
        before.context?.id !== after.context?.id || before.context?.type !== after.context?.type;
      const stateChanged =
        before.status !== after.status ||
        before.online !== after.online ||
        before.activity !== after.activity ||
        before.roomCode !== after.roomCode;
      if (stateChanged || contextChanged) {
        broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
      }
    });

    const sendStateToSocket = (roomCode: string) => {
      const snapshot = gameStateSnapshot(roomCode);
      if (snapshot) {
        socket.emit("game:state", snapshot);
      }
    };

    socket.on("room:join", async ({ roomCode }: { roomCode: string }) => {
      logger.debug(`room:join request from user ${currentUser.id} (${currentUser.username}) for room ${roomCode}, socketId=${socket.id}`);
      if (!roomCode) return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) {
        logger.debug(`room:join DENIED for user ${currentUser.id} - no access`);
        emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
        return;
      }
      socket.join(roomCode);
      logger.debug(`user ${currentUser.id} joined socket room ${roomCode}, rooms now: ${Array.from(socket.rooms).join(", ")}`);
      // Clear disconnected flag when player reconnects
      markReconnected(roomCode, currentUser.id);
      // In event mode, the host is a spectator/presenter — don't add them as a player
      const roomGameMode = getGameMode(roomCode);
      const roomGameState = getRealtimeState(roomCode);
      const isEventHost = roomGameMode === "event" && roomGameState?.hostUserId === currentUser.id;
      if (!isEventHost) {
        upsertPlayer(roomCode, {
          userId: currentUser.id,
          username: currentUser.username ?? null,
          avatar: (currentUser as any).avatar ?? null,
        });
      }
      io.to(roomCode).emit("room:presence", {
        type: "joined",
        roomCode,
        user: { id: currentUser.id, username: currentUser.username ?? undefined },
        serverTimestamp: Date.now(),
      });
      sendStateToSocket(roomCode);

      setPresence(currentUser.id, { online: true, activity: "playing", context: { type: "room", id: roomCode } });
      broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
    });

    socket.on("room:leave", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      socket.leave(roomCode);
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) return;
      removePlayer(roomCode, currentUser.id);
      io.to(roomCode).emit("room:presence", {
        type: "left",
        roomCode,
        userId: currentUser.id,
        serverTimestamp: Date.now(),
      });
      broadcastState(io, roomCode);

      setPresence(currentUser.id, { online: true, activity: "idle", context: null });
      broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
    });

    socket.on(
      "game:answer",
      async ({ roomCode, guess, guessTitle, guessArtist, sourceUserId }: {
        roomCode: string;
        guess?: string;
        guessTitle?: string;
        guessArtist?: string;
        sourceUserId?: number | null;
      }) => {
        logger.debug(`game:answer received from user ${currentUser.id} for room ${roomCode}`, { guess, guessTitle, guessArtist });
        if (!roomCode) return;
        const access = await requireRoomAccess(roomCode, currentUser.id);
        if (!access) {
          logger.debug(`game:answer DENIED - no access for user ${currentUser.id}`);
          emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
          return;
        }
        // Ensure this socket is still in the room (may have lost membership on reconnect)
        if (!socket.rooms.has(roomCode)) {
          logger.debug(`game:answer socket ${socket.id} not in room ${roomCode}, re-joining`);
          socket.join(roomCode);
        }
        // If this player was marked disconnected, clear it since they're clearly online
        markReconnected(roomCode, currentUser.id);
        const state = getRealtimeState(roomCode);
        // Block host from answering in event mode (host is spectator/presenter)
        const gameMode = getGameMode(roomCode);
        if (gameMode === "event" && state?.hostUserId === currentUser.id) {
          emitRoomError(socket, roomCode, "L'hôte ne peut pas répondre en mode événement.");
          return;
        }
        if (!state) {
          logger.debug(`game:answer DENIED - no game state for room ${roomCode}`);
          emitRoomError(socket, roomCode, "Partie introuvable pour cette salle.");
          return;
        }
        // Build combined guess for legacy compatibility
        const combinedGuess = guess ?? `${guessTitle ?? ""} ${guessArtist ?? ""}`.trim();
        logger.debug(`game:answer recording answer for user ${currentUser.id}: "${combinedGuess}"`);
        recordAnswer(roomCode, currentUser.id, combinedGuess, sourceUserId, guessTitle, guessArtist);

        // Check if all answerable players have answered BEFORE broadcasting state,
        // so clients receive a single consistent state update instead of a GUESSING→REVEAL flicker.
        const currentPhase = getRealtimeState(roomCode)?.phase;
        const answerable = allAnswerablePlayers(roomCode);
        const everyoneAnswered =
          currentPhase === "GUESSING" &&
          answerable.length > 0 &&
          answerable.every(p => p.hasAnswered);

        logger.debug(`game:answer check: phase=${currentPhase}, answerable=${answerable.length}, answered=[${answerable.map(p => `${p.userId}:${p.hasAnswered}`).join(",")}], everyoneAnswered=${everyoneAnswered}`);

        if (everyoneAnswered) {
          logger.debug(`game:answer triggering early reveal for ${roomCode}`);
          clearRevealTimer(roomCode);
          const revealed = revealRound(roomCode);
          logger.debug(`game:answer revealRound result: phase=${revealed?.phase}`);
          if (revealed) {
            io.to(roomCode).emit("game:round:reveal", {
              roomCode,
              round: revealed.currentRound,
              timing: revealed.timing,
              players: revealed.players,
            });
            if (revealed.phase === "FINISHED") {
              broadcastGameOver(io, roomCode);
            }
          }
        }
        // Broadcast state AFTER the reveal decision so clients see the final phase.
        broadcastState(io, roomCode);
        // Also send directly to the answering socket as a fallback, in case
        // the socket temporarily lost room membership (brief reconnect).
        const snapshot = gameStateSnapshot(roomCode);
        if (snapshot) {
          socket.emit("game:state", snapshot);
        }
      });

    socket.on("game:ready", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      logger.debug(`game:ready from user ${currentUser.id} for room ${roomCode}`);
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) {
        emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
        return;
      }
      // Ensure this socket is still in the room
      if (!socket.rooms.has(roomCode)) {
        socket.join(roomCode);
      }
      markReconnected(roomCode, currentUser.id);
      const existing = getRealtimeState(roomCode);
      if (!existing) {
        emitRoomError(socket, roomCode, "Aucune partie en cours.");
        return;
      }
      logger.debug(`game:ready phase before markReady: ${existing.phase}, round: ${existing.currentRound}`);
      const beforeRound = existing.currentRound;
      const state = markReadyState(roomCode, currentUser.id);
      if (!state) return;
      logger.debug(`game:ready phase after markReady: ${state.phase}, round: ${state.currentRound}`);
      if (state.phase === "GUESSING" && state.currentTrack && state.timing.revealAt && state.currentRound !== beforeRound) {
        logger.debug(`game:ready advancing to round ${state.currentRound} for ${roomCode}`);
        // Broadcast full state FIRST so clients have the new round before
        // the round:start trigger fires. Avoids the frontend needing to
        // reconstruct a minimal state from the round:start payload.
        broadcastState(io, roomCode);
        io.to(roomCode).emit("game:round:start", {
          roomCode,
          round: state.currentRound,
          track: state.currentTrack,
          timing: state.timing,
        });
        scheduleReveal(io, roomCode, state.timing.revealAt);
      } else if (state.phase === "FINISHED") {
        logger.debug(`game:ready game finished for ${roomCode}`);
        broadcastState(io, roomCode);
        broadcastGameOver(io, roomCode);
        clearRevealTimer(roomCode);
      } else {
        // Just a partial ready (player marked ready but not all yet) — broadcast updated state.
        broadcastState(io, roomCode);
      }
    });

    socket.on("game:sync", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      const state = getRealtimeState(roomCode);
      if (!state) return;
      // Ensure this socket is still in the room (may have lost membership on reconnect)
      if (!socket.rooms.has(roomCode)) {
        logger.debug(`game:sync socket ${socket.id} not in room ${roomCode}, re-joining`);
        socket.join(roomCode);
      }
      // If the game is stuck in GUESSING with an expired revealAt, trigger reveal now
      if (state.phase === "GUESSING" && state.timing.revealAt && state.timing.revealAt <= Date.now()) {
        logger.debug(`game:sync forcing reveal for ${roomCode} (revealAt was ${state.timing.revealAt}, now=${Date.now()})`);
        const updated = revealRound(roomCode);
        if (updated) {
          io.to(roomCode).emit("game:round:reveal", {
            roomCode,
            round: updated.currentRound,
            timing: updated.timing,
            players: updated.players,
          });
          broadcastState(io, roomCode);
          if (updated.phase === "FINISHED") {
            broadcastGameOver(io, roomCode);
            clearRevealTimer(roomCode);
          }
        }
      } else {
        broadcastState(io, roomCode);
      }
      // Also send directly to the requesting socket as a fallback
      const snapshot = gameStateSnapshot(roomCode);
      if (snapshot) {
        socket.emit("game:state", snapshot);
      }
    });

    // Chat messages
    socket.on("room:chat", ({ roomCode, message }: { roomCode: string; message: string }) => {
      if (!roomCode || typeof message !== "string") return;
      const text = message.trim().slice(0, 200);
      if (!text) return;
      io.to(roomCode).emit("room:chat", {
        userId: currentUser.id,
        username: currentUser.username ?? `Joueur ${currentUser.id}`,
        message: text,
        timestamp: Date.now(),
      });
    });

    socket.on("game:leave", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      socket.leave(roomCode);
      removePlayer(roomCode, currentUser.id);
      broadcastState(io, roomCode);
    });

    // Streamer mode: game:guess (chat or host submits a guess)
    socket.on("game:guess", async ({ roomCode, guess }: { roomCode: string; guess: string }) => {
      if (!roomCode || typeof guess !== "string") return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) {
        emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
        return;
      }
      const streamerState = getStreamerSnapshot(roomCode);
      if (!streamerState) {
        emitRoomError(socket, roomCode, "Partie streamer introuvable.");
        return;
      }
      handleStreamerGuess(io, roomCode, currentUser.id, guess, GameMode.STREAMER);
    });

    // Streamer mode: host:start (host advances to next round)
    socket.on("host:start", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access || !access.isHost) {
        emitRoomError(socket, roomCode, "Seul l'hôte peut lancer la manche.");
        return;
      }
      const streamerState = getStreamerSnapshot(roomCode);
      if (!streamerState) {
        emitRoomError(socket, roomCode, "Partie streamer introuvable.");
        return;
      }
      advanceStreamerRound(io, roomCode);
    });

    socket.on("disconnecting", () => {
      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
      for (const roomCode of rooms) {
        const state = getRealtimeState(roomCode);
        if (state && state.phase === "GUESSING") {
          // Mark the player as disconnected instead of recording an empty answer.
          // This way they are excluded from allAnswerablePlayers() and won't
          // trigger a premature reveal that steals time from other players.
          markDisconnected(roomCode, currentUser.id);
          // Re-check if remaining answerable players have all answered
          const answerable = allAnswerablePlayers(roomCode);
          const everyoneAnswered = answerable.length > 0 && answerable.every(p => p.hasAnswered);
          if (everyoneAnswered) {
            clearRevealTimer(roomCode);
            const revealed = revealRound(roomCode);
            if (revealed) {
              io.to(roomCode).emit("game:round:reveal", {
                roomCode,
                round: revealed.currentRound,
                timing: revealed.timing,
                players: revealed.players,
              });
              if (revealed.phase === "FINISHED") {
                broadcastGameOver(io, roomCode);
              }
            }
          }
          broadcastState(io, roomCode);
        } else if (state && state.phase === "REVEAL") {
          // During REVEAL, mark disconnected so they don't block ready-check
          markDisconnected(roomCode, currentUser.id);
          broadcastState(io, roomCode);
        } else {
          // Not in active game: remove player entirely
          removePlayer(roomCode, currentUser.id);
        }
        io.to(roomCode).emit("room:presence", {
          type: "disconnected",
          roomCode,
          socketId: socket.id,
          userId: currentUser.id,
          serverTimestamp: Date.now(),
        });

        // Cleanup streamer game if the host disconnects
        const streamerState = getStreamerSnapshot(roomCode);
        if (streamerState && streamerState.hostUserId === currentUser.id) {
          cleanupStreamer(roomCode);
          io.to(roomCode).emit("state:sync", { ...streamerState, phase: "GAME_OVER" });
        }
      }
    });

    const tick = setInterval(() => {
      socket.emit("server:tick", { serverTimestamp: Date.now() });
    }, 5000);
    // A heartbeat must never keep the process alive on its own.
    tick.unref?.();

    socket.on("disconnect", () => {
      clearInterval(tick);
      const before = getPresence(currentUser.id);
      const state = unregisterSocket(currentUser.id, socket.id);
      const contextChanged =
        before.context?.id !== state.context?.id || before.context?.type !== state.context?.type || before.roomCode !== state.roomCode;
      const stateChanged =
        before.status !== state.status ||
        before.online !== state.online ||
        before.activity !== state.activity;
      if (stateChanged || contextChanged) {
        broadcastFriendPresence(currentUser.id, currentUser.username ?? null).catch(() => {});
      }
    });

    // Always publish the current server time to help clients sync timers
  });
}
