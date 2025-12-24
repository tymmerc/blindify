import type { GameModeConfig } from "@/lib/gameModes"

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
  correct: boolean
  reactionMs: number | null
  maxDurationMs: number
  streak: number
}

export type ScoreBreakdown = { base: number; speed: number; streakBonus: number }

export function computeScore({ correct, reactionMs, maxDurationMs, streak }: ScoreInput): {
  gained: number
  nextStreak: number
  breakdown: ScoreBreakdown
} {
  const nextStreak = correct ? Math.min(streak + 1, 5) : 0
  const base = correct ? 100 : 0
  let speed = 0
  if (correct && reactionMs !== null && maxDurationMs > 0) {
    const ratio = 1 - Math.min(Math.max(reactionMs / maxDurationMs, 0), 1)
    speed = Math.round(50 * ratio)
  }
  const streakBonus = correct ? nextStreak * 10 : 0
  const gained = base + speed + streakBonus
  return { gained, nextStreak, breakdown: { base, speed, streakBonus } }
}

export type ModeFlags = {
  isRivalry: boolean
  isReadableAtDistance: boolean
  isParticipationFocused: boolean
  accent: string
}

export function resolveModeFlags(config: GameModeConfig | null | undefined, accent: string): ModeFlags {
  return {
    isRivalry: config?.game.showLeaderboard === "rivals",
    isReadableAtDistance: Boolean(config?.game.largeUI || config?.game.showLeaderboard === "top3"),
    isParticipationFocused: Boolean(config?.game.participationOnly && config?.game.scoring === false),
    accent,
  }
}
