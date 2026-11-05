import { describe, expect, it } from "vitest"
import { showOwnerQuestion } from "./ownerQuestion"

describe("showOwnerQuestion", () => {
  it("suit le serveur quand il le dit", () => {
    expect(showOwnerQuestion({ ownerQuestion: false, playerCount: 5 })).toBe(false)
    expect(showOwnerQuestion({ ownerQuestion: true, playerCount: 3 })).toBe(true)
  })

  it("sans le drapeau (ancien serveur) : seulement a 3 joueurs ou plus", () => {
    expect(showOwnerQuestion({ playerCount: 2 })).toBe(false)
    expect(showOwnerQuestion({ playerCount: 3 })).toBe(true)
  })

  it("jamais quand une seule personne a ramene la musique", () => {
    expect(showOwnerQuestion({ ownerQuestion: true, singleContributor: true, playerCount: 6 })).toBe(false)
  })
})
