import { describe, expect, it } from "vitest"
import { arrivalNotice, isLateJoiner, lateJoinBanner } from "./lateJoin"
import type { MultiplayerGameState } from "./types"

const base: MultiplayerGameState = {
  roomCode: "ABC123",
  hostUserId: 1,
  hostPlays: false,
  mode: "friends",
  phase: "GUESSING",
  currentRound: 2,
  totalRounds: 5,
  currentTrack: null,
  players: {
    1: { userId: 1, username: "Hote", score: 3, accuracy: 0, rounds: 1, correct: 1, streak: 1, bestStreak: 1, hasAnswered: false, isReady: false },
  },
  timing: { startAt: null, revealAt: null },
  config: { autoAdvance: false, roundDurationMs: 20_000 },
}

describe("isLateJoiner", () => {
  it("vrai pendant une manche ou un reveal, tant qu'il n'est pas dans les joueurs", () => {
    expect(isLateJoiner(base, 9)).toBe(true)
    expect(isLateJoiner({ ...base, phase: "REVEAL" }, 9)).toBe(true)
  })

  it("faux des qu'il est joueur : la vue de jeu prend la place", () => {
    expect(isLateJoiner(base, 1)).toBe(false)
  })

  it("faux hors manche (lobby, fin de partie) et sans etat", () => {
    expect(isLateJoiner({ ...base, phase: "FINISHED" }, 9)).toBe(false)
    expect(isLateJoiner({ ...base, phase: "LOBBY" }, 9)).toBe(false)
    expect(isLateJoiner(null, 9)).toBe(false)
    expect(isLateJoiner(base, null)).toBe(false)
  })

  it("jamais pour l'hote qui presente autour d'une table", () => {
    const event = { ...base, mode: "event" as const, hostUserId: 4, players: {} }
    expect(isLateJoiner(event, 4)).toBe(false)
    expect(isLateJoiner({ ...event, hostPlays: true }, 4)).toBe(true)
  })
})

describe("textes", () => {
  it("le bandeau dit quand il joue", () => {
    expect(lateJoinBanner(base).title).toBe("Partie en cours : tu joues dès la prochaine manche")
    expect(lateJoinBanner({ currentRound: 5, totalRounds: 5 }).title).toBe("Dernière manche en cours : tu joues la prochaine partie")
  })

  it("les autres le voient arriver, jamais de tiret cadratin", () => {
    expect(arrivalNotice("Zoe", base)).toBe("Zoe arrive et joue dès la prochaine manche.")
    expect(arrivalNotice("  ", null)).toBe("Quelqu'un arrive et joue dès la prochaine manche.")
    expect(arrivalNotice("Zoe", { currentRound: 5, totalRounds: 5 })).toBe("Zoe arrive et jouera la prochaine partie.")
    const all = [arrivalNotice("Zoe", base), lateJoinBanner(base).title, lateJoinBanner(base).body].join(" ")
    expect(all).not.toContain("\u2014")
  })
})
