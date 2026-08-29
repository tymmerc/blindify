/**
 * Backend game types.
 *
 * MIRROR of /opt/blindify/shared/src/game.ts (the canonical source).
 * If you change anything here, also update:
 *   - /opt/blindify/shared/src/game.ts (source of truth)
 *   - /opt/blindify/frontend/src/lib/types.ts (frontend mirror)
 *
 * `tools/check-shared-types.sh` enforces this in CI.
 */

export type GameModeType = "friends" | "event" | "streamer"
export type GamePhaseType = "LOBBY" | "GUESSING" | "REVEAL" | "FINISHED"
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
  mode: GameModeType
  phase: GamePhaseType
  currentRound: number
  totalRounds: number
  currentTrack: RoundTrack | null
  players: Record<number, PlayerState>
  /** Partie mise en pause par l'hote (timers geles cote serveur). */
  paused?: boolean
  timing: GameTiming
  config: GameConfig
}

// Legacy aliases used by existing call sites.
// Keep `GameMode` and `GamePhase` as both runtime constants and types so code
// like `GameMode.FRIENDS` and `mode: GameMode` keeps working.
export const GameMode = {
  FRIENDS: "friends",
  EVENT: "event",
  STREAMER: "streamer",
} as const satisfies Record<string, GameModeType>

export type GameMode = GameModeType

export const GamePhase = {
  LOBBY: "LOBBY",
  GUESSING: "GUESSING",
  REVEAL: "REVEAL",
  FINISHED: "FINISHED",
} as const satisfies Record<string, GamePhaseType>

export type GamePhase = GamePhaseType

// Legacy alias used by streamerOrchestrator.
export type RoomState = GameState
