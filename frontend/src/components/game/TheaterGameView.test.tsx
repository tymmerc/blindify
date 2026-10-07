import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import type { MultiplayerGameState, UserSummary } from "@/lib/types"
import { TheaterGameView } from "./TheaterGameView"

// Ecran de jeu a distance. Sur telephone, Pause et Quitter deviennent des
// icones : leur nom accessible doit rester le meme, les scripts de la pile de
// test et les joueurs au lecteur d'ecran s'en servent. La largeur elle-meme se
// mesure dans un vrai navigateur (tools/test-stack/ecran-jeu-iphone.mjs).

const user = { id: 1, provider: "deezer", provider_id: "1", username: "Hote", email: null, avatar: null } as UserSummary
const players = [
  { userId: 1, username: "Hote", score: 0, hasAnswered: false, isReady: false },
  { userId: 2, username: "Lou", score: 0, hasAnswered: false, isReady: false },
]
const state = {
  roomCode: "ABCDEF",
  hostUserId: 1,
  mode: "friends",
  phase: "GUESSING",
  currentRound: 1,
  totalRounds: 10,
  currentTrack: null,
  players: {},
  timing: { startAt: null, revealAt: null },
} as unknown as MultiplayerGameState

type Props = ComponentProps<typeof TheaterGameView>

function renderView(overrides: Partial<Props> = {}) {
  const props: Props = {
    user, state, uiPhase: "guessing", isPlaying: true, isHost: true,
    onPauseToggle: vi.fn(), isLocked: false, isRevealed: false,
    remaining: 18, totalSeconds: 20, sortedPlayers: players,
    answeredCount: 0, displayAnsweredCount: 0, playerCount: 2, readyCount: 0,
    guessTitle: "", setGuessTitle: vi.fn(), guessArtist: "", setGuessArtist: vi.fn(),
    sourceGuess: null, setSourceGuess: vi.fn(), localHasAnswered: false,
    onSubmit: vi.fn(), onPass: vi.fn(), muted: false, volume: 0.5,
    onToggleMute: vi.fn(), onVolumeChange: vi.fn(), manualPlayRequired: false,
    isAudioPhase: true, onManualPlay: vi.fn(), currentTrack: null,
    trackOwnerUsername: null, player: null, revealCountdown: 7, onReady: vi.fn(),
    onExit: vi.fn(), chatMessages: [], chatInput: "", setChatInput: vi.fn(),
    chatScrollRef: { current: null },
    ...overrides,
  }
  return { props, ...render(<TheaterGameView {...props} />) }
}

afterEach(() => cleanup())

describe("TheaterGameView, en-tete et carte de reponse", () => {
  it("garde les noms Pause et Quitter sur les boutons devenus icones", () => {
    const { props } = renderView()
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }))
    expect(props.onPauseToggle).toHaveBeenCalledOnce()
    expect(props.onExit).toHaveBeenCalledOnce()
  })

  it("ne montre Pause qu'a l'hote", () => {
    renderView({ isHost: false })
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull()
    expect(screen.getByRole("button", { name: "Quitter" })).toBeInTheDocument()
  })

  it("garde les noms des boutons de reponse", () => {
    const { props } = renderView()
    expect(screen.getByRole("button", { name: "Valider ma réponse" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Je sais pas" }))
    expect(props.onPass).toHaveBeenCalledOnce()
  })

  it("garde la manche lisible : 01 / 10 a cote du chrono", () => {
    const { container } = renderView()
    expect(container.querySelector(".theater-round")?.textContent).toBe("ROUND 01 / 10")
  })

  it("ne laisse pas le contenu le plus large elargir l'ecran (colonne minmax(0, 1fr))", () => {
    const { container } = renderView()
    const stage = container.querySelector<HTMLElement>(".theater-stage")
    expect(stage?.style.gridTemplateColumns).toBe("minmax(0, 1fr)")
  })
})
