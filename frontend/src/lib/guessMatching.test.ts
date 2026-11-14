import { describe, it, expect } from "vitest"
import { evaluateGuessDetail } from "./guessMatching"
import table from "../../../shared/src/guessMatchingCases.json"

// Les cas vivent dans shared/src/guessMatchingCases.json : le backend
// (backend/tests/services/guessMatching.spec.ts) joue exactement les memes sur sa
// copie du juge. Ils viennent des parties reelles : apostrophes (partie 784 du
// 07/11/2026) et soiree du 12/11/2026 (parties 817 a 823), refus de Tym du
// 13/11 compris (« Love song », « Émilie » seul).

interface Case {
  field: "title" | "artist" | "verdict"
  guess: string
  title: string
  artist: string
  accepted?: boolean
  aussiSaisieUnique?: boolean
  titleInput?: string
  artistInput?: string
  verdict?: string
  note?: string
}

const cases = table.cases as Case[]
const label = (c: Case) => `« ${c.guess || c.titleInput || ""}${c.artistInput ? ` / ${c.artistInput}` : ""} » pour « ${c.title} - ${c.artist} »`

describe("guessMatching : cas communs front et back", () => {
  it.each(cases.filter(c => c.field === "title").map(c => [label(c), c] as const))("champ titre %s", (_l, c) => {
    expect(evaluateGuessDetail("", c, c.guess, "").matchedTitle).toBe(c.accepted)
  })

  it.each(cases.filter(c => c.aussiSaisieUnique).map(c => [label(c), c] as const))("saisie unique %s", (_l, c) => {
    expect(evaluateGuessDetail(c.guess, c).matchedTitle).toBe(c.accepted)
  })

  it.each(cases.filter(c => c.field === "artist").map(c => [label(c), c] as const))("champ artiste %s", (_l, c) => {
    expect(evaluateGuessDetail("", c, "", c.guess).matchedArtist).toBe(c.accepted)
  })

  it.each(cases.filter(c => c.field === "verdict").map(c => [label(c), c] as const))("verdict %s", (_l, c) => {
    expect(evaluateGuessDetail(c.guess, c, c.titleInput, c.artistInput).verdict).toBe(c.verdict)
  })
})
