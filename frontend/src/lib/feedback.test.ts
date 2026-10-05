import { describe, expect, it } from "vitest"
import { multiplayerFeedbackContext } from "./feedback"

// Ecran de resultats multijoueur : le bloc « Ça s'est bien passé ? » va a
// chaque joueur devant son propre ecran, jamais a l'ecran central.
describe("multiplayerFeedbackContext", () => {
  it("a distance : chaque joueur, hote compris, avec le code de la salle", () => {
    expect(multiplayerFeedbackContext({ mode: "friends", roomCode: "AB12CD", isHost: true, hostPlays: false }))
      .toEqual({ mode: "friends", gameCode: "AB12CD" })
    expect(multiplayerFeedbackContext({ mode: "friends", roomCode: "AB12CD", isHost: false, hostPlays: false }))
      .toEqual({ mode: "friends", gameCode: "AB12CD" })
  })

  it("autour d'une table : les telephones oui, l'ecran central non", () => {
    expect(multiplayerFeedbackContext({ mode: "event", roomCode: "EV3NT1", isHost: false, hostPlays: false }))
      .toEqual({ mode: "event", gameCode: "EV3NT1" })
    expect(multiplayerFeedbackContext({ mode: "event", roomCode: "EV3NT1", isHost: true, hostPlays: false })).toBeNull()
  })

  it("autour d'une table, hote qui joue aussi : il est devant son propre ecran", () => {
    expect(multiplayerFeedbackContext({ mode: "event", roomCode: "EV3NT1", isHost: true, hostPlays: true }))
      .toEqual({ mode: "event", gameCode: "EV3NT1" })
  })

  it("streamer (mode masque) ou mode inconnu : pas de bloc", () => {
    expect(multiplayerFeedbackContext({ mode: "streamer", roomCode: "STR34M", isHost: false, hostPlays: false })).toBeNull()
    expect(multiplayerFeedbackContext({ mode: "tele", isHost: false, hostPlays: false })).toBeNull()
  })

  it("sans code de salle, le retour part quand meme", () => {
    expect(multiplayerFeedbackContext({ mode: "friends", roomCode: undefined, isHost: false, hostPlays: false }))
      .toEqual({ mode: "friends", gameCode: null })
  })
})
