import { describe, expect, it } from "vitest"
import { buildLeaderboardRows, type ChallengeSummary, type LeaderboardEntry } from "./challengeLeaderboard"

const challenge: ChallengeSummary = {
  code: "K7Q2M9XA",
  creatorName: "Tym",
  creatorScore: 30,
  creatorCorrect: 3,
  creatorTotal: 5,
  creatorBestStreak: 2,
}

function attempt(playerName: string, score: number, completedAt: string): LeaderboardEntry {
  return { playerName, score, correct: 1, total: 5, bestStreak: 1, completedAt }
}

describe("buildLeaderboardRows", () => {
  it("classe tout le monde par score, createur compris", () => {
    const rows = buildLeaderboardRows(challenge, [attempt("Lea", 10, "2026-10-05T10:00:00Z"), attempt("Max", 45, "2026-10-05T11:00:00Z")], "")
    expect(rows.map(r => r.playerName)).toEqual(["Max", "Tym", "Lea"])
    expect(rows.map(r => r.isCreator)).toEqual([false, true, false])
  })

  it("a egalite, le createur reste devant (il a joue en premier)", () => {
    const rows = buildLeaderboardRows(challenge, [attempt("Lea", 30, "2026-10-05T10:00:00Z")], "Lea")
    expect(rows.map(r => r.playerName)).toEqual(["Tym", "Lea"])
  })

  it("marque le joueur qui vient de jouer", () => {
    const rows = buildLeaderboardRows(challenge, [attempt("Lea", 10, "2026-10-05T10:00:00Z")], "Lea")
    expect(rows.find(r => r.playerName === "Lea")?.isCurrent).toBe(true)
    expect(rows.find(r => r.isCreator)?.isCurrent).toBe(false)
  })

  it("meme nom deja au classement : seule la partie la plus recente est la sienne", () => {
    const rows = buildLeaderboardRows(
      challenge,
      [attempt("Lea", 40, "2026-10-04T09:00:00Z"), attempt("Lea", 10, "2026-10-05T10:00:00Z")],
      "Lea"
    )
    expect(rows.filter(r => r.isCurrent)).toEqual([expect.objectContaining({ score: 10 })])
  })

  it("personne n'est marque sans nom de joueur", () => {
    const rows = buildLeaderboardRows(challenge, [attempt("", 10, "2026-10-05T10:00:00Z")], "")
    expect(rows.some(r => r.isCurrent)).toBe(false)
  })

  it("ne modifie pas la liste recue", () => {
    const attempts = [attempt("Lea", 10, "2026-10-05T10:00:00Z"), attempt("Max", 45, "2026-10-05T11:00:00Z")]
    const copy = structuredClone(attempts)
    buildLeaderboardRows(challenge, attempts, "Lea")
    expect(attempts).toEqual(copy)
  })
})
