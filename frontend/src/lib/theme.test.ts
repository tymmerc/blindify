import { describe, expect, it, beforeEach } from "vitest"
import { THEME_HEAD_SCRIPT, changerChoix, choixActuel, lireChoix, resoudreTheme, themeDiscord } from "./theme"

describe("resoudreTheme", () => {
  it("un choix force gagne sur Discord et sur l'appareil", () => {
    expect(resoudreTheme("sombre", "light", false)).toBe("dark")
    expect(resoudreTheme("clair", "dark", true)).toBe("light")
  })
  it("en auto, Discord passe avant le reglage de l'appareil", () => {
    expect(resoudreTheme("auto", "dark", false)).toBe("dark")
    expect(resoudreTheme("auto", "light", true)).toBe("light")
  })
  it("en auto hors Discord, suit l'appareil", () => {
    expect(resoudreTheme("auto", null, true)).toBe("dark")
    expect(resoudreTheme("auto", null, false)).toBe("light")
  })
})

describe("lectures", () => {
  it("un choix inconnu vaut auto", () => {
    expect(lireChoix("noir")).toBe("auto")
    expect(lireChoix(null)).toBe("auto")
    expect(lireChoix("clair")).toBe("clair")
  })
  it("tout theme Discord sauf light est sombre, une valeur bizarre est ignoree", () => {
    expect(themeDiscord("darker")).toBe("dark")
    expect(themeDiscord("midnight")).toBe("dark")
    expect(themeDiscord("light")).toBe("light")
    expect(themeDiscord("<script>")).toBeNull()
    expect(themeDiscord("")).toBeNull()
  })
})

// Le script du <head> refait la meme logique sans import : on le joue dans jsdom.
function jouerScript(search: string, appareilSombre: boolean) {
  window.history.replaceState(null, "", `/${search}`)
  window.matchMedia = ((q: string) => ({ matches: appareilSombre && q.includes("dark") })) as unknown as typeof window.matchMedia
  new Function(THEME_HEAD_SCRIPT)()
  return document.documentElement.getAttribute("data-theme")
}

describe("THEME_HEAD_SCRIPT", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    document.documentElement.removeAttribute("data-theme")
  })
  it("suit l'appareil sans choix", () => {
    expect(jouerScript("", true)).toBe("dark")
    expect(jouerScript("", false)).toBe("light")
  })
  it("suit Discord et s'en souvient sur une page sans parametre", () => {
    expect(jouerScript("?theme=darker&frame_id=f", false)).toBe("dark")
    expect(jouerScript("", false)).toBe("dark")
  })
  it("suit Discord meme si le stockage de session est bloque", () => {
    const orig = Object.getOwnPropertyDescriptor(window, "sessionStorage")!
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => { throw new Error("bloque") } })
    try {
      expect(jouerScript("?theme=dark&frame_id=f", false)).toBe("dark")
    } finally {
      Object.defineProperty(window, "sessionStorage", orig)
    }
  })
  it("le choix garde gagne, et changerChoix l'ecrit", () => {
    changerChoix("clair")
    expect(jouerScript("?theme=dark", true)).toBe("light")
    changerChoix("auto")
    expect(localStorage.getItem("blindz-theme")).toBeNull()
  })
})

describe("changerChoix sans stockage", () => {
  it("le choix vaut pour la page meme si localStorage est bloque", () => {
    const orig = Object.getOwnPropertyDescriptor(window, "localStorage")!
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("bloque") } })
    try {
      window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia
      expect(changerChoix("sombre")).toBe("dark")
      expect(choixActuel()).toBe("sombre")
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    } finally {
      Object.defineProperty(window, "localStorage", orig)
      changerChoix("auto")
    }
  })
})
