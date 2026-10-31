/**
 * Mode streamer (T5) : reducteurs de la page viewer et de l'overlay.
 */
import { describe, expect, it } from "vitest"
import {
  answersOf,
  canAnswer,
  cleanLiveCode,
  elapsedRatio,
  initialLiveView,
  initialOverlayView,
  liveErrorCode,
  liveReducer,
  overlayReducer,
  secondsLeft,
  type LiveView,
} from "./streamerLive"
import type { StreamerState } from "./types"

const state = (patch: Partial<StreamerState> = {}): StreamerState => ({
  roomCode: "AB12CD",
  hostUserId: 1,
  subMode: "viewers_only",
  phase: "GUESSING_CHAT",
  currentRound: 1,
  totalRounds: 5,
  currentTrack: null,
  timing: { startAt: 1_000, endAt: 21_000 },
  chatScore: 0,
  chatStreak: 0,
  streamerScore: 0,
  streamerWins: 0,
  chatWins: 0,
  ...patch,
})

const me = { id: "v1", key: "k".repeat(32), pseudo: "Lena", score: 0, rank: null }

function joined(game: StreamerState | null = state()): LiveView {
  const v = liveReducer(initialLiveView, { type: "connect", roomCode: "AB12CD" })
  return liveReducer(v, { type: "init", payload: { roomCode: "AB12CD", me, answeredRound: 0, state: game, serverTimestamp: 5_000 }, now: 4_000 })
}

describe("page viewer", () => {
  it("rejoint, puis peut repondre une seule fois pendant la phase du public", () => {
    let v = joined()
    expect(v.status).toBe("live")
    expect(v.clockOffset).toBe(1_000)
    expect(canAnswer(v)).toBe(true)
    v = liveReducer(v, { type: "sending", round: 1 })
    expect(canAnswer(v)).toBe(false)
    v = liveReducer(v, { type: "ack", payload: { round: 1, outcome: "ok" } })
    expect(v.answeredRound).toBe(1)
    expect(canAnswer(v)).toBe(false)
  })

  it("un refus (phase fermee) ne compte pas comme une reponse", () => {
    let v = liveReducer(joined(), { type: "sending", round: 1 })
    v = liveReducer(v, { type: "ack", payload: { round: 1, outcome: "ferme" } })
    expect(v.answeredRound).toBe(0)
  })

  it("nouvelle manche : resultat et accuse effaces", () => {
    let v = joined()
    v = liveReducer(v, { type: "result", payload: { round: 1, verdict: "correct", points: 28, score: 28, rank: 1, total: 3 } })
    expect(v.me?.score).toBe(28)
    expect(v.lastResult?.points).toBe(28)
    v = liveReducer(v, { type: "state", payload: state({ currentRound: 2, phase: "STARTING_ROUND" }) })
    expect(v.lastResult).toBeNull()
  })

  it("ignore l'etat d'une autre salle", () => {
    const v = joined()
    expect(liveReducer(v, { type: "state", payload: state({ roomCode: "ZZZZZZ", currentRound: 4 }) }).game?.currentRound).toBe(1)
  })

  it("pas de reponse hors de la phase du public", () => {
    expect(canAnswer(joined(state({ phase: "GUESSING_STREAMER" })))).toBe(false)
    expect(canAnswer(joined(null))).toBe(false)
  })

  it("pseudo pris : retour au formulaire ; mode coupe : ecran d'erreur ; reseau : on garde l'ecran", () => {
    expect(liveReducer(joined(), { type: "error", code: "pseudo_pris" }).status).toBe("form")
    expect(liveReducer(joined(), { type: "error", code: "live_desactive" }).status).toBe("error")
    expect(liveReducer(joined(), { type: "error", code: "reseau" }).status).toBe("live")
  })

  it("codes d'erreur et saisie du code", () => {
    expect(liveErrorCode("pseudo_pris")).toBe("pseudo_pris")
    expect(liveErrorCode("xss<script>")).toBe("reseau")
    expect(cleanLiveCode(" ab-12 cd ")).toBe("AB12CD")
  })
})

describe("minuteur", () => {
  it("secondes restantes et part ecoulee, avec le decalage serveur", () => {
    const timing = { startAt: 1_000, endAt: 21_000 }
    expect(secondsLeft(timing, 10_000, 1_000)).toBe(10)
    expect(secondsLeft(timing, 30_000)).toBe(0)
    expect(elapsedRatio(timing, 11_000)).toBe(0.5)
    expect(elapsedRatio({ startAt: null, endAt: null }, 11_000)).toBe(0)
  })
})

describe("overlay", () => {
  it("compteurs de viewers et de reponses de SA manche", () => {
    let v = overlayReducer(initialOverlayView, { type: "init", payload: { roomCode: "AB12CD", expiresAt: 9, viewerCount: 2, state: state({ answersCount: 1 }) }, now: 0 })
    v = overlayReducer(v, { type: "viewers", payload: { roomCode: "AB12CD", count: 3 } })
    expect(v.viewerCount).toBe(3)
    v = overlayReducer(v, { type: "answers", payload: { roomCode: "AB12CD", round: 1, count: 4, names: ["Lena"] } })
    expect(answersOf(v)).toBe(4)
    v = overlayReducer(v, { type: "answers", payload: { roomCode: "AB12CD", round: 7, count: 99, names: [] } })
    expect(answersOf(v)).toBe(4)
    v = overlayReducer(v, { type: "state", payload: state({ currentRound: 2, answersCount: 0 }) })
    expect(answersOf(v)).toBe(0)
  })

  it("lien refuse : ecran d'erreur", () => {
    expect(overlayReducer(initialOverlayView, { type: "error", code: "overlay_refuse" }).status).toBe("error")
  })
})
