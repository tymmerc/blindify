import { describe, expect, it } from "vitest"
import { shortGameNotice } from "./roundCount"

describe("shortGameNotice", () => {
  it("dit combien de manches au lieu de combien, pendant la 1re manche", () => {
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, phase: "GUESSING" })).toBe(
      "16 manches au lieu de 20 : pas assez de titres jouables dans vos playlists"
    )
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 0, phase: "LOBBY" })).not.toBeNull()
  })

  it("se tait quand la partie a la longueur demandee", () => {
    expect(shortGameNotice({ totalRounds: 20, requestedRounds: 20, currentRound: 1 })).toBeNull()
  })

  it("se tait avec un ancien backend qui n'envoie pas requestedRounds", () => {
    expect(shortGameNotice({ totalRounds: 16, currentRound: 1 })).toBeNull()
    expect(shortGameNotice(null)).toBeNull()
  })

  it("disparait apres la 1re manche et a la fin", () => {
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 2 })).toBeNull()
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, phase: "FINISHED" })).toBeNull()
    expect(shortGameNotice({ totalRounds: 16, requestedRounds: 20, currentRound: 1, phase: "GAME_OVER" })).toBeNull()
  })

  it("accorde au singulier", () => {
    expect(shortGameNotice({ totalRounds: 1, requestedRounds: 10, currentRound: 1 })).toBe(
      "1 manche au lieu de 10 : pas assez de titres jouables dans vos playlists"
    )
  })
})
