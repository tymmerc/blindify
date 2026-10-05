import { afterEach, describe, expect, it, vi } from "vitest"
import { buildShareText } from "./shareText"

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
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // jsdom tourne sur http://localhost:3000 : c'est le "site courant" des tests.
  async function siteLabelWith(basePath: string) {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", basePath)
    vi.resetModules()
    return (await import("./publicPath")).siteLabel()
  }

  it("garde le chemin du site sous-dossier (dev.tymmerc.eu/blindify), sans protocole ni barre finale", async () => {
    expect(await siteLabelWith("/blindify")).toBe("localhost:3000/blindify")
    expect(await siteLabelWith("/blindify/")).toBe("localhost:3000/blindify")
  })

  it("site servi a la racine (blindz.app) : le domaine seul", async () => {
    expect(await siteLabelWith("")).toBe("localhost:3000")
  })
})
