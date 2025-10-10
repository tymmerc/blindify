export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt?: Date
}

export interface UserStats {
  total_games: number
  best_score: number
  hard_mode_wins?: number
  best_streak: number
  success_rate: number
  played_at_night?: boolean
}

export const BADGES: Badge[] = [
  {
    id: "first_win",
    name: "Première victoire",
    description: "Termine ta première partie",
    icon: "🎵",
    unlocked: false,
  },
  {
    id: "perfect_score",
    name: "Score parfait",
    description: "Obtiens 20/20 dans une partie",
    icon: "⭐",
    unlocked: false,
  },
  {
    id: "speed_demon",
    name: "Démon de vitesse",
    description: "Gagne une partie en mode difficile",
    icon: "⚡",
    unlocked: false,
  },
  {
    id: "ten_games",
    name: "Joueur régulier",
    description: "Joue 10 parties",
    icon: "🎮",
    unlocked: false,
  },
  {
    id: "fifty_games",
    name: "Vétéran",
    description: "Joue 50 parties",
    icon: "🏆",
    unlocked: false,
  },
  {
    id: "streak_five",
    name: "En feu",
    description: "Réponds correctement à 5 questions d&apos;affilée",
    icon: "🔥",
    unlocked: false,
  },
  {
    id: "music_master",
    name: "Maître de la musique",
    description: "Obtiens un taux de réussite de 80% sur 20 parties",
    icon: "🎼",
    unlocked: false,
  },
  {
    id: "night_owl",
    name: "Oiseau de nuit",
    description: "Joue une partie après minuit",
    icon: "🦉",
    unlocked: false,
  },
]

export function checkBadgeUnlock(badgeId: string, stats: UserStats): boolean {
  switch (badgeId) {
    case "first_win":
      return stats.total_games >= 1
    case "perfect_score":
      return stats.best_score === 20
    case "speed_demon":
      return (stats.hard_mode_wins ?? 0) >= 1
    case "ten_games":
      return stats.total_games >= 10
    case "fifty_games":
      return stats.total_games >= 50
    case "streak_five":
      return stats.best_streak >= 5
    case "music_master":
      return stats.total_games >= 20 && stats.success_rate >= 0.8
    case "night_owl":
      return stats.played_at_night === true
    default:
      return false
  }
}
