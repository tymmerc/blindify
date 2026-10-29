import { describe, expect, it } from "vitest"
import {
  initialSpectatorView,
  rankedPlayers,
  secondsLeft,
  spectatorErrorCode,
  spectatorReducer,
  type SpectatorView,
} from "./spectatorState"
import type { MultiplayerGameState } from "./types"

const players = {
  1: { userId: 1, username: "Julie", score: 300, hasAnswered: false, isReady: false, totalReactionMs: 9000 },
  2: { userId: 2, username: "Paul", score: 300, hasAnswered: true, isReady: false, totalReactionMs: 4000 },
  3: { userId: 3, username: "Max", score: 100, hasAnswered: false, isReady: false },
}

function game(over: Partial<MultiplayerGameState> = {}): MultiplayerGameState {
  return {
    roomCode: "ABCD12",
    hostUserId: 1,
    mode: "friends",
    phase: "GUESSING",
    currentRound: 1,
    totalRounds: 5,
    currentTrack: { round: 1, trackId: "hidden", title: "", artist: "", previewUrl: "https://x/p.mp3" },
    players,
    timing: { startAt: 1000, revealAt: 21_000 },
    config: { autoAdvance: false, roundDurationMs: 20_000 },
    ...over,
  } as MultiplayerGameState
}

function live(): SpectatorView {
  return spectatorReducer(initialSpectatorView, {
    type: "init",
    now: 10_000,
    payload: { roomCode: "ABCD12", mode: "friends", expiresAt: 99, members: [{ userId: 1, username: "Julie", status: "active" }], serverTimestamp: 12_000 },
  })
}

describe("spectatorReducer", () => {
  it("init : en direct, membres du lobby, decalage d'horloge", () => {
    const v = live()
    expect(v.status).toBe("live")
    expect(v.members).toHaveLength(1)
    expect(v.clockOffset).toBe(2000)
  })

  it("etat, manche suivante, reveal, fin", () => {
    let v = spectatorReducer(live(), { type: "game:state", payload: game() })
    expect(v.game?.phase).toBe("GUESSING")
    const revealed = { round: 1, trackId: "t1", title: "Titre", artist: "Artiste", previewUrl: null }
    v = spectatorReducer(v, { type: "game:round:reveal", payload: { roomCode: "ABCD12", round: 1, track: revealed, timing: { startAt: 1, revealAt: 2 }, players } })
    expect(v.game?.phase).toBe("REVEAL")
    expect(v.game?.currentTrack?.title).toBe("Titre")
    v = spectatorReducer(v, { type: "game:round:start", payload: { roomCode: "ABCD12", round: 2, track: { round: 2, trackId: "hidden", title: "", artist: "", previewUrl: null }, timing: { startAt: 3, revealAt: 4 } } })
    expect(v.game?.phase).toBe("GUESSING")
    expect(v.game?.currentRound).toBe(2)
    expect(v.game?.currentTrack?.title).toBe("")
    v = spectatorReducer(v, { type: "game:over", payload: { roomCode: "ABCD12", players } })
    expect(v.game?.phase).toBe("FINISHED")
  })

  it("trames d'une autre salle ignorees", () => {
    const v = spectatorReducer(live(), { type: "game:state", payload: game({ roomCode: "AUTRE1" }) })
    expect(v.game).toBeNull()
  })

  it("presence : remplace la liste des membres", () => {
    const v = spectatorReducer(live(), { type: "room:presence", payload: { roomCode: "ABCD12", type: "members", members: [] } })
    expect(v.members).toEqual([])
    const same = spectatorReducer(live(), { type: "room:presence", payload: { roomCode: "ABCD12", type: "joined" } })
    expect(same.members).toHaveLength(1)
  })

  it("erreur", () => {
    expect(spectatorReducer(live(), { type: "error", code: "spectateur_expire" })).toMatchObject({ status: "error", error: "spectateur_expire" })
  })
})

describe("aides", () => {
  it("codes d'erreur connus, sinon reseau", () => {
    expect(spectatorErrorCode("spectateur_refuse")).toBe("spectateur_refuse")
    expect(spectatorErrorCode("xhr poll error")).toBe("reseau")
    expect(spectatorErrorCode(undefined)).toBe("reseau")
  })

  it("classement : score puis rapidite", () => {
    expect(rankedPlayers(game()).map(p => p.username)).toEqual(["Paul", "Julie", "Max"])
    expect(rankedPlayers(null)).toEqual([])
  })

  it("compte a rebours a l'heure du serveur", () => {
    expect(secondsLeft(game(), 10_000, 1000)).toBe(10)
    expect(secondsLeft(game(), 30_000, 0)).toBe(0)
    expect(secondsLeft(game({ phase: "REVEAL" }), 10_000, 0)).toBeNull()
  })
})
