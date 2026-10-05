import { describe, expect, it } from "vitest"
import {
  buildChallengeShareText,
  buildSoloGamePath,
  cleanPlayerName,
  isChallengeCode,
  normalizeChallengeCode,
  parseSoloTab,
} from "./soloSetup"

describe("buildSoloGamePath", () => {
  it("encode le lien et garde le nombre de titres", () => {
    expect(buildSoloGamePath({ url: " https://www.deezer.com/fr/playlist/12 ", count: 5 })).toBe(
      "/solo?source=quickplay&quickUrl=https%3A%2F%2Fwww.deezer.com%2Ffr%2Fplaylist%2F12&count=5"
    )
  })

  it("ajoute le mode progressif et le defi seulement quand ils sont demandes", () => {
    const path = buildSoloGamePath({ url: "https://open.spotify.com/user/abc", count: 10, progressive: true, challenge: true })
    expect(path).toContain("&progressive=true")
    expect(path).toContain("&challenge=1")
    expect(buildSoloGamePath({ url: "x", count: 10 })).not.toMatch(/progressive|challenge/)
  })

  it("refuse un lien vide", () => {
    expect(buildSoloGamePath({ url: "   ", count: 10 })).toBeNull()
  })
})

describe("parseSoloTab", () => {
  it("retombe sur le classique pour toute valeur inconnue", () => {
    expect(parseSoloTab(null)).toBe("classic")
    expect(parseSoloTab("")).toBe("classic")
    expect(parseSoloTab("n'importe quoi")).toBe("classic")
  })

  it("reconnait le chrono et le defi", () => {
    expect(parseSoloTab("chrono")).toBe("chrono")
    expect(parseSoloTab("challenge")).toBe("challenge")
  })
})

describe("cleanPlayerName", () => {
  it("enleve les espaces en trop et coupe a 24 caracteres", () => {
    expect(cleanPlayerName("  Tym   le   boss ")).toBe("Tym le boss")
    expect(cleanPlayerName("x".repeat(40))).toHaveLength(24)
  })

  it("rend une chaine vide si rien n'est saisi", () => {
    expect(cleanPlayerName("   ")).toBe("")
  })
})

describe("codes de defi", () => {
  it("met en majuscules et retire tout ce qui n'est pas lettre ou chiffre", () => {
    expect(normalizeChallengeCode(" ab12-cd 34 ")).toBe("AB12CD34")
  })

  it("accepte de 4 a 12 caracteres, comme le serveur", () => {
    expect(isChallengeCode("AB1")).toBe(false)
    expect(isChallengeCode("AB12")).toBe(true)
    expect(isChallengeCode("AB12CD34")).toBe(true)
    expect(isChallengeCode("A".repeat(13))).toBe(false)
  })
})

describe("buildChallengeShareText", () => {
  it("dit qui defie, sur combien de morceaux et le score a battre", () => {
    expect(buildChallengeShareText({ name: "Tym", points: 1240, tracks: 5 })).toBe(
      "Tym te défie sur Blindz : 5 morceaux, 1240 pts à battre."
    )
  })

  it("accorde au singulier", () => {
    expect(buildChallengeShareText({ name: "Tym", points: 1, tracks: 1 })).toBe(
      "Tym te défie sur Blindz : 1 morceau, 1 pt à battre."
    )
  })
})
