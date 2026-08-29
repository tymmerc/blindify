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
  setHostConnected,
  pauseGame,
  resumeGame,
  markDisconnected,
  markReconnected,
  getGameMode,
  getSessionId,
} from "./services/realtimeGame";
import { persistRoundResponses } from "./services/gamePersistence";
import * as lobbyRps from "./services/lobbyRps";
import { validRoomCode, clampText, toIntOrNull, MAX_GUESS_LEN, MAX_CHAT_LEN } from "./utils/socketValidation";
import {
  broadcastGameOver,
  broadcastState,
  clearAdvanceTimer,
  clearRevealTimer,
  scheduleForcedAdvance,
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
import * as roomPresence from "./services/roomPresence";
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
  mode: string;
  host_plays: boolean;
};

export async function requireRoomAccess(roomCode: string, userId: number): Promise<{ room: RoomAccess; isHost: boolean } | null> {
  const { rows: roomRows } = await pool.query<RoomAccess>(
    `SELECT id, room_code, host_user_id, status, session_id, mode, host_plays
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

    // Onglet au premier plan ou non (Page Visibility) : met a jour le statut "absent".
    socket.on("presence:state", (payload: { roomCode?: unknown; state?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
      const state = payload?.state;
      if (!roomCode || (state !== "active" && state !== "away")) return;
      if (!roomPresence.getMembers(roomCode).some(m => m.userId === currentUser.id)) return;
      roomPresence.setStatus(roomCode, currentUser.id, state);
      io.to(roomCode).emit("room:presence", {
        type: "members",
        roomCode,
        members: roomPresence.getMembers(roomCode),
        serverTimestamp: Date.now(),
      });
    });

    const sendStateToSocket = (roomCode: string) => {
      const snapshot = gameStateSnapshot(roomCode);
      if (snapshot) {
        socket.emit("game:state", snapshot);
      }
    };

    socket.on("room:join", async (payload: { roomCode?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
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
      // Le pseudo d'un invite peut etre renomme par joinRoom (REST) APRES la
      // connexion socket : sans relecture, la presence figerait "Joueur".
      try {
        const { rows: freshRows } = await pool.query<{ username: string | null }>(
          `SELECT username FROM users WHERE id=$1`,
          [currentUser.id]
        );
        const freshName = freshRows[0]?.username ?? currentUser.username ?? null;
        (currentUser as { username?: string | null }).username = freshName;
        lastKnownUsername.set(currentUser.id, freshName);
      } catch { /* pseudo de connexion conserve */ }
      // Clear disconnected flag when player reconnects
      markReconnected(roomCode, currentUser.id);
      // En mode event, l'hote est present-only SAUF s'il a choisi "je joue aussi".
      const isEventPresenterOnly =
        access.room.mode === "event" && access.room.host_plays !== true && access.room.host_user_id === currentUser.id;
      if (access.isHost) setHostConnected(roomCode, true);
      if (!isEventPresenterOnly) {
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
      // Presence lobby : (re)devient actif, on annule une eventuelle grace de deconnexion.
      roomPresence.upsertMember(roomCode, currentUser.id, currentUser.username ?? null, "active");
      roomPresence.cancelGrace(roomCode, currentUser.id);
      io.to(roomCode).emit("room:presence", {
        type: "members",
        roomCode,
        members: roomPresence.getMembers(roomCode),
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
      // Meme regle que game:leave : partir en pleine partie ne doit pas effacer
      // ses points du podium. Deconnecte pendant le jeu, supprime hors jeu.
      const liveRoomState = getRealtimeState(roomCode);
      if (liveRoomState && (liveRoomState.phase === "GUESSING" || liveRoomState.phase === "REVEAL")) {
        markDisconnected(roomCode, currentUser.id);
        if (liveRoomState.hostUserId === currentUser.id) setHostConnected(roomCode, false);
      } else {
        removePlayer(roomCode, currentUser.id);
      }
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
      async (
        payload: {
          roomCode?: unknown;
          guess?: unknown;
          guessTitle?: unknown;
          guessArtist?: unknown;
          sourceUserId?: unknown;
          /** Manche visee par la reponse : protege contre une reponse en retard
              (relance apres coupure) qui serait comptee sur la chanson suivante. */
          round?: unknown;
        },
        // Accuse de reception : sans lui, le client ne sait pas si sa reponse est
        // arrivee (socket.io met ~20s a voir une coupure reseau, la reponse part
        // dans le vide et le joueur reste bloque a 0).
        ack?: (res: { ok: boolean; reason?: string }) => void
      ) => {
        const roomCode = validRoomCode(payload?.roomCode);
        if (!roomCode) {
          ack?.({ ok: false, reason: "invalid_room" });
          return;
        }
        const guess = clampText(payload?.guess, MAX_GUESS_LEN);
        const guessTitle = clampText(payload?.guessTitle, MAX_GUESS_LEN);
        const guessArtist = clampText(payload?.guessArtist, MAX_GUESS_LEN);
        const sourceUserId = toIntOrNull(payload?.sourceUserId);
        logger.debug(`game:answer received from user ${currentUser.id} for room ${roomCode}`, { guess, guessTitle, guessArtist });
        const access = await requireRoomAccess(roomCode, currentUser.id);
        if (!access) {
          logger.debug(`game:answer DENIED - no access for user ${currentUser.id}`);
          emitRoomError(socket, roomCode, "Accès refusé à cette salle.");
          ack?.({ ok: false, reason: "forbidden" });
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
        // En event, l'hote ne peut repondre QUE s'il a choisi "je joue aussi".
        const gameMode = getGameMode(roomCode);
        if (gameMode === "event" && state?.hostUserId === currentUser.id && !(state as any)?.hostPlays) {
          emitRoomError(socket, roomCode, "L'hôte présente seulement sur cette partie.");
          ack?.({ ok: false, reason: "presenter_only" });
          return;
        }
        if (!state) {
          logger.debug(`game:answer DENIED - no game state for room ${roomCode}`);
          emitRoomError(socket, roomCode, "Partie introuvable pour cette salle.");
          ack?.({ ok: false, reason: "no_game" });
          return;
        }
        // Reponse perimee : le client a vise une manche qui n'est plus celle en
        // cours (relance apres coupure reseau). On refuse, sinon elle serait
        // comptee sur la chanson suivante.
        const targetRound = toIntOrNull(payload?.round);
        if (targetRound !== null && targetRound !== state.currentRound) {
          logger.debug(`game:answer STALE (round ${targetRound} vs ${state.currentRound}) user ${currentUser.id}`);
          ack?.({ ok: false, reason: "stale_round" });
          return;
        }
        // Build combined guess for legacy compatibility
        const combinedGuess = guess ?? `${guessTitle ?? ""} ${guessArtist ?? ""}`.trim();
        logger.debug(`game:answer recording answer for user ${currentUser.id}: "${combinedGuess}"`);
        // La manche doit encore etre en cours, sinon recordAnswer jette la reponse
        // en silence (et on confirmait quand meme "c'est note" au joueur).
        if (state.phase !== "GUESSING") {
          logger.debug(`game:answer TOO LATE (phase ${state.phase}) user ${currentUser.id}`);
          ack?.({ ok: false, reason: "round_over" });
          return;
        }
        if (state.paused) {
          ack?.({ ok: false, reason: "paused" });
          return;
        }
        recordAnswer(roomCode, currentUser.id, combinedGuess, sourceUserId, guessTitle, guessArtist);
        // On confirme UNIQUEMENT si la reponse est reellement enregistree.
        const recorded = getRealtimeState(roomCode)?.players?.[currentUser.id]?.hasAnswered === true;
        ack?.({ ok: recorded, reason: recorded ? undefined : "not_recorded" });

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
            // Persist this round's answers on the early-reveal path too
            // (the timer path persists in the orchestrator).
            void persistRoundResponses(revealed, getSessionId(roomCode));
            if (revealed.phase === "FINISHED") {
              broadcastGameOver(io, roomCode);
            } else if (revealed.phase === "REVEAL") {
              // Filet anti-AFK sur le chemin early-reveal aussi.
              scheduleForcedAdvance(io, roomCode, revealed.currentRound);
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
      if (existing?.paused) return; // pas d'avancement de manche pendant la pause
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
      // If the game is stuck in GUESSING with an expired revealAt, trigger reveal now.
      // JAMAIS pendant une pause : revealAt y est fige dans le passe par design,
      // un simple resync de client aurait force le reveal a travers la pause.
      if (!state.paused && state.phase === "GUESSING" && state.timing.revealAt && state.timing.revealAt <= Date.now()) {
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
    socket.on("room:chat", async (payload: { roomCode?: unknown; message?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode) return;
      const text = clampText(payload?.message, MAX_CHAT_LEN);
      if (!text) return;
      // Only members of the room may broadcast into it.
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) return;
      io.to(roomCode).emit("room:chat", {
        userId: currentUser.id,
        username: currentUser.username ?? `Joueur ${currentUser.id}`,
        message: text,
        timestamp: Date.now(),
      });
    });

    // ─── Pierre-feuille-ciseaux de lobby (mini-jeu d'attente) ───
    // Tout est broadcaste a la salle : les clients filtrent selon leur userId.
    socket.on("lobby:rps:challenge", async (payload: { roomCode?: unknown; targetUserId?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode) return;
      const targetUserId = toIntOrNull(payload?.targetUserId);
      if (!targetUserId || targetUserId === currentUser.id) return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) return;
      const match = lobbyRps.createMatch(
        roomCode,
        currentUser.id,
        currentUser.username ?? null,
        targetUserId,
        lastKnownUsername.get(targetUserId) ?? null,
        Date.now()
      );
      io.to(roomCode).emit("lobby:rps:challenge", {
        matchId: match.id,
        fromUserId: match.a,
        fromUsername: match.aName,
        targetUserId: match.b,
      });
    });

    socket.on("lobby:rps:accept", async (payload: { roomCode?: unknown; matchId?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode || typeof payload?.matchId !== "string") return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) return;
      const existing = lobbyRps.getMatch(roomCode, payload.matchId);
      // Seul le joueur defie peut accepter.
      if (!existing || existing.b !== currentUser.id) return;
      const match = lobbyRps.acceptMatch(roomCode, payload.matchId);
      if (!match) return;
      io.to(roomCode).emit("lobby:rps:start", {
        matchId: match.id,
        a: match.a,
        b: match.b,
        aName: match.aName,
        bName: match.bName,
      });
    });

    socket.on("lobby:rps:decline", async (payload: { roomCode?: unknown; matchId?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode || typeof payload?.matchId !== "string") return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) return;
      const existing = lobbyRps.getMatch(roomCode, payload.matchId);
      if (!existing || (existing.b !== currentUser.id && existing.a !== currentUser.id)) return;
      lobbyRps.removeMatch(roomCode, payload.matchId);
      io.to(roomCode).emit("lobby:rps:declined", { matchId: payload.matchId, byUserId: currentUser.id });
    });

    socket.on("lobby:rps:move", async (payload: { roomCode?: unknown; matchId?: unknown; move?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode || typeof payload?.matchId !== "string") return;
      if (!lobbyRps.isValidMove(payload?.move)) return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access) return;
      const res = lobbyRps.recordMove(roomCode, payload.matchId, currentUser.id, payload.move);
      if (!res) return;
      if (!res.done) return;
      const { match } = res;
      const winnerUserId = lobbyRps.resolveWinner(match);
      if (winnerUserId) {
        const winnerName = winnerUserId === match.a ? match.aName : match.bName;
        lobbyRps.bumpWin(roomCode, winnerUserId, winnerName);
      }
      io.to(roomCode).emit("lobby:rps:result", {
        matchId: match.id,
        a: match.a,
        b: match.b,
        aMove: match.moves[match.a],
        bMove: match.moves[match.b],
        winnerUserId,
      });
      io.to(roomCode).emit("lobby:rps:scoreboard", { scoreboard: lobbyRps.getScoreboard(roomCode) });
      lobbyRps.removeMatch(roomCode, match.id);
    });

    // Pause / reprise : reservee a l'hote. Pause = gel des timers serveur ;
    // reprise = decalage des horloges puis re-programmation du timer de la phase.
    socket.on("game:pause", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access?.isHost) {
        emitRoomError(socket, roomCode, "Seul l'hôte peut mettre en pause.");
        return;
      }
      const state = pauseGame(roomCode);
      if (!state?.paused) return;
      clearRevealTimer(roomCode);
      clearAdvanceTimer(roomCode);
      broadcastState(io, roomCode);
    });

    socket.on("game:resume", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      const access = await requireRoomAccess(roomCode, currentUser.id);
      if (!access?.isHost) return;
      const state = resumeGame(roomCode);
      if (!state || state.paused) return;
      if (state.phase === "GUESSING" && state.timing.revealAt) {
        scheduleReveal(io, roomCode, state.timing.revealAt);
      } else if (state.phase === "REVEAL") {
        scheduleForcedAdvance(io, roomCode, state.currentRound);
      }
      broadcastState(io, roomCode);
    });

    socket.on("game:leave", async ({ roomCode }: { roomCode: string }) => {
      if (!roomCode) return;
      socket.leave(roomCode);
      const liveState = getRealtimeState(roomCode);
      if (liveState?.hostUserId === currentUser.id) setHostConnected(roomCode, false);
      // En pleine partie, on ne SUPPRIME pas le joueur : quelqu'un qui part a la
      // manche 8/10 garde ses points au podium final. Marque deconnecte, il sort
      // des compteurs "X/Y" mais reste au classement. Hors partie, on libere le slot.
      if (liveState && (liveState.phase === "GUESSING" || liveState.phase === "REVEAL")) {
        markDisconnected(roomCode, currentUser.id);
      } else {
        removePlayer(roomCode, currentUser.id);
      }
      broadcastState(io, roomCode);
    });

    // Streamer mode: game:guess (chat or host submits a guess)
    socket.on("game:guess", async (payload: { roomCode?: unknown; guess?: unknown }) => {
      const roomCode = validRoomCode(payload?.roomCode);
      const guess = clampText(payload?.guess, MAX_GUESS_LEN);
      if (!roomCode || !guess) return;
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
        // L'hote diffuse la musique pour toute la table : les autres doivent
        // savoir qu'il n'est plus la pour prendre le relais sur leur telephone.
        if (state && state.hostUserId === currentUser.id) {
          setHostConnected(roomCode, false);
          // Seul l'hote peut reprendre une pause : s'il disparait pendant une
          // pause, la table resterait gelee pour toujours. On reprend pour lui.
          if (state.paused) {
            const resumed = resumeGame(roomCode);
            if (resumed && !resumed.paused) {
              if (resumed.phase === "GUESSING" && resumed.timing.revealAt) {
                scheduleReveal(io, roomCode, resumed.timing.revealAt);
              } else if (resumed.phase === "REVEAL") {
                scheduleForcedAdvance(io, roomCode, resumed.currentRound);
              }
            }
          }
        }
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
          // Lobby (pas de partie active) : on garde le slot pendant la grace
          // (60s) pour permettre une reconnexion, puis on libere si pas de retour.
          roomPresence.scheduleGrace(roomCode, currentUser.id, () => {
            removePlayer(roomCode, currentUser.id);
            roomPresence.removeMember(roomCode, currentUser.id);
            io.to(roomCode).emit("room:presence", {
              type: "members",
              roomCode,
              members: roomPresence.getMembers(roomCode),
              serverTimestamp: Date.now(),
            });
            broadcastState(io, roomCode);
          });
        }
        roomPresence.setStatus(roomCode, currentUser.id, "disconnected");
        io.to(roomCode).emit("room:presence", {
        type: "members",
        roomCode,
        members: roomPresence.getMembers(roomCode),
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
