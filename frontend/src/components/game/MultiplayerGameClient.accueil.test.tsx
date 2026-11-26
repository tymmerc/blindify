/**
 * Accueil des nouveaux (24/11) : trois nouveaux venus n'avaient rien tape en
 * quatre manches autour d'une table. Avant la 1re manche, l'ecran et les
 * telephones disent ou sort la musique et ou repondre ; quand personne ne
 * repond, la pause dit quoi faire et l'hote a un gros bouton pour reprendre.
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

function game(mode: "event" | "friends", now: number, extra: Partial<MultiplayerGameState> = {}): MultiplayerGameState {
  return {
    roomCode: "AB12CD",
    hostUserId: 1,
    hostPlays: false,
    mode,
    phase: "GUESSING",
    currentRound: 1,
    totalRounds: 10,
    currentTrack: { round: 1, trackId: "hidden", title: "", artist: "", previewUrl: "https://extrait.test/a.mp3" },
    players: {
      2: { userId: 2, username: "joueur", score: 0, hasAnswered: false, isReady: false },
      3: { userId: 3, username: "autre", score: 0, hasAnswered: false, isReady: false },
    },
    // Lancement : 7 s d'explication puis le 3-2-1, la manche part a startAt.
    timing: { startAt: now + 10_000, revealAt: now + 40_000 },
    tableIntro: true,
    config: { autoAdvance: false, roundDurationMs: 30_000 },
    ...extra,
  }
}

const hote = { id: 1, username: "hote", provider: "guest" } as never
const joueur = { id: 2, username: "joueur", provider: "guest" } as never

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("explication avant la 1re manche", () => {
  it("sur le telephone d'un joueur autour d'une table", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={joueur} state={game("event", now)} serverNow={now} onAnswer={vi.fn()} mode="event" />)
    const intro = screen.getByTestId("explication-table").textContent
    expect(intro).toContain("La musique sort du grand écran.")
    expect(intro).toContain("Tape ici le titre ou l'artiste")
    // Le decompte tourne jusqu'a startAt : la manche part seule, sans clic.
    expect(screen.getByTestId("decompte-manche").getAttribute("aria-label")).toContain("départ dans 10")
    expect(screen.queryByRole("button", { name: /commencer|lancer|ok/i })).toBeNull()
  })

  it("sur l'ecran de l'hote qui presente", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={hote} state={game("event", now)} serverNow={now} onAnswer={vi.fn()} mode="event" />)
    expect(screen.getByTestId("explication-table").textContent).toContain("La musique va sortir de cet écran.")
  })

  it("sur l'appareil de l'hote qui joue aussi : il repond ici", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={hote} state={game("event", now, { hostPlays: true })} serverNow={now} onAnswer={vi.fn()} mode="event" />)
    const intro = screen.getByTestId("explication-table").textContent
    expect(intro).toContain("La musique va sortir de cet appareil.")
    expect(intro).toContain("Tu tapes ici")
  })

  it("pas a la revanche : le serveur ne la demande pas, decompte habituel sans texte", () => {
    const now = Date.now()
    const revanche = game("event", now, { tableIntro: false, timing: { startAt: now + 3_000, revealAt: now + 33_000 } })
    render(<MultiplayerGameClient user={joueur} state={revanche} serverNow={now} onAnswer={vi.fn()} mode="event" />)
    expect(screen.getByTestId("decompte-manche")).toBeTruthy()
    expect(screen.queryByTestId("explication-table")).toBeNull()
  })

  it("pas entre amis, ni avant les manches suivantes", () => {
    const now = Date.now()
    const { unmount } = render(<MultiplayerGameClient user={joueur} state={game("friends", now, { tableIntro: false })} serverNow={now} onAnswer={vi.fn()} mode="friends" />)
    expect(screen.getByTestId("decompte-manche")).toBeTruthy()
    expect(screen.queryByTestId("explication-table")).toBeNull()
    unmount()
    const round2 = game("event", now, { currentRound: 2, timing: { startAt: now + 3_000, revealAt: now + 33_000 } })
    render(<MultiplayerGameClient user={joueur} state={round2} serverNow={now} onAnswer={vi.fn()} mode="event" />)
    expect(screen.getByTestId("decompte-manche")).toBeTruthy()
    expect(screen.queryByTestId("explication-table")).toBeNull()
  })

  it("disparait une fois la manche partie : le formulaire est la", () => {
    const now = Date.now()
    const started = game("event", now, { timing: { startAt: now - 1_000, revealAt: now + 29_000 } })
    render(<MultiplayerGameClient user={joueur} state={started} serverNow={now} onAnswer={vi.fn()} mode="event" />)
    expect(screen.queryByTestId("explication-table")).toBeNull()
    expect(screen.getByLabelText("Titre du morceau")).toBeTruthy()
  })
})

describe("pause parce que personne n'a repondu", () => {
  const paused = (mode: "event" | "friends", now: number, extra: Partial<MultiplayerGameState> = {}) =>
    game(mode, now, { currentRound: 4, timing: { startAt: now - 30_000, revealAt: now }, paused: true, idle: { reason: "silent", stopAt: now + 120_000 }, ...extra })

  it("l'hote : le message annonce, le gros bouton pour reprendre, focus dessus", () => {
    const now = Date.now()
    const onPauseToggle = vi.fn()
    render(<MultiplayerGameClient user={hote} state={paused("event", now)} serverNow={now} onAnswer={vi.fn()} mode="event" onPresent={vi.fn()} onPauseToggle={onPauseToggle} />)
    const reason = screen.getByTestId("pause-reason")
    expect(reason.getAttribute("role")).toBe("alert")
    expect(reason.textContent).toContain("Personne n'a répondu.")
    expect(reason.textContent).toContain("Chacun tape le titre ou l'artiste sur son téléphone")
    expect(reason.textContent).toContain("« Reprendre la partie »")
    expect(reason.textContent).toContain("dans 2 min")
    const resume = screen.getByRole("button", { name: "Reprendre la partie" })
    expect(document.activeElement).toBe(resume)
    fireEvent.click(resume)
    expect(onPauseToggle).toHaveBeenCalledTimes(1)
  })

  it("l'hote qui joue aussi : un texte pour lui et un seul bouton", () => {
    const now = Date.now()
    const players = { ...game("event", now).players, 1: { userId: 1, username: "hote", score: 0, hasAnswered: false, isReady: false } }
    render(<MultiplayerGameClient user={hote} state={paused("event", now, { hostPlays: true, players })} serverNow={now} onAnswer={vi.fn()} mode="event" onPresent={vi.fn()} onPauseToggle={vi.fn()} />)
    const reason = screen.getByTestId("pause-reason").textContent
    expect(reason).toContain("toi ici")
    expect(reason).toContain("« Reprendre la partie »")
    expect(reason).not.toContain("Je suis là")
    expect(screen.getByRole("button", { name: "Reprendre la partie" })).toBeTruthy()
    expect(screen.queryByTestId("idle-present")).toBeNull()
  })

  it("le joueur au telephone : le message, sans le bouton de l'hote", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={joueur} state={paused("event", now)} serverNow={now} onAnswer={vi.fn()} mode="event" onPresent={vi.fn()} onPauseToggle={vi.fn()} />)
    const reason = screen.getByTestId("pause-reason").textContent
    expect(reason).toContain("Personne n'a répondu.")
    expect(reason).toContain("sur ton téléphone")
    expect(reason).toContain("« Je suis là »")
    expect(screen.queryByRole("button", { name: "Reprendre la partie" })).toBeNull()
    expect(screen.getByTestId("idle-present")).toBeTruthy()
  })

  it("sans bouton pour repartir (rien a toucher), le texte n'en parle pas", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={joueur} state={paused("friends", now)} serverNow={now} onAnswer={vi.fn()} mode="friends" />)
    expect(screen.queryByTestId("idle-present")).toBeNull()
    expect(screen.getByTestId("pause-reason").textContent).not.toContain("Touche")
  })

  it("entre amis aussi, avec le texte de son propre appareil", () => {
    const now = Date.now()
    render(<MultiplayerGameClient user={joueur} state={paused("friends", now)} serverNow={now} onAnswer={vi.fn()} mode="friends" onPresent={vi.fn()} onPauseToggle={vi.fn()} />)
    expect(screen.getByTestId("pause-reason").textContent).toContain("Monte le son")
    expect(screen.queryByRole("button", { name: "Reprendre la partie" })).toBeNull()
  })
})
