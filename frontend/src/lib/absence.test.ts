import { describe, expect, it } from "vitest"
import { IDLE_PRESENT_ACTION, idlePauseText, isAbsentee, silentPauseText } from "./absence"

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

describe("silentPauseText", () => {
  const now = 1_000_000
  const silent = { reason: "silent" as const, stopAt: now + 120_000 }

  it("rien hors de la veille « personne n'a repondu »", () => {
    expect(silentPauseText(null, now, "phone")).toBeNull()
    expect(silentPauseText({ reason: "empty", stopAt: now + 120_000 }, now, "phone")).toBeNull()
  })

  it("dit ou repondre selon l'appareil, et garde le delai avant l'arret", () => {
    const phone = silentPauseText(silent, now, "phone")!
    expect(phone.title).toBe("Personne n'a répondu.")
    expect(phone.help).toContain("grand écran")
    expect(phone.help).toContain("sur ton téléphone")
    expect(phone.help).toContain(IDLE_PRESENT_ACTION)
    expect(phone.when).toBe("La partie s'arrête dans 2 min si personne ne reprend.")
    expect(silentPauseText(silent, now, "screen")!.help).toContain("sur son téléphone")
    expect(silentPauseText(silent, now, "own")!.help).toContain("Monte le son")
    expect(silentPauseText({ reason: "silent", stopAt: now - 1 }, now, "own")!.when).toBe("La partie va s'arrêter.")
  })

  it("aucun tiret cadratin dans les textes", () => {
    for (const viewer of ["screen", "phone", "own"] as const) {
      const t = silentPauseText(silent, now, viewer)!
      expect(`${t.title}${t.help}${t.when}`).not.toContain("\u2014")
    }
  })
})
