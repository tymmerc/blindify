import { describe, expect, it } from "vitest"
import { gameResultLine, initialPseudo, isGeneratedName, modeLabel, statsLine, validPseudo } from "./accountView"

describe("modeLabel", () => {
  it("donne les noms de la page des modes, jamais « Multi »", () => {
    expect(modeLabel("friends")).toBe("À distance")
    expect(modeLabel("event")).toBe("Autour d'une table")
    expect(modeLabel("streamer")).toBe("En live")
    expect(modeLabel("solo")).toBe("Solo")
    expect(modeLabel("inconnu")).toBe("Partie")
    expect(modeLabel(null)).toBe("Partie")
  })
})

describe("gameResultLine", () => {
  it("en solo, ne montre pas un faux 0 : seulement le nombre de morceaux", () => {
    expect(gameResultLine({ mode: "solo", state: "finished", totalRounds: 10, correct: 0 })).toBe("10 morceaux")
  })
  it("a plusieurs, donne les bonnes réponses sur le nombre de morceaux", () => {
    expect(gameResultLine({ mode: "friends", state: "finished", totalRounds: 12, correct: 7 })).toBe("7 sur 12 morceaux")
    expect(gameResultLine({ mode: "event", state: "finished", totalRounds: 1, correct: 1 })).toBe("1 sur 1 morceau")
  })
  it("dit « En cours » pour une partie pas finie", () => {
    expect(gameResultLine({ mode: "friends", state: "in_progress", totalRounds: 12, correct: 3 })).toBe("En cours")
  })
})

describe("statsLine", () => {
  it("ne dit rien tant qu'il n'y a aucune partie", () => {
    expect(statsLine(null)).toBeNull()
    expect(statsLine({ totalGames: 0, accuracyRate: 0, bestStreak: 0 })).toBeNull()
  })
  it("garde les trois chiffres justes, arrondis", () => {
    expect(statsLine({ totalGames: 12, accuracyRate: 63.6, bestStreak: 5 })).toBe("12 parties · 64 % de bonnes réponses · meilleure série : 5")
  })
  it("tait une série de 1 et accorde « partie »", () => {
    expect(statsLine({ totalGames: 1, accuracyRate: 50, bestStreak: 1 })).toBe("1 partie · 50 % de bonnes réponses")
  })
})

describe("pseudo", () => {
  it("reconnaît le nom automatique d'un invité", () => {
    expect(isGeneratedName("Guest-ab12cd")).toBe(true)
    expect(isGeneratedName("Léa")).toBe(false)
  })
  it("part du pseudo gardé, sinon du nom choisi, jamais du nom automatique", () => {
    expect(initialPseudo("Tym", "Guest-ab12cd")).toBe("Tym")
    expect(initialPseudo("", "Léa")).toBe("Léa")
    expect(initialPseudo("", "Guest-ab12cd")).toBe("")
    expect(initialPseudo("  ", null)).toBe("")
  })
  it("refuse un pseudo trop court et nettoie les espaces", () => {
    expect(validPseudo(" a ")).toBeNull()
    expect(validPseudo("  Le   roi  du  blind ")).toBe("Le roi du blind")
    expect(validPseudo("x".repeat(40))).toHaveLength(24)
  })
})
