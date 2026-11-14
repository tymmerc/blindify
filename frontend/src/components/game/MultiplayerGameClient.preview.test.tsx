/**
 * T35 : un extrait qui ne joue pas (lien Deezer expire, 403). Le jeu demande
 * un lien neuf au serveur, une seule fois par manche, au lieu d'afficher tout
 * de suite le petit bouton play qui rejouait le lien mort. Mode « autour
 * d'une table » (soiree du 12/11) : l'ecran de l'hote diffuse le son.
 */
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MultiplayerGameState } from "@/lib/types"

const audio = vi.hoisted(() => ({
  play: vi.fn(),
}))
vi.mock("@/lib/audioManager", () => ({
  DEFAULT_AUDIO_VOLUME: 0.35,
  audioManager: {
    play: audio.play,
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

const user = { id: 1, username: "joueur", provider: "guest" } as never

function guessing(round: number, previewUrl: string, now: number): MultiplayerGameState {
  return {
    roomCode: "AB12CD",
    hostUserId: 1,
    mode: "event",
    phase: "GUESSING",
    currentRound: round,
    totalRounds: 20,
    currentTrack: { round, trackId: "hidden", title: "", artist: "", previewUrl },
    players: {
      1: { userId: 1, username: "joueur", score: 0, hasAnswered: false, isReady: false },
      2: { userId: 2, username: "hote", score: 0, hasAnswered: false, isReady: false },
    },
    timing: { startAt: now - 2_000, revealAt: now + 18_000 },
    config: { autoAdvance: false, roundDurationMs: 20_000 },
  }
}

const notSupported = () => Object.assign(new Error("no supported sources"), { name: "NotSupportedError" })

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never
  vi.useFakeTimers()
  audio.play.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("T35 : extrait illisible en pleine partie", () => {
  it("demande un lien neuf une fois par manche, sans le bouton play tout de suite", async () => {
    audio.play.mockRejectedValue(notSupported())
    const onPreviewBroken = vi.fn()
    const now = Date.now()
    const props = { user, serverNow: now, onAnswer: vi.fn(), mode: "event" as const, onPreviewBroken }
    const { rerender } = render(<MultiplayerGameClient {...props} state={guessing(18, "https://cdnt-preview.dzcdn.net/mort.mp3", now)} />)
    await act(async () => { await Promise.resolve() })
    expect(onPreviewBroken).toHaveBeenCalledWith(18)
    expect(screen.queryByTitle("Lancer la musique")).toBeNull()

    // Le watchdog relance, ca rate encore : pas de seconde demande pour la manche.
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100) })
    expect(onPreviewBroken).toHaveBeenCalledTimes(1)

    // Le serveur renvoie l'etat avec un lien neuf : la lecture repart dessus.
    audio.play.mockResolvedValue({})
    rerender(<MultiplayerGameClient {...props} state={guessing(18, "https://cdnt-preview.dzcdn.net/neuf.mp3", now)} />)
    await act(async () => { await Promise.resolve() })
    expect(audio.play).toHaveBeenLastCalledWith(expect.objectContaining({ src: "https://cdnt-preview.dzcdn.net/neuf.mp3" }))
  })

  it("lecture auto bloquee par le navigateur : bouton play, pas de demande de lien", async () => {
    audio.play.mockRejectedValue(Object.assign(new Error("blocked"), { name: "NotAllowedError" }))
    const onPreviewBroken = vi.fn()
    const now = Date.now()
    render(<MultiplayerGameClient user={user} serverNow={now} onAnswer={vi.fn()} mode="event" onPreviewBroken={onPreviewBroken} state={guessing(3, "https://cdnt-preview.dzcdn.net/ok.mp3", now)} />)
    await act(async () => { await Promise.resolve() })
    expect(onPreviewBroken).not.toHaveBeenCalled()
    expect(screen.getAllByTitle("Lancer la musique").length).toBeGreaterThan(0)
  })
})
