import { io } from "../socket";

export type PresenceStatus = "online" | "offline" | "playing"; // Legacy view
export type PresenceActivity = "idle" | "playing" | "hosting" | "spectating";
export type PresenceContext = { type: "room" | "event"; id: string };

// Stored shape with backward-compat fields for clients not yet migrated.
export type PresenceState = {
  online: boolean;
  activity: PresenceActivity;
  context?: PresenceContext | null;
  updatedAt: number;
  status: PresenceStatus; // derived: offline if !online, playing if activity === "playing"
  roomCode: string | null; // derived from context when type === "room"
};

const presenceByUser = new Map<number, PresenceState>();
const socketsByUser = new Map<number, Set<string>>();
const heartbeatByUser = new Map<number, number>();

function now(): number {
  return Date.now();
}

// Increased TTL to better tolerate background throttling; offline still immediate on socket disconnect.
export const PRESENCE_HEARTBEAT_TTL_MS = 45_000;

function buildPresence(state: { online: boolean; activity: PresenceActivity; context?: PresenceContext | null; updatedAt: number }): PresenceState {
  const context = state.context ?? undefined;
  const status: PresenceStatus = state.online ? (state.activity === "playing" ? "playing" : "online") : "offline";
  const roomCode = context?.type === "room" ? context.id : null;
  return { ...state, context, status, roomCode };
}

function writeState(userId: number, state: PresenceState): PresenceState {
  presenceByUser.set(userId, state);
  heartbeatByUser.set(userId, state.updatedAt);
  return state;
}

export function registerSocket(userId: number, socketId: string): PresenceState {
  const existing = socketsByUser.get(userId) ?? new Set<string>();
  existing.add(socketId);
  socketsByUser.set(userId, existing);

  const current = presenceByUser.get(userId);
  const state = buildPresence({
    online: true,
    activity: current?.activity ?? "idle",
    context: current?.context,
    updatedAt: now(),
  });
  return writeState(userId, state);
}

export function unregisterSocket(userId: number, socketId: string): PresenceState {
  const existing = socketsByUser.get(userId);
  if (existing) {
    existing.delete(socketId);
    if (!existing.size) {
      socketsByUser.delete(userId);
    } else {
      socketsByUser.set(userId, existing);
    }
  }
  const hasOtherSockets = socketsByUser.get(userId)?.size;
  const current = presenceByUser.get(userId);
  const state: PresenceState = hasOtherSockets
    ? buildPresence({
        online: true,
        activity: current?.activity ?? "idle",
        context: current?.context,
        updatedAt: now(),
      })
    : buildPresence({
        online: false,
        activity: "idle",
        context: null,
        updatedAt: now(),
      });

  if (!hasOtherSockets) {
    heartbeatByUser.delete(userId);
  } else {
    heartbeatByUser.set(userId, state.updatedAt);
  }
  presenceByUser.set(userId, state);
  return state;
}

export function setPresence(
  userId: number,
  next:
    | PresenceStatus
    | (Partial<Omit<PresenceState, "status" | "roomCode">> & { online?: boolean; activity?: PresenceActivity; context?: PresenceContext | null }),
  roomCode: string | null = null
): PresenceState {
  if (typeof next === "string") {
    if (next === "offline") {
      const state = buildPresence({ online: false, activity: "idle", context: null, updatedAt: now() });
      presenceByUser.set(userId, state);
      heartbeatByUser.delete(userId);
      return state;
    }
    const current = presenceByUser.get(userId);
    const context =
      roomCode === null ? undefined : roomCode ? ({ type: "room", id: roomCode } as PresenceContext) : current?.context;
    const state = buildPresence({
      online: true,
      activity: next === "playing" ? "playing" : current?.activity ?? "idle",
      context,
      updatedAt: now(),
    });
    return writeState(userId, state);
  }

  const current = presenceByUser.get(userId);
  const context = next.context === null ? undefined : next.context ?? current?.context;
  const state = buildPresence({
    online: next.online ?? current?.online ?? true,
    activity: next.activity ?? current?.activity ?? "idle",
    context,
    updatedAt: now(),
  });

  if (!state.online) {
    presenceByUser.set(userId, state);
    heartbeatByUser.delete(userId);
    return state;
  }
  return writeState(userId, state);
}

export function recordHeartbeat(userId: number): PresenceState {
  const current = presenceByUser.get(userId);
  const state = buildPresence({
    online: true,
    activity: current?.activity ?? "idle",
    context: current?.context,
    updatedAt: now(),
  });
  return writeState(userId, state);
}

export function findStalePresences(ttlMs: number = PRESENCE_HEARTBEAT_TTL_MS): number[] {
  const threshold = now() - ttlMs;
  const stale: number[] = [];
  heartbeatByUser.forEach((ts, userId) => {
    if (ts < threshold && presenceByUser.get(userId)?.status !== "offline") {
      stale.push(userId);
    }
  });
  return stale;
}

export function getPresence(userId: number): PresenceState {
  const current = presenceByUser.get(userId);
  if (current) return current;
  return buildPresence({ online: false, activity: "idle", context: null, updatedAt: now() });
}

export function getPresenceForUsers(userIds: number[]): Record<number, PresenceState> {
  const payload: Record<number, PresenceState> = {};
  const timestamp = now();
  for (const id of userIds) {
    payload[id] = presenceByUser.get(id) ?? buildPresence({ online: false, activity: "idle", context: null, updatedAt: timestamp });
  }
  return payload;
}

export function getUserSockets(userId: number): Set<string> | null {
  return socketsByUser.get(userId) ?? null;
}

export function emitToUser(userId: number, event: string, payload: unknown): void {
  const sockets = socketsByUser.get(userId);
  if (!sockets || !sockets.size) return;
  sockets.forEach(socketId => {
    io.to(socketId).emit(event, payload);
  });
}
