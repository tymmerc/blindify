import { describe, expect, it } from "vitest"
import { IDLE_PRESENT_ACTION, SILENT_RESUME_ACTION, idlePauseText, isAbsentee, silentPauseText } from "./absence"

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
    expect(idlePauseText({ reason: "silent", stopAt: now + 62_000 }, now)).toBe(
      "Personne n'a répondu depuis 3 manches. La partie s'arrête dans 2 min si personne ne revient.",
    )
    expect(idlePauseText({ reason: "silent", stopAt: now + 5_000 }, now)).toContain("dans 1 min")
  })

  it("une veille toute neuve de 2 min ne s'affiche pas « 3 min » quand l'horloge estimee retarde un peu", () => {
    expect(idlePauseText({ reason: "empty", stopAt: now + 120_400 }, now)).toContain("dans 2 min")
  })

  it("l'heure passee : la partie va s'arreter", () => {
    expect(idlePauseText({ reason: "empty", stopAt: now - 1 }, now)).toBe("Plus aucun joueur n'est connecté. La partie va s'arrêter.")
  })
})

describe("silentPauseText", () => {
  const now = 1_000_000
  const silent = { reason: "silent" as const, stopAt: now + 120_000 }

  it("rien hors de la veille « personne n'a repondu »", () => {
    expect(silentPauseText(null, now, "phone", IDLE_PRESENT_ACTION)).toBeNull()
    expect(silentPauseText({ reason: "empty", stopAt: now + 120_000 }, now, "phone", IDLE_PRESENT_ACTION)).toBeNull()
  })

  it("dit ou repondre selon l'appareil, et garde le delai avant l'arret", () => {
    const phone = silentPauseText(silent, now, "phone", IDLE_PRESENT_ACTION)!
    expect(phone.title).toBe("Personne n'a répondu.")
    expect(phone.help).toContain("grand écran")
    expect(phone.help).toContain("sur ton téléphone")
    expect(phone.help).toContain(`« ${IDLE_PRESENT_ACTION} »`)
    expect(phone.when).toBe("La partie s'arrête dans 2 min si personne ne reprend.")
    expect(silentPauseText(silent, now, "screen", SILENT_RESUME_ACTION)!.help).toContain("sur son téléphone")
    expect(silentPauseText(silent, now, "hostPlays", SILENT_RESUME_ACTION)!.help).toContain("toi ici")
    expect(silentPauseText(silent, now, "own", IDLE_PRESENT_ACTION)!.help).toContain("Monte le son")
    expect(silentPauseText({ reason: "silent", stopAt: now - 1 }, now, "own", null)!.when).toBe("La partie va s'arrêter.")
  })

  it("ne parle que du bouton affiche, et d'aucun s'il n'y en a pas", () => {
    expect(silentPauseText(silent, now, "screen", SILENT_RESUME_ACTION)!.help).toContain(`« ${SILENT_RESUME_ACTION} »`)
    expect(silentPauseText(silent, now, "screen", SILENT_RESUME_ACTION)!.help).not.toContain(IDLE_PRESENT_ACTION)
    expect(silentPauseText(silent, now, "own", null)!.help).not.toContain("Touche")
  })

  it("aucun tiret cadratin dans les textes", () => {
    for (const viewer of ["screen", "hostPlays", "phone", "own"] as const) {
      const t = silentPauseText(silent, now, viewer, IDLE_PRESENT_ACTION)!
      expect(`${t.title}${t.help}${t.when}`).not.toContain("\u2014")
    }
  })
})
