import { describe, expect, it } from "vitest"
import { PLAY_SITUATIONS, createRoute, parsePreferredMode, situationFor } from "./playSituations"

describe("playSituations : choisir le mode par la situation", () => {
  it("commence par la soiree, et garde le nom de chaque mode en etiquette", () => {
    expect(PLAY_SITUATIONS.map(s => s.key)).toEqual(["event", "friends", "streamer", "solo"])
    // tools/soiree.mjs, party-4-joueurs.mjs... cliquent sur ces noms exacts.
    expect(situationFor("event").modeName).toBe("Autour d'une table")
    expect(situationFor("friends").modeName).toBe("À distance")
    // Titre court (Tym, 05/11) : la tele et l'enceinte sont dans la phrase dessous.
    expect(situationFor("event").title).toBe("À une soirée")
    expect(situationFor("event").subtitle).toMatch(/télé ou une enceinte/)
  })

  it("la carte de la soiree ne contient pas « distance » (getByText('À distance').first())", () => {
    const event = situationFor("event")
    expect(`${event.title} ${event.subtitle}`.toLowerCase()).not.toContain("distance")
  })

  it("lit le mode demande par une page guide, et rien d'autre", () => {
    expect(parsePreferredMode("event")).toBe("event")
    expect(parsePreferredMode(" Friends ")).toBe("friends")
    expect(parsePreferredMode("solo")).toBeNull()
    expect(parsePreferredMode("<script>")).toBeNull()
    expect(parsePreferredMode(null)).toBeNull()
  })

  it("« Creer une partie » va tout droit au mode deja choisi", () => {
    expect(createRoute(null, "Lea")).toBe("/modes")
    expect(createRoute("event", "Léa B")).toBe("/multiplayer?mode=event&intent=host&nickname=L%C3%A9a%20B")
    expect(createRoute("friends", "  ")).toBe("/multiplayer?mode=friends&intent=host")
  })
})
