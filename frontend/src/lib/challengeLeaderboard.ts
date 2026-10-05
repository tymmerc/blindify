// Classement d'un defi : le createur et ceux qui l'ont releve, du meilleur
// score au moins bon. Logique pure, testee dans challengeLeaderboard.test.ts.

export interface LeaderboardEntry {
  playerName: string
  score: number
  correct: number
  total: number
  bestStreak: number
  completedAt: string
}

export interface ChallengeSummary {
  code: string
  creatorName: string
  creatorScore: number
  creatorCorrect: number
  creatorTotal: number
  creatorBestStreak: number
}

export interface LeaderboardRow {
  playerName: string
  score: number
  correct: number
  total: number
  bestStreak: number
  isCreator: boolean
  /** La partie qu'on vient de jouer (une seule ligne, meme si le nom revient). */
  isCurrent: boolean
}

/** Indice de la partie la plus recente jouee sous ce nom, -1 si aucune. */
function latestAttemptOf(attempts: LeaderboardEntry[], name: string): number {
  if (!name) return -1
  return attempts.reduce((best, entry, i) => {
    if (entry.playerName !== name) return best
    if (best === -1) return i
    // A date egale (ou illisible), la derniere de la liste l'emporte.
    return Date.parse(entry.completedAt) < Date.parse(attempts[best].completedAt) ? best : i
  }, -1)
}

/**
 * Lignes du classement. Tri stable : a score egal le createur reste devant
 * (il a joue en premier), comme le serveur (score DESC, completed_at ASC).
 */
export function buildLeaderboardRows(
  challenge: ChallengeSummary,
  attempts: LeaderboardEntry[],
  currentPlayerName: string
): LeaderboardRow[] {
  const current = latestAttemptOf(attempts, currentPlayerName)
  const creator: LeaderboardRow = {
    playerName: challenge.creatorName,
    score: challenge.creatorScore,
    correct: challenge.creatorCorrect,
    total: challenge.creatorTotal,
    bestStreak: challenge.creatorBestStreak,
    isCreator: true,
    isCurrent: false,
  }
  const others = attempts.map((entry, i): LeaderboardRow => ({
    playerName: entry.playerName,
    score: entry.score,
    correct: entry.correct,
    total: entry.total,
    bestStreak: entry.bestStreak,
    isCreator: false,
    isCurrent: i === current,
  }))
  return [creator, ...others].sort((a, b) => b.score - a.score)
}
