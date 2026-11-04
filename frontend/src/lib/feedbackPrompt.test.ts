import { beforeEach, describe, expect, it } from "vitest"
import { claimGameEnd, GAMES_KEY, PROMPT_SHOWN_KEY, recordGameEnd, resetPromptMemory, SAME_GAME_WINDOW_MS } from "./feedbackPrompt"

/** Stockage qui refuse tout, comme une navigation privee stricte. */
const brokenStore = {
  getItem: () => {
    throw new Error("SecurityError")
  },
  setItem: () => {
    throw new Error("QuotaExceededError")
  },
}

describe("recordGameEnd", () => {
  beforeEach(() => {
    localStorage.removeItem(PROMPT_SHOWN_KEY)
    localStorage.removeItem(GAMES_KEY)
    resetPromptMemory()
  })

  it("montre le message a la fin de la 2e partie, une seule fois par appareil", () => {
    expect(recordGameEnd()).toBe(false)
    expect(recordGameEnd()).toBe(true)
    expect(recordGameEnd()).toBe(false)
    expect(recordGameEnd()).toBe(false)
    expect(localStorage.getItem(GAMES_KEY)).toBe("4")
    expect(localStorage.getItem(PROMPT_SHOWN_KEY)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("se souvient d'une visite a l'autre (compte deja dans le stockage)", () => {
    localStorage.setItem(GAMES_KEY, "1")
    expect(recordGameEnd()).toBe(true)
  })

  it("ne remontre jamais le message une fois montre, meme si le compte repart", () => {
    localStorage.setItem(PROMPT_SHOWN_KEY, "2026-11-01")
    localStorage.setItem(GAMES_KEY, "1")
    expect(recordGameEnd()).toBe(false)
  })

  it("prend un compte illisible pour zero", () => {
    localStorage.setItem(GAMES_KEY, "n'importe quoi")
    expect(recordGameEnd()).toBe(false)
    expect(recordGameEnd()).toBe(true)
  })

  it("sans stockage, compte en memoire : 2e partie de la session, une seule fois", () => {
    expect(recordGameEnd(null)).toBe(false)
    expect(recordGameEnd(null)).toBe(true)
    expect(recordGameEnd(null)).toBe(false)
  })

  it("un stockage qui leve passe au compte en memoire sans planter", () => {
    expect(recordGameEnd(brokenStore)).toBe(false)
    expect(recordGameEnd(brokenStore)).toBe(true)
    expect(recordGameEnd(brokenStore)).toBe(false)
  })
})

describe("claimGameEnd", () => {
  beforeEach(() => {
    localStorage.removeItem(PROMPT_SHOWN_KEY)
    localStorage.removeItem(GAMES_KEY)
    resetPromptMemory()
  })

  it("un solo identifie ne compte qu'une fois, meme remonte bien plus tard", () => {
    expect(claimGameEnd({ mode: "solo", sessionId: 5 }, 0)).toBe(false)
    expect(claimGameEnd({ mode: "solo", sessionId: 5 }, 10 * 60_000)).toBe(false)
    expect(localStorage.getItem(GAMES_KEY)).toBe("1")
    expect(claimGameEnd({ mode: "solo", sessionId: 6 }, 11 * 60_000)).toBe(true)
    expect(claimGameEnd({ mode: "solo", sessionId: 6 }, 12 * 60_000)).toBe(true)
  })

  it("sans identifiant unique, meme cle dans la fenetre = meme partie, au-dela = partie suivante", () => {
    expect(claimGameEnd({ mode: "buzzer" }, 0)).toBe(false)
    expect(claimGameEnd({ mode: "buzzer" }, SAME_GAME_WINDOW_MS - 1)).toBe(false)
    expect(localStorage.getItem(GAMES_KEY)).toBe("1")
    expect(claimGameEnd({ mode: "buzzer" }, 2 * SAME_GAME_WINDOW_MS + 5)).toBe(true)
  })
})
