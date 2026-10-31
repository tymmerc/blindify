/**
 * Page viewer /live (T5) : code + pseudo, une reponse par manche, reveal et
 * place. Aucun son sur cette page.
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { StreamerState } from "@/lib/types"

type Handler = (p: unknown) => void
const sockets: FakeSocket[] = []

class FakeSocket {
  handlers = new Map<string, Handler[]>()
  emit = vi.fn()
  close = vi.fn()
  connected = true
  opts: { auth?: unknown }
  constructor(opts: { auth?: unknown }) {
    this.opts = opts
  }
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn])
    return this
  }
  fire(event: string, payload: unknown) {
    for (const fn of this.handlers.get(event) ?? []) fn(payload)
  }
}

vi.mock("socket.io-client", () => ({
  io: (_url: string, opts: { auth?: unknown }) => {
    const s = new FakeSocket(opts)
    sockets.push(s)
    return s
  },
}))

let search = new URLSearchParams("code=ab12cd")
vi.mock("next/navigation", () => ({ useSearchParams: () => search }))

import { LiveClient } from "./LiveClient"

const game = (patch: Partial<StreamerState> = {}): StreamerState => ({
  roomCode: "AB12CD",
  hostUserId: 1,
  subMode: "viewers_only",
  phase: "GUESSING_CHAT",
  currentRound: 1,
  totalRounds: 5,
  currentTrack: { round: 1, trackId: "hidden", title: "", artist: "", previewUrl: null, trackSource: "streamer" },
  timing: { startAt: Date.now(), endAt: Date.now() + 20_000 },
  chatScore: 0,
  chatStreak: 0,
  streamerScore: 0,
  streamerWins: 0,
  chatWins: 0,
  ...patch,
})

const audioSpy = vi.fn()

beforeEach(() => {
  sockets.length = 0
  search = new URLSearchParams("code=ab12cd")
  window.localStorage.clear()
  audioSpy.mockClear()
  vi.stubGlobal("Audio", audioSpy)
})
afterEach(() => vi.unstubAllGlobals())

function join(pseudo = "Lena") {
  render(<LiveClient />)
  fireEvent.change(screen.getByLabelText("Ton pseudo"), { target: { value: pseudo } })
  fireEvent.click(screen.getByRole("button", { name: "Rejoindre le live" }))
  return sockets[0]
}

function readAuth(s: FakeSocket): { live: { salle: string; pseudo: string; cle?: string } } {
  let value: unknown
  ;(s.opts.auth as (cb: (v: unknown) => void) => void)(v => { value = v })
  return value as { live: { salle: string; pseudo: string; cle?: string } }
}

describe("page viewer", () => {
  it("code repris de l'adresse, pseudo, puis connexion sans cookie", () => {
    const socket = join()
    expect(screen.getByLabelText("Code du live")).toHaveValue("AB12CD")
    expect(readAuth(socket).live).toMatchObject({ salle: "AB12CD", pseudo: "Lena" })
  })

  it("repond pendant la manche, une seule fois, et ne cree jamais d'audio", () => {
    const socket = join()
    act(() => socket.fire("live:init", { roomCode: "AB12CD", me: { id: "v1", key: "k".repeat(32), pseudo: "Lena", score: 0, rank: null }, answeredRound: 0, state: game() }))
    expect(window.localStorage.getItem("blindz_live_key:AB12CD")).toBe("k".repeat(32))
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Chocolat" } })
    fireEvent.change(screen.getByLabelText("Artiste"), { target: { value: "Naza" } })
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma réponse" }))
    expect(socket.emit).toHaveBeenCalledWith("live:guess", { title: "Chocolat", artist: "Naza" })
    act(() => socket.fire("live:ack", { round: 1, outcome: "ok" }))
    expect(screen.getByTestId("live-sent")).toBeInTheDocument()
    expect(screen.queryByLabelText("Titre")).toBeNull()
    expect(audioSpy).not.toHaveBeenCalled()
  })

  it("au reveal : la reponse, son resultat et sa place", () => {
    const socket = join()
    act(() => socket.fire("live:init", { roomCode: "AB12CD", me: { id: "v1", key: "k".repeat(32), pseudo: "Lena", score: 0, rank: null }, answeredRound: 1, state: game() }))
    act(() => socket.fire("round:reveal:final", game({
      phase: "REVEAL_FINAL",
      currentTrack: { round: 1, trackId: "hidden", title: "Chocolat", artist: "Naza", previewUrl: null, albumCover: null, trackSource: "streamer" },
      leaderboard: [{ id: "v1", pseudo: "Lena", score: 28, source: "page" }],
    })))
    act(() => socket.fire("live:result", { round: 1, verdict: "correct", points: 28, score: 28, rank: 1, total: 3 }))
    expect(screen.getByText("Chocolat")).toBeInTheDocument()
    expect(screen.getByTestId("live-result")).toHaveTextContent("Bien joué, titre et artiste ! +28")
    expect(screen.getByTestId("live-result")).toHaveTextContent("Tu es 1er sur 3, avec 28 points.")
  })

  it("pseudo deja pris : le formulaire revient avec le message", () => {
    const socket = join()
    act(() => socket.fire("connect_error", { message: "pseudo_pris" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Ce pseudo est déjà pris")
    expect(socket.close).toHaveBeenCalled()
  })

  it("la cle gardee fait revenir le meme viewer", () => {
    window.localStorage.setItem("blindz_live_key:AB12CD", "c".repeat(32))
    const socket = join()
    expect(readAuth(socket).live.cle).toBe("c".repeat(32))
  })
})
