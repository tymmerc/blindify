// Ecran « Mon compte » : ce qu'on montre d'un joueur, et seulement du vrai.
// Inventaire du 05/11/2026 : badges ecrits a la main, niveau et XP inventes,
// « Multi » toujours a 0, score solo jamais enregistre par partie. Tout ce qui
// n'est pas sur en base est sorti d'ici.

import type { GameHistoryEntry } from "./types"
import { cleanPlayerName } from "./soloSetup"

/** Noms des modes, les memes que sur la page des modes. */
const MODE_LABELS: Record<string, string> = {
  solo: "Solo",
  friends: "À distance",
  event: "Autour d'une table",
  streamer: "En live",
}

export function modeLabel(mode: string | null | undefined): string {
  return (mode && MODE_LABELS[mode]) || "Partie"
}

/** « 5 nov., 21:40 » */
export function formatGameDate(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

/**
 * Ligne de resultat d'une partie. En solo, le serveur ne garde pas les bonnes
 * reponses partie par partie (elles valaient toujours 0 a l'ecran) : on dit
 * seulement le nombre de morceaux.
 */
export function gameResultLine(game: Pick<GameHistoryEntry, "mode" | "state" | "totalRounds" | "correct">): string {
  if (game.state === "in_progress") return "En cours"
  const morceaux = plural(game.totalRounds, "morceau", "morceaux")
  if (game.mode === "solo") return morceaux
  return `${game.correct} sur ${morceaux}`
}

type StatsInput = { totalGames?: number; accuracyRate?: number; bestStreak?: number } | null | undefined

/** « 12 parties · 64 % de bonnes réponses · meilleure série : 5 », ou null tant qu'il n'y a rien. */
export function statsLine(stats: StatsInput): string | null {
  const total = stats?.totalGames ?? 0
  if (total <= 0) return null
  const parts = [plural(total, "partie", "parties")]
  const accuracy = Math.round(stats?.accuracyRate ?? 0)
  parts.push(`${accuracy} % de bonnes réponses`)
  const streak = stats?.bestStreak ?? 0
  if (streak > 1) parts.push(`meilleure série : ${streak}`)
  return parts.join(" · ")
}

/** Nom auto d'un invite arrive sans pseudo (« Guest-ab12cd ») : jamais affiche. */
export function isGeneratedName(name: string | null | undefined): boolean {
  return /^guest[-_]/i.test((name ?? "").trim())
}

/** Pseudo de depart du champ : celui garde sur ce navigateur, sinon le nom du compte s'il a ete choisi. */
export function initialPseudo(stored: string, username: string | null | undefined): string {
  if (stored.trim()) return stored.trim()
  if (username && !isGeneratedName(username)) return username.trim()
  return ""
}

export const PSEUDO_MIN = 2

/** Pseudo nettoye (espaces, 24 caracteres), ou null s'il est trop court (meme borne que le serveur). */
export function validPseudo(raw: string): string | null {
  const clean = cleanPlayerName(raw)
  return clean.length >= PSEUDO_MIN ? clean : null
}
