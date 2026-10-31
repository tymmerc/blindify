/**
 * Overlay OBS (T5) : code et QR pour rejoindre, minuteur, reponses, reveal,
 * podium. Il joue l'extrait, et seulement quand une manche tourne.
 */
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { StreamerState } from "@/lib/types"

type Handler = (p: unknown) => void
const sockets: FakeSocket[] = []

class FakeSocket {
  handlers = new Map<string, Handler[]>()
  emit = vi.fn()
  close = vi.fn()
  io = { on: vi.fn() }
  opts: { auth?: unknown; withCredentials?: boolean }
  constructor(opts: { auth?: unknown; withCredentials?: boolean }) {
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

let search = new URLSearchParams("salle=AB12CD&jeton=123.sig")
vi.mock("next/navigation", () => ({ useSearchParams: () => search }))

import { OverlayClient } from "./OverlayClient"

class FakeAudio {
  static last: FakeAudio | null = null
  src = ""
  loop = false
  currentTime = 0
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  constructor() {
    FakeAudio.last = this
  }
}

const game = (patch: Partial<StreamerState> = {}): StreamerState => ({
  roomCode: "AB12CD",
  hostUserId: 1,
  subMode: "viewers_only",
  phase: "GUESSING_CHAT",
  currentRound: 2,
  totalRounds: 5,
  currentTrack: { round: 2, trackId: "hidden", title: "", artist: "", previewUrl: "https://extraits.test/2.mp3", trackSource: "streamer" },
  timing: { startAt: Date.now(), endAt: Date.now() + 20_000 },
  chatScore: 0,
  chatStreak: 0,
  streamerScore: 0,
  streamerWins: 0,
  chatWins: 0,
  leaderboard: [{ id: "a", pseudo: "Lena", score: 30, source: "page" }],
  ...patch,
})

beforeEach(() => {
  sockets.length = 0
  search = new URLSearchParams("salle=AB12CD&jeton=123.sig")
  vi.stubGlobal("Audio", FakeAudio)
  FakeAudio.last = null
})
afterEach(() => vi.unstubAllGlobals())

const init = (state: StreamerState | null, viewerCount = 0) =>
  act(() => sockets[0].fire("overlay:init", { roomCode: "AB12CD", expiresAt: Date.now() + 1e6, viewerCount, state }))

describe("overlay OBS", () => {
  it("se connecte avec le jeton du lien, sans cookie", () => {
    render(<OverlayClient />)
    expect(sockets[0].opts).toMatchObject({ withCredentials: false, auth: { overlay: { salle: "AB12CD", jeton: "123.sig" } } })
  })

  it("avant la partie : code, QR et joueurs prets, pas de son", () => {
    render(<OverlayClient />)
    init(null, 3)
    expect(screen.getByTestId("overlay-join")).toHaveTextContent("AB12CD")
    expect(screen.getByTestId("overlay-join").querySelector("svg")).not.toBeNull()
    expect(screen.getByText("3 joueurs prêts")).toBeInTheDocument()
    expect(FakeAudio.last?.play ?? vi.fn()).not.toHaveBeenCalled()
  })

  it("pendant la manche : minuteur, reponses, classement, et l'extrait joue", () => {
    render(<OverlayClient />)
    init(game({ answersCount: 1 }))
    act(() => sockets[0].fire("streamer:answers", { roomCode: "AB12CD", round: 2, count: 12, names: ["Lena"] }))
    expect(screen.getByTestId("overlay-round")).toHaveTextContent("Manche 2 / 5")
    expect(screen.getByTestId("overlay-answers")).toHaveTextContent("12 réponses")
    expect(screen.getByTestId("streamer-timer")).toBeInTheDocument()
    expect(screen.getByTestId("streamer-leaderboard")).toHaveTextContent("Lena")
    expect(FakeAudio.last?.src).toBe("https://extraits.test/2.mp3")
    expect(FakeAudio.last?.play).toHaveBeenCalled()
  })

  it("au reveal : pochette, titre, artiste ; au compte a rebours suivant, le son s'arrete", () => {
    render(<OverlayClient />)
    init(game())
    act(() => sockets[0].fire("round:reveal:final", game({
      phase: "REVEAL_FINAL",
      currentTrack: { round: 2, trackId: "hidden", title: "Chocolat", artist: "Naza", previewUrl: "https://extraits.test/2.mp3", albumCover: "https://p.test/c.jpg", trackSource: "streamer" },
    })))
    expect(screen.getByTestId("streamer-reveal")).toHaveTextContent("Chocolat")
    expect(screen.getByTestId("streamer-reveal")).toHaveTextContent("Naza")
    act(() => sockets[0].fire("state:sync", game({ phase: "STARTING_ROUND", currentRound: 3, currentTrack: null })))
    expect(FakeAudio.last?.pause).toHaveBeenCalled()
  })

  it("fin de partie : podium", () => {
    render(<OverlayClient />)
    init(game({ phase: "GAME_OVER", leaderboard: [{ id: "a", pseudo: "Lena", score: 90, source: "page" }, { id: "b", pseudo: "Malik", score: 60, source: "page" }] }))
    expect(screen.getByTestId("overlay-podium")).toHaveTextContent("Lena")
    expect(screen.getByTestId("overlay-podium")).toHaveTextContent("Malik")
  })

  it("lien refuse : un message, pas d'ecran de jeu", () => {
    render(<OverlayClient />)
    act(() => sockets[0].fire("connect_error", { message: "overlay_expire" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Ce lien d'overlay a expiré")
  })

  it("lien incomplet", () => {
    search = new URLSearchParams("salle=AB12CD")
    render(<OverlayClient />)
    expect(sockets).toHaveLength(0)
    expect(screen.getByRole("alert")).toHaveTextContent("Lien incomplet")
  })
})
