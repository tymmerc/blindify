import { describe, expect, it } from "vitest"
import { endMoments, type SummaryResponse, type SummaryRound } from "./endMoments"

const players = [
  { userId: 1, username: "Ines" },
  { userId: 2, username: "Bastoche" },
  { userId: 3, username: "Noe" },
]

const rounds: SummaryRound[] = [
  { round: 1, title: "Alors on danse", artist: "Stromae", answers: 3, correct: 2, ownerUserId: 1 },
  { round: 2, title: "Formidable", artist: "Stromae", answers: 2, correct: 0, ownerUserId: 2 },
  { round: 3, title: "Papaoutai", artist: "Stromae", answers: 3, correct: 2, ownerUserId: 1 },
]

const res = (round: number, userId: number, guessTitle: string, guessArtist: string, gained: number): SummaryResponse =>
  ({ round, userId, guessTitle, guessArtist, gained })

const responses: SummaryResponse[] = [
  res(1, 1, "alors on danse", "stromae", 3),
  res(1, 2, "alor on danse", "Stromae", 2),
  res(1, 3, "jsp", "le belge la", 0),
  res(2, 1, "formidabl", "stromae", 0),
  res(2, 3, "", "", 0),
  res(3, 2, "papaoutai", "stromae", 2),
  res(3, 3, "papaoutai", "", 1),
]

describe("endMoments", () => {
  it("garde la reponse ratee la plus loin de la bonne", () => {
    const m = endMoments(rounds, responses, players)
    expect(m.wildest).toMatchObject({ userId: 3, guessTitle: "jsp", guessArtist: "le belge la", round: 1, title: "Alors on danse" })
  })

  it("trouve le morceau tente que personne n'a trouve, avec son proprietaire", () => {
    expect(endMoments(rounds, responses, players).missed).toEqual({ round: 2, title: "Formidable", artist: "Stromae", ownerUserId: 2 })
  })

  it("compte les bonnes reponses des autres sur les morceaux de chacun", () => {
    // Ines : manche 1 (Bastoche) + manche 3 (Bastoche, Noe) = 3, sa propre reponse ne compte pas.
    expect(endMoments(rounds, responses, players).picker).toEqual({ userId: 1, found: 3, rounds: 2 })
  })

  it("ignore les joueurs partis de la salle et les reponses vides", () => {
    const m = endMoments(rounds, responses, players.filter(p => p.userId !== 3))
    // Reste « formidabl » d'Ines : presque juste, donc pas « a cote ».
    expect(m.wildest).toBeNull()
    // Les bonnes reponses de Noe sur les morceaux d'Ines comptent toujours : il les a trouves.
    expect(m.picker).toEqual({ userId: 1, found: 3, rounds: 2 })
  })

  it("une reponse presque juste sans points n'est jamais « la plus a cote »", () => {
    const m = endMoments(rounds, [res(2, 1, "formidable", "stromae", 0)], players)
    expect(m.wildest).toBeNull()
  })

  it("rien a raconter : tout a null", () => {
    expect(endMoments([], [], players)).toEqual({ wildest: null, missed: null, picker: null })
  })
})
