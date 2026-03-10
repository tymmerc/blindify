import type { GameModeConfig, GameMode } from "@/lib/gameModes"

export enum RoundUiState {
  Idle = "idle",
  Armed = "armed",
  Playing = "playing",
  Locked = "locked",
  Revealed = "revealed",
}

export type RoundFlowState = {
  state: RoundUiState
  startAt: number | null
  deadline: number | null
  lockedAt: number | null
  revealedAt: number | null
}

export type RoundFlowEvent =
  | { type: "RESET" }
  | { type: "ARM"; startAt: number; deadline: number }
  | { type: "START"; at?: number | null }
  | { type: "LOCK"; at: number }
  | { type: "REVEAL"; at: number }

export const ROUND_FEEDBACK_MS = 320

export function roundFlowReducer(state: RoundFlowState, event: RoundFlowEvent): RoundFlowState {
  switch (event.type) {
    case "RESET":
      return {
        state: RoundUiState.Idle,
        startAt: null,
        deadline: null,
        lockedAt: null,
        revealedAt: null,
      }
    case "ARM":
      return {
        state: RoundUiState.Armed,
        startAt: event.startAt,
        deadline: event.deadline,
        lockedAt: null,
        revealedAt: null,
      }
    case "START":
      if (state.state !== RoundUiState.Armed) return state
      return {
        ...state,
        state: RoundUiState.Playing,
        startAt: state.startAt ?? event.at ?? Date.now(),
      }
    case "LOCK":
      if (state.state !== RoundUiState.Playing) return state
      return {
        ...state,
        state: RoundUiState.Locked,
        lockedAt: event.at,
      }
    case "REVEAL":
      if (state.state !== RoundUiState.Locked) return state
      return {
        ...state,
        state: RoundUiState.Revealed,
        revealedAt: event.at,
      }
    default:
      return state
  }
}

export type ScoreInput = {
  matchedTitle: boolean
  matchedArtist: boolean
  guessProvided: boolean
  reactionMs: number | null
  maxDurationMs: number
  streak: number
}

export type ScoreBreakdown = { title: number; artist: number; speed: number; penalty: number }

export function computeScore({ matchedTitle, matchedArtist, guessProvided, reactionMs, maxDurationMs, streak }: ScoreInput): {
  gained: number
  nextStreak: number
  breakdown: ScoreBreakdown
} {
  const correctBoth = matchedTitle && matchedArtist
  const nextStreak = correctBoth ? Math.min(streak + 1, 5) : 0

  const title = matchedTitle ? 40 : 0
  const artist = matchedArtist ? 30 : 0

  let speed = 0
  if ((matchedTitle || matchedArtist) && reactionMs !== null && maxDurationMs > 0) {
    const ratio = 1 - Math.min(Math.max(reactionMs / maxDurationMs, 0), 1)
    speed = Math.round(30 * ratio)
  }

  // Penalty only when a guess was provided but nothing matched
  const penalty = guessProvided && !matchedTitle && !matchedArtist ? 10 : 0

  const gained = Math.max(0, title + artist + speed - penalty)
  return { gained, nextStreak, breakdown: { title, artist, speed, penalty } }
}

export type ModeFlags = {
  isRivalry: boolean
  isReadableAtDistance: boolean
  isParticipationFocused: boolean
  accent: string
}

export function resolveModeFlags(config: GameModeConfig | null | undefined, accent: string): ModeFlags {
  const game = config?.game as { largeUI?: boolean; showLeaderboard?: string; participationOnly?: boolean; scoring?: boolean } | undefined
  return {
    isRivalry: game?.showLeaderboard === "rivals",
    isReadableAtDistance: Boolean(game?.largeUI || game?.showLeaderboard === "top3"),
    isParticipationFocused: Boolean(game?.participationOnly && game?.scoring === false),
    accent,
  }
}

export type RoundTempo = {
  feedbackMs: number
  revealHoldMs: number
  cadence: "snappy" | "steady" | "relaxed"
}

export function resolveRoundTempo(mode: GameMode): RoundTempo {
  switch (mode) {
    case "friends":
      return { feedbackMs: 220, revealHoldMs: 380, cadence: "snappy" }
    case "event":
      return { feedbackMs: 420, revealHoldMs: 650, cadence: "steady" }
    case "streamer":
      return { feedbackMs: 320, revealHoldMs: 520, cadence: "relaxed" }
    default:
      return { feedbackMs: ROUND_FEEDBACK_MS, revealHoldMs: 450, cadence: "steady" }
  }
}
