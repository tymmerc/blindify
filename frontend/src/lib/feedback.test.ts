import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, clientApi } from "./apiClient"
import { FEEDBACK_TIMEOUT_MS, feedbackFailure, multiplayerFeedbackContext, sendFeedback } from "./feedback"

vi.mock("./apiClient", async importOriginal => ({
  ...(await importOriginal<typeof import("./apiClient")>()),
  clientApi: { sendFeedback: vi.fn() },
}))

const send = vi.mocked(clientApi.sendFeedback)

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

describe("sendFeedback", () => {
  beforeEach(() => {
    send.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("abandonne la requete au bout de 10 s sans reponse", async () => {
    let signal: AbortSignal | undefined
    send.mockImplementation((_payload, abort) => new Promise((_resolve, reject) => {
      signal = abort
      abort?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
    }))

    const outcome = expect(sendFeedback({ kind: "avis", answer: "oui", mode: "solo" })).rejects.toThrow(/aborted/)
    await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS - 1)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await outcome
    expect(signal?.aborted).toBe(true)
  })

  it("ne laisse aucune minuterie derriere une reponse", async () => {
    send.mockResolvedValue({ received: true })
    await sendFeedback({ kind: "bug", mode: "chrono" })
    expect(send).toHaveBeenCalledWith({ kind: "bug", mode: "chrono" }, expect.any(AbortSignal))
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("feedbackFailure", () => {
  it("distingue le 429 de tous les autres echecs", () => {
    expect(feedbackFailure(new ApiError(429, "Trop de retours", "rate_limited"))).toBe("rate_limited")
    expect(feedbackFailure(new ApiError(500, "Erreur"))).toBe("failed")
    expect(feedbackFailure(new ApiError(400, "Retour illisible", "invalid_body"))).toBe("failed")
    expect(feedbackFailure(new DOMException("The operation was aborted.", "AbortError"))).toBe("failed")
    expect(feedbackFailure(new TypeError("Failed to fetch"))).toBe("failed")
  })
})
