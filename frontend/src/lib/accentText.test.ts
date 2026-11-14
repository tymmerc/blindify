import { describe, expect, it } from "vitest"
import { accentTexte } from "./accentText"

describe("accentTexte", () => {
  it("donne la variante texte des accents de la palette", () => {
    expect(accentTexte("#c65133")).toBe("rgb(var(--c-terra-txt))")
    expect(accentTexte("#E0A32E")).toBe("rgb(var(--c-gold-deep-txt))")
  })
  it("laisse passer une couleur inconnue", () => {
    expect(accentTexte("#123456")).toBe("#123456")
  })
})
