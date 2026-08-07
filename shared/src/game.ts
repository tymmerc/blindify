/**
 * Canonical game types shared between Blindify backend and frontend.
 *
 * Use string literal unions (not enums) so payloads serialize cleanly over JSON
 * and socket.io events are type-safe at compile time.
 */

export type GameMode = "friends" | "event" | "streamer"

export type GamePhase = "LOBBY" | "GUESSING" | "REVEAL" | "FINISHED"

export type Verdict = "correct" | "close" | "wrong"

export interface RoundTrack {
  round: number
  trackId: string
  audioSourceId?: string | number
  title: string
  artist: string
  album?: string | null
  previewUrl: string | null
  albumCover?: string | null
  metadata?: Record<string, unknown> | null
  ownerChoices?: number[]
}

export interface PlayerState {
  userId: number
  username: string | null
  avatar?: string | null
  score: number
  hasAnswered: boolean
  isReady: boolean
  disconnected?: boolean
  lastGuess?: string
  lastGuessTitle?: string | null
  lastGuessArtist?: string | null
  lastSourceGuess?: number | null
  lastVerdict?: Verdict
  answerAt?: number | null
  lastGained?: number
  totalReactionMs?: number
  accuracy?: number
  rounds?: number
  correct?: number
  streak?: number
  bestStreak?: number
}

export interface GameTiming {
  startAt: number | null
  revealAt: number | null
}

export interface GameConfig {
  autoAdvance: boolean
  roundDurationMs: number
}

export interface GameState {
  roomCode: string
  hostUserId: number | null
  hostPlays?: boolean
  singleContributor?: boolean
  mode: GameMode
  phase: GamePhase
  currentRound: number
  totalRounds: number
  currentTrack: RoundTrack | null
  players: Record<number, PlayerState>
  timing: GameTiming
  config: GameConfig
}

/**
 * Mode constants (avoid magic strings without forcing enum semantics).
 */
export const MODES = {
  FRIENDS: "friends",
  EVENT: "event",
  STREAMER: "streamer",
} as const satisfies Record<string, GameMode>

export const PHASES = {
  LOBBY: "LOBBY",
  GUESSING: "GUESSING",
  REVEAL: "REVEAL",
  FINISHED: "FINISHED",
} as const satisfies Record<string, GamePhase>
