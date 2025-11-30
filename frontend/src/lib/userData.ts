import { api } from "./api"
import type { GameSessionSummary, UserStats } from "./types"

let cachedStats: UserStats | null = null
let cachedHistory: GameSessionSummary[] | null = null
let pending: Promise<{ stats: UserStats | null; history: GameSessionSummary[] }> | null = null

export async function fetchUserDashboard(): Promise<{ stats: UserStats | null; history: GameSessionSummary[] }> {
  if (cachedStats && cachedHistory) {
    return { stats: cachedStats, history: cachedHistory }
  }
  if (pending) return pending

  pending = (async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([api.detailedStats(), api.gameHistory()])
      cachedStats = statsRes?.stats ?? null
      cachedHistory = historyRes?.sessions ?? []
      return { stats: cachedStats, history: cachedHistory }
    } finally {
      pending = null
    }
  })()

  return pending
}

export function clearUserDashboardCache() {
  cachedStats = null
  cachedHistory = null
}
