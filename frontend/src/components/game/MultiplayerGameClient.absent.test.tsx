/**
 * T22 : joueur absent et partie en veille, cote ecran. Le serveur decide ;
 * l'ecran dit pourquoi la partie est figee, et « Je suis là » la relance.
 */
import { fireEvent, render, screen } from "@testing-library/react"
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
import { LateJoinerView } from "./LateJoinerView"

function guessing(mode: "event" | "friends", now: number, extra: Partial<MultiplayerGameState> = {}): MultiplayerGameState {
  return {
    roomCode: "AB12CD",
    hostUserId: 1,
    hostPlays: false,
    mode,
    phase: "GUESSING",
    currentRound: 4,
    totalRounds: 10,
    currentTrack: { round: 4, trackId: "hidden", title: "", artist: "", previewUrl: "https://extrait.test/a.mp3" },
    players: {
      2: { userId: 2, username: "joueur", score: 0, hasAnswered: false, isReady: false },
      3: { userId: 3, username: "parti", score: 0, hasAnswered: false, isReady: false, absent: true },
    },
    timing: { startAt: now - 2_000, revealAt: now + 28_000 },
    config: { autoAdvance: false, roundDurationMs: 30_000 },
    ...extra,
  }
}

const presenter = { id: 1, username: "hote", provider: "guest" } as never
const joueur = { id: 2, username: "joueur", provider: "guest" } as never
const absent = { id: 3, username: "parti", provider: "guest" } as never

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(["event", "friends"] as const)("mode %s", mode => {
  it("partie en veille : la raison, le delai, et « Je suis là » pour un joueur", () => {
    const now = Date.now()
    const onPresent = vi.fn()
    const state = guessing(mode, now, { paused: true, idle: { reason: "silent", stopAt: now + 120_000 } })
    render(<MultiplayerGameClient user={joueur} state={state} serverNow={now} onAnswer={vi.fn()} mode={mode} onPresent={onPresent} />)
    expect(screen.getByTestId("pause-reason").textContent).toBe(
      "Personne n'a répondu depuis 3 manches. La partie s'arrête dans 2 min si personne ne revient.",
    )
    fireEvent.click(screen.getByTestId("idle-present"))
    expect(onPresent).toHaveBeenCalledTimes(1)
  })

  it("pause de l'hote : le texte habituel, pas de « Je suis là »", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={joueur} state={guessing(mode, now, { paused: true })} serverNow={now} onAnswer={vi.fn()} mode={mode} onPresent={vi.fn()} />)
    expect(screen.getByTestId("pause-reason").textContent).toBe("L'hôte a mis la partie en pause.")
    expect(screen.queryByTestId("idle-present")).toBeNull()
  })

  it("le joueur note absent voit le bandeau, et son clic le ramene", () => {
    const now = Date.now()
    const onPresent = vi.fn()
    render(<MultiplayerGameClient user={absent} state={guessing(mode, now)} serverNow={now} onAnswer={vi.fn()} mode={mode} onPresent={onPresent} />)
    const notice = screen.getByTestId("absent-notice")
    expect(notice.textContent).toContain("tu es noté absent")
    fireEvent.click(screen.getByRole("button", { name: "Je suis là" }))
    expect(onPresent).toHaveBeenCalledTimes(1)
  })

  it("les autres ne voient pas le bandeau, et l'absent sort du compte des reponses", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={joueur} state={guessing(mode, now)} serverNow={now} onAnswer={vi.fn()} mode={mode} onPresent={vi.fn()} />)
    expect(screen.queryByTestId("absent-notice")).toBeNull()
    expect(document.body.textContent).toMatch(/0\s*\/\s*1/)
  })
})

it("l'hote qui presente : la veille s'affiche, sans « Je suis là » (il a « Reprendre »)", () => {
  const now = Date.now()
  const state = guessing("event", now, { paused: true, idle: { reason: "empty", stopAt: now + 90_000 } })
  render(<MultiplayerGameClient user={presenter} state={state} serverNow={now} onAnswer={vi.fn()} mode="event" onPresent={vi.fn()} onPauseToggle={vi.fn()} />)
  expect(screen.getByTestId("pause-reason").textContent).toBe(
    "Plus aucun joueur n'est connecté. La partie s'arrête dans 2 min si personne ne revient.",
  )
  expect(screen.queryByTestId("idle-present")).toBeNull()
  expect(screen.getByRole("button", { name: "Reprendre" })).toBeTruthy()
})

it("absent de la partie d'avant : il regarde, puis « Je reviens »", () => {
  const now = Date.now()
  const onComeBack = vi.fn()
  const onRejoin = vi.fn()
  const state = guessing("friends", now, { absentees: [{ userId: 3, username: "parti" }] })
  delete (state.players as Record<number, unknown>)[3]
  render(
    <LateJoinerView
      state={state}
      currentUserId={3}
      serverNow={now}
      chatMessages={[]}
      onSendChat={vi.fn()}
      onExit={vi.fn()}
      onRejoin={onRejoin}
      onComeBack={onComeBack}
    />,
  )
  expect(screen.getByTestId("late-joiner-title").textContent).toBe("Tu étais absent à la dernière partie")
  fireEvent.click(screen.getByTestId("absent-come-back"))
  expect(onComeBack).toHaveBeenCalledTimes(1)
})
