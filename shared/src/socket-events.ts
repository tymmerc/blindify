/**
 * Type-safe socket.io event signatures shared between client and server.
 *
 * Pass these to `Server<ClientToServerEvents, ServerToClientEvents>` on the
 * backend and `Socket<ServerToClientEvents, ClientToServerEvents>` on the
 * frontend so payload changes break the build instead of silently diverging.
 */

import type { GameState, RoundTrack, PlayerState, GameTiming } from "./game"

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  "room:join": (payload: {
    roomCode: string
    user?: { id: number; username?: string }
  }) => void

  "game:answer": (payload: {
    roomCode: string
    guessTitle?: string
    guessArtist?: string
    sourceUserId?: number | null
    guess?: string // legacy combined-guess fallback
  }) => void

  "game:ready": (payload: { roomCode: string }) => void

  "game:sync": (payload: { roomCode: string }) => void

  "room:chat": (payload: { roomCode: string; message: string }) => void

  "presence:heartbeat": () => void

  "host:start": (payload: { roomCode: string }) => void
}

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export interface RoomPresenceEvent {
  roomCode: string
  participants: Array<{ userId: number; username: string | null }>
}

export interface RoundStartEvent {
  roomCode: string
  round: number
  track: RoundTrack
  timing: GameTiming
}

export interface RoundRevealEvent {
  roomCode: string
  round: number
  timing: GameTiming
  players: Record<number, PlayerState>
}

export interface GameOverEvent {
  roomCode: string
  players: Record<number, PlayerState>
}

export interface RoomChatEvent {
  userId: number
  username: string
  message: string
  timestamp: number
}

export interface RoomErrorEvent {
  code: string
  message: string
  serverTimestamp?: number
}

export interface ServerToClientEvents {
  "game:state": (state: GameState) => void
  "state:sync": (state: GameState) => void
  "game:round:start": (payload: RoundStartEvent) => void
  "game:round:reveal": (payload: RoundRevealEvent) => void
  "game:over": (payload: GameOverEvent) => void
  "game:game:over": (payload: GameOverEvent) => void // legacy duplicate
  "room:presence": (payload: RoomPresenceEvent) => void
  "player-joined": (payload: { roomCode: string; user: { id: number; username: string | null } }) => void
  "room:chat": (payload: RoomChatEvent) => void
  "room:error": (payload: RoomErrorEvent) => void
}
