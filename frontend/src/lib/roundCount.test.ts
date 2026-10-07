import { describe, expect, it } from "vitest"
import { shortGameNotice } from "./roundCount"

const LIBRARY = "16 manches au lieu de 20 : pas assez de titres jouables dans vos playlists"

describe("shortGameNotice", () => {
  it("dit combien de manches au lieu de combien, pendant la 1re manche", () => {
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, phase: "GUESSING" })).toEqual({
      text: LIBRARY,
      visible: true,
    })
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 0, phase: "LOBBY" })?.visible).toBe(true)
  })

  it("cite Deezer, pas les playlists, quand ce sont les recherches d'extraits qui ont manque", () => {
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, shortReason: "lookup" })?.text).toBe(
      "16 manches au lieu de 20 : Deezer n'a pas répondu à temps pour certains titres"
    )
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, shortReason: "library" })?.text).toBe(LIBRARY)
  })

  it("se tait quand la partie a la longueur demandee", () => {
    expect(shortGameNotice({ totalRounds: 20, requestedRounds: 20, currentRound: 1 })).toBeNull()
  })

  it("se tait avec un ancien backend qui n'envoie pas requestedRounds", () => {
    expect(shortGameNotice({ totalRounds: 16, currentRound: 1 })).toBeNull()
    expect(shortGameNotice(null)).toBeNull()
  })

  it("apres la 1re manche, s'efface sans liberer sa place (la grille ne saute pas)", () => {
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 2 })).toEqual({ text: LIBRARY, visible: false })
  })

  it("disparait a la fin", () => {
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, phase: "FINISHED" })).toBeNull()
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, phase: "GAME_OVER" })).toBeNull()
  })

  it("accorde au singulier", () => {
    expect(shortGameNotice({ totalRounds: 1, requestedRounds: 10, currentRound: 1 })?.text).toBe(
      "1 manche au lieu de 10 : pas assez de titres jouables dans vos playlists"
    )
  })
})
