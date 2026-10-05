import { describe, expect, it } from "vitest"
import { buildShareText } from "./shareText"
import { siteLabel } from "./publicPath"

const stats = { rounds: 5, correct: 3, bestStreak: 2, points: 12 }

describe("buildShareText", () => {
  it("donne le score, la serie et une case par manche jouee", () => {
    const text = buildShareText(stats, ["correct", "close", "wrong", "correct", "correct"], "blindz.app")
    expect(text).toContain("12 pts")
    expect(text).toContain("3/5")
    expect(text).toContain("Série max : 2")
    expect(text).toContain("\u{1F7E9}\u{1F7E8}\u{1F7E5}\u{1F7E9}\u{1F7E9}")
  })

  it("renvoie vers le site ou l'on joue, jamais un domaine ecrit en dur", () => {
    const text = buildShareText(stats, [], "blindz.app")
    expect(text.split("\n").at(-1)).toBe("blindz.app")
    expect(text).not.toContain("tymmerc.eu")
  })

  it("n'utilise jamais de tiret cadratin", () => {
    expect(buildShareText(stats, [], "blindz.app")).not.toContain(String.fromCharCode(0x2014))
  })
})

describe("siteLabel", () => {
  it("donne l'adresse courante sans protocole ni barre finale", () => {
    expect(siteLabel()).toBe(`${window.location.host}${process.env.NEXT_PUBLIC_BASE_PATH ?? "/blindify"}`.replace(/\/+$/, ""))
    expect(siteLabel()).not.toMatch(/^https?:|\/$/)
  })
})
