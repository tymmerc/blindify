/**
 * T42 : « Arrêter la partie ». L'hote seul a le bouton, une confirmation evite
 * le clic par erreur, puis tout le monde revient dans la salle (le parent
 * appelle le serveur). Modes table (event) et a distance (friends, theatre).
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MultiplayerGameState } from "@/lib/types"

vi.mock("@/lib/audioManager", () => ({
  DEFAULT_AUDIO_VOLUME: 0.35,
  audioManager: {
    play: vi.fn(async () => undefined),
    stop: vi.fn(),
    stopIfSrc: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    resume: vi.fn(),
    warmup: vi.fn(),
    getState: () => ({ owner: null, src: null, playing: false, muted: false, volume: 0.35, lastStopReason: null }),
    subscribe: () => () => {},
  },
  playCorrectSound: vi.fn(),
  playPartialSound: vi.fn(),
  playWrongSound: vi.fn(),
}))

import { MultiplayerGameClient } from "./MultiplayerGameClient"

function guessing(mode: "event" | "friends", now: number, paused = false): MultiplayerGameState {
  return {
    roomCode: "AB12CD",
    hostUserId: 1,
    hostPlays: true,
    mode,
    phase: "GUESSING",
    paused,
    currentRound: 2,
    totalRounds: 10,
    currentTrack: { round: 2, trackId: "hidden", title: "", artist: "", previewUrl: "https://extrait.test/a.mp3" },
    players: {
      1: { userId: 1, username: "hote", score: 0, hasAnswered: false, isReady: false },
      2: { userId: 2, username: "joueur", score: 0, hasAnswered: false, isReady: false },
    },
    timing: { startAt: now - 2_000, revealAt: now + 28_000 },
    config: { autoAdvance: false, roundDurationMs: 30_000 },
  }
}

const host = { id: 1, username: "hote", provider: "guest" } as never
const guest = { id: 2, username: "joueur", provider: "guest" } as never

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(["event", "friends"] as const)("mode %s", mode => {
  it("l'hote arrete la partie apres confirmation", async () => {
    const onStop = vi.fn(async () => undefined)
    const now = Date.now()
    render(<MultiplayerGameClient user={host} state={guessing(mode, now)} serverNow={now} onAnswer={vi.fn()} mode={mode} onStop={onStop} />)

    fireEvent.click(screen.getByRole("button", { name: "Arrêter la partie" }))
    const dialog = screen.getByRole("alertdialog")
    expect(dialog.textContent).toContain("Arrêter la partie ?")
    expect(dialog.textContent).toContain("Tout le monde revient dans la salle.")

    // « Continuer » : rien ne part, la partie continue.
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(onStop).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Arrêter la partie" }))
    const confirm = screen.getAllByRole("button", { name: "Arrêter la partie" }).find(b => screen.getByRole("alertdialog").contains(b))!
    await act(async () => { fireEvent.click(confirm) })
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it("un joueur qui n'est pas l'hote ne voit pas le bouton", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={guest} state={guessing(mode, now)} serverNow={now} onAnswer={vi.fn()} mode={mode} onStop={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Arrêter la partie" })).toBeNull()
  })
})

it("en pause, l'hote peut aussi arreter depuis l'ecran de pause", () => {
  const now = Date.now()
  render(<MultiplayerGameClient user={host} state={guessing("friends", now, true)} serverNow={now} onAnswer={vi.fn()} mode="friends" onStop={vi.fn()} onPauseToggle={vi.fn()} />)
  // Bouton de l'en-tete + bouton de l'ecran de pause.
  expect(screen.getAllByRole("button", { name: "Arrêter la partie" })).toHaveLength(2)
})
