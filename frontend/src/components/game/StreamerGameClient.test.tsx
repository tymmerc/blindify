/**
 * Ecran du streamer (T5) : il pilote, voit les reponses arriver sans leur
 * texte, repond en duo, et finit sur le podium.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { StreamerState } from "@/lib/types"
import { StreamerGameClient } from "./StreamerGameClient"

vi.mock("@/lib/audioManager", () => ({
  DEFAULT_AUDIO_VOLUME: 0.5,
  audioManager: { play: vi.fn(() => Promise.resolve()), stop: vi.fn() },
}))
import { audioManager } from "@/lib/audioManager"

const state = (patch: Partial<StreamerState> = {}): StreamerState => ({
  roomCode: "AB12CD",
  hostUserId: 1,
  subMode: "viewers_only",
  phase: "GUESSING_CHAT",
  currentRound: 1,
  totalRounds: 5,
  currentTrack: { round: 1, trackId: "hidden", title: "", artist: "", previewUrl: "https://extraits.test/1.mp3", trackSource: "streamer" },
  timing: { startAt: Date.now(), endAt: Date.now() + 20_000 },
  chatScore: 0,
  chatStreak: 0,
  streamerScore: 0,
  streamerWins: 0,
  chatWins: 0,
  viewerCount: 3,
  leaderboard: [],
  ...patch,
})

function renderHost(s: StreamerState, extra: Partial<Parameters<typeof StreamerGameClient>[0]> = {}) {
  const props = {
    userId: 1,
    state: s,
    serverNow: Date.now(),
    onHostGuess: vi.fn(),
    onHostStart: vi.fn(),
    onHostEnd: vi.fn(),
    ...extra,
  }
  render(<StreamerGameClient {...props} />)
  return props
}

describe("ecran du streamer", () => {
  it("pendant la manche : nombre de reponses et pseudos, son coupe par defaut", () => {
    renderHost(state({ answersCount: 2 }), { answers: { round: 1, count: 4, names: ["Lena", "Malik"] } })
    expect(screen.getByTestId("streamer-arrivals")).toHaveTextContent("4 réponses")
    expect(screen.getByTestId("streamer-arrivals")).toHaveTextContent("Lena")
    expect(screen.queryByTestId("streamer-next")).toBeNull()
    expect(audioManager.play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Écouter ici" }))
    expect(audioManager.play).toHaveBeenCalledWith(expect.objectContaining({ src: "https://extraits.test/1.mp3" }))
  })

  it("finir la partie a tout moment", () => {
    const props = renderHost(state())
    fireEvent.click(screen.getByTestId("streamer-end"))
    expect(props.onHostEnd).toHaveBeenCalled()
  })

  it("apres le reveal : la reponse et le bouton de la manche suivante", () => {
    const props = renderHost(state({
      phase: "ROUND_ENDED",
      currentTrack: { round: 1, trackId: "hidden", title: "Chocolat", artist: "Naza", previewUrl: null, trackSource: "streamer" },
      chatSnapshot: { total: 4, correct: 3, percentCorrect: 75 },
    }))
    expect(screen.getByTestId("streamer-reveal")).toHaveTextContent("Chocolat")
    expect(screen.getByText(/3 sur 4 ont trouvé/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("streamer-next"))
    expect(props.onHostStart).toHaveBeenCalled()
  })

  it("duo : le streamer repond titre et artiste apres le chat", () => {
    const props = renderHost(state({ subMode: "duo", phase: "GUESSING_STREAMER", chatSnapshot: { total: 2, correct: 1, percentCorrect: 50 } }))
    expect(screen.getByText(/Le chat a trouvé à/)).toHaveTextContent("50 %")
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "chocolat" } })
    fireEvent.change(screen.getByLabelText("Artiste"), { target: { value: "naza" } })
    fireEvent.click(screen.getByRole("button", { name: "Valider" }))
    expect(props.onHostGuess).toHaveBeenCalledWith({ title: "chocolat", artist: "naza" })
  })

  it("fin : podium et rejouer", () => {
    const props = renderHost(
      state({ phase: "GAME_OVER", leaderboard: [{ id: "a", pseudo: "Lena", score: 90, source: "page" }] }),
      { onReplay: vi.fn() },
    )
    expect(screen.getByTestId("streamer-podium")).toHaveTextContent("Lena")
    fireEvent.click(screen.getByRole("button", { name: /Rejouer/ }))
    expect(props.onReplay).toHaveBeenCalled()
  })
})
