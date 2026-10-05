import { afterEach, describe, expect, it } from "vitest"
import {
  NICKNAME_KEY,
  buildChallengeShareText,
  buildSoloGamePath,
  cleanPlayerName,
  extractChallengeCode,
  isChallengeCode,
  normalizeChallengeCode,
  parseSoloTab,
  rememberNicknameIfNone,
  searchWithTab,
  tabForKey,
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

describe("extractChallengeCode", () => {
  it("prend le code dans le lien recu, pas tout le lien", () => {
    expect(extractChallengeCode("https://blindz.app/challenge/?code=K7Q2M9XA")).toBe("K7Q2M9XA")
    expect(extractChallengeCode("Viens ! https://dev.tymmerc.eu/blindify/challenge/?code=k7q2m9xa&utm=x")).toBe("K7Q2M9XA")
  })

  it("garde le code tape a la main", () => {
    expect(extractChallengeCode(" k7q2-m9xa ")).toBe("K7Q2M9XA")
  })

  it("rend une chaine vide pour un lien sans code", () => {
    expect(extractChallengeCode("https://blindz.app/challenge/?code=")).toBe("")
  })
})

describe("rememberNicknameIfNone", () => {
  afterEach(() => localStorage.clear())

  it("retient le nom quand aucun pseudo n'est connu", () => {
    rememberNicknameIfNone("Rival")
    expect(localStorage.getItem(NICKNAME_KEY)).toBe("Rival")
  })

  it("n'ecrase jamais le pseudo deja connu", () => {
    localStorage.setItem(NICKNAME_KEY, "Tym")
    rememberNicknameIfNone("Nom du jour")
    expect(localStorage.getItem(NICKNAME_KEY)).toBe("Tym")
  })

  it("ne retient ni un nom vide ni le nom par defaut", () => {
    rememberNicknameIfNone("")
    rememberNicknameIfNone("Joueur")
    expect(localStorage.getItem(NICKNAME_KEY)).toBeNull()
  })
})

describe("tabForKey", () => {
  it("passe a l'onglet voisin avec les fleches, en boucle", () => {
    expect(tabForKey("classic", "ArrowRight")).toBe("chrono")
    expect(tabForKey("challenge", "ArrowRight")).toBe("classic")
    expect(tabForKey("classic", "ArrowLeft")).toBe("challenge")
  })

  it("va au premier ou au dernier onglet avec Debut et Fin", () => {
    expect(tabForKey("chrono", "Home")).toBe("classic")
    expect(tabForKey("chrono", "End")).toBe("challenge")
  })

  it("ignore les autres touches", () => {
    expect(tabForKey("chrono", "Enter")).toBeNull()
    expect(tabForKey("chrono", "ArrowDown")).toBeNull()
  })
})

describe("searchWithTab", () => {
  it("ecrit l'onglet dans l'adresse et garde les autres parametres", () => {
    expect(searchWithTab("", "challenge")).toBe("?tab=challenge")
    expect(searchWithTab("?utm=x&tab=chrono", "challenge")).toBe("?utm=x&tab=challenge")
  })

  it("retire ?tab= pour le classique, l'onglet par defaut", () => {
    expect(searchWithTab("?tab=chrono", "classic")).toBe("")
    expect(searchWithTab("?utm=x&tab=chrono", "classic")).toBe("?utm=x")
  })
})
