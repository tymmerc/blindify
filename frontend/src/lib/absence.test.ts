import { describe, expect, it } from "vitest"
import { idlePauseText, isAbsentee } from "./absence"

describe("isAbsentee", () => {
  it("vrai seulement pour un absent laisse de cote au lancement", () => {
    const state = { absentees: [{ userId: 3, username: "P3" }] }
    expect(isAbsentee(state, 3)).toBe(true)
    expect(isAbsentee(state, 2)).toBe(false)
    expect(isAbsentee({}, 3)).toBe(false)
    expect(isAbsentee(null, 3)).toBe(false)
  })
})

describe("idlePauseText", () => {
  const now = 1_000_000

  it("rien pour une pause de l'hote", () => {
    expect(idlePauseText(null, now)).toBeNull()
    expect(idlePauseText(undefined, now)).toBeNull()
  })

  it("dit pourquoi et dans combien de minutes, arrondi au-dessus", () => {
    expect(idlePauseText({ reason: "empty", stopAt: now + 120_000 }, now)).toBe(
      "Plus aucun joueur n'est connecté. La partie s'arrête dans 2 min si personne ne revient.",
    )
    expect(idlePauseText({ reason: "silent", stopAt: now + 61_000 }, now)).toBe(
      "Personne n'a répondu depuis 3 manches. La partie s'arrête dans 2 min si personne ne revient.",
    )
    expect(idlePauseText({ reason: "silent", stopAt: now + 5_000 }, now)).toContain("dans 1 min")
  })

  it("l'heure passee : la partie va s'arreter", () => {
    expect(idlePauseText({ reason: "empty", stopAt: now - 1 }, now)).toBe("Plus aucun joueur n'est connecté. La partie va s'arrêter.")
  })
})
