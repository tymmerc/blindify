import { describe, expect, it } from "vitest"
import { answerRows, pacingScreen, rankNote, rankRows, secondsUntil, trackOwner, trackOwnerIds } from "./roundPacing"
import type { MultiplayerPlayerState } from "./types"

const player = (userId: number, extra: Partial<MultiplayerPlayerState> = {}): MultiplayerPlayerState => ({
  userId,
  username: `J${userId}`,
  score: 0,
  hasAnswered: true,
  isReady: false,
  ...extra,
})

describe("pacingScreen : l'ecran a montrer", () => {
  const timing = (startAt: number | null) => ({ startAt, revealAt: startAt ? startAt + 20_000 : null })

  it("3-2-1 tant que la manche n'a pas demarre, puis la manche", () => {
    expect(pacingScreen({ phase: "GUESSING", timing: timing(10_000) }, 8_000)).toBe("countdown")
    expect(pacingScreen({ phase: "GUESSING", timing: timing(10_000) }, 10_000)).toBe("play")
  })

  it("la reponse, puis le classement, selon le serveur", () => {
    expect(pacingScreen({ phase: "REVEAL", pacing: { step: "answer", endsAt: 1, ms: 1 }, timing: timing(1) }, 0)).toBe("answer")
    expect(pacingScreen({ phase: "REVEAL", pacing: { step: "scores", endsAt: 1, ms: 1 }, timing: timing(1) }, 0)).toBe("scores")
    // Serveur d'avant T38 : pas de pacing, on montre la reponse.
    expect(pacingScreen({ phase: "REVEAL", timing: timing(1) }, 0)).toBe("answer")
  })

  it("fin de partie et salle d'attente", () => {
    expect(pacingScreen({ phase: "FINISHED", timing: timing(null) }, 0)).toBe("finished")
    expect(pacingScreen({ phase: "LOBBY", timing: timing(null) }, 0)).toBe("lobby")
    expect(pacingScreen(null, 0)).toBe("lobby")
  })

  it("secondsUntil arrondit au-dessus et ne descend pas sous 0", () => {
    expect(secondsUntil(10_000, 7_100)).toBe(3)
    expect(secondsUntil(10_000, 12_000)).toBe(0)
    expect(secondsUntil(null, 0)).toBe(0)
  })
})

describe("le morceau de X", () => {
  const track = (metadata: Record<string, unknown> | null, ownerQuestion = true) => ({
    round: 1, trackId: "t", title: "T", artist: "A", previewUrl: null, metadata, ownerQuestion,
  })

  it("lit le contributeur puis les autres importeurs, sans doublon", () => {
    expect(trackOwnerIds({ owner_user_id: 3, owner_user_ids: [3, "5", "x"] })).toEqual([3, 5])
    expect(trackOwnerIds(null)).toEqual([])
  })

  it("compte qui a devine, parmi les autres joueurs", () => {
    const players = [
      player(1, { lastSourceGuess: 3 }),
      player(2, { lastSourceGuess: 1 }),
      player(3, { username: "Clem", avatar: "https://x/a.jpg" }),
      player(4, { lastSourceGuess: null }),
    ]
    expect(trackOwner(track({ owner_user_id: 3 }), players)).toEqual({
      userId: 3, name: "Clem", avatar: "https://x/a.jpg", guessed: 1, asked: 3, question: true,
    })
  })

  it("garde le nom de la metadata quand le proprietaire est parti", () => {
    const owner = trackOwner(track({ owner_user_id: 9, owner_username: "Parti" }), [player(1)])
    expect(owner?.name).toBe("Parti")
    expect(owner?.avatar).toBeNull()
  })

  it("rien sans proprietaire connu", () => {
    expect(trackOwner(track({}), [player(1)])).toBeNull()
  })
})

describe("qui a repondu quoi", () => {
  const track = { round: 1, trackId: "t", title: "Alors on danse", artist: "Stromae", previewUrl: null, metadata: { owner_user_id: 3 }, ownerQuestion: true }

  it("trouve d'abord, a cote a la fin, puis par points", () => {
    const rows = answerRows(track, [
      player(1, { lastVerdict: "wrong", lastGained: 1, lastSourceGuess: 3, lastOwnerOk: true }),
      player(2, { lastVerdict: "correct", lastGained: 2 }),
      player(4, { lastVerdict: "close", lastGained: 1 }),
      player(5, { lastVerdict: "correct", lastGained: 3 }),
    ])
    expect(rows.map(r => r.userId)).toEqual([5, 2, 4, 1])
  })

  it("garde le texte tape tel quel et dit quel champ etait faux", () => {
    const [row] = answerRows(track, [
      player(1, { lastGuessTitle: " papaoutai ", lastGuessArtist: "Stromae", lastVerdict: "close", lastTitleOk: false, lastArtistOk: true }),
    ])
    expect(row).toEqual(expect.objectContaining({ title: "papaoutai", artist: "Stromae", titleOk: false, artistOk: true, empty: false }))
  })

  it("le pari sur le proprietaire, jamais pour le proprietaire lui-meme", () => {
    const rows = answerRows(track, [
      player(1, { username: "Ines", lastSourceGuess: 3, lastOwnerOk: true, lastVerdict: "correct" }),
      player(2, { lastSourceGuess: 1, lastOwnerOk: false, lastVerdict: "close" }),
      player(3, { username: "Clem", lastSourceGuess: 1, lastVerdict: "wrong" }),
    ])
    expect(rows.find(r => r.userId === 1)?.bet).toEqual({ name: "Clem", ok: true })
    expect(rows.find(r => r.userId === 2)?.bet).toEqual({ name: "Ines", ok: false })
    expect(rows.find(r => r.userId === 3)?.bet).toBeNull()
    expect(rows.find(r => r.userId === 3)?.isOwner).toBe(true)
  })

  it("pas de pari quand la question n'a pas ete posee", () => {
    const rows = answerRows({ ...track, ownerQuestion: false }, [player(1, { lastSourceGuess: 3 })])
    expect(rows[0].bet).toBeNull()
  })

  it("une reponse vide : a passe, ou pas de reponse", () => {
    const rows = answerRows(track, [player(1, { hasAnswered: true }), player(2, { hasAnswered: false })])
    expect(rows.every(r => r.empty)).toBe(true)
    expect(rows.find(r => r.userId === 2)?.answered).toBe(false)
  })
})

describe("classement de la manche", () => {
  it("place d'avant, place d'apres et mouvement", () => {
    const rows = rankRows([
      player(1, { score: 10, lastGained: 0 }),
      player(2, { score: 11, lastGained: 3 }),
      player(3, { score: 9, lastGained: 1 }),
    ])
    expect(rows.map(r => [r.userId, r.rank, r.prevRank, r.move])).toEqual([
      [2, 0, 1, 1],
      [1, 1, 0, -1],
      [3, 2, 2, 0],
    ])
  })

  it("egalite de points : le plus rapide devant", () => {
    const rows = rankRows([player(1, { score: 5, totalReactionMs: 9_000 }), player(2, { score: 5, totalReactionMs: 4_000 })])
    expect(rows[0].userId).toBe(2)
  })

  it("la phrase dit ce qui a bouge", () => {
    expect(rankNote(rankRows([player(1, { score: 4, lastGained: 0 }), player(2, { username: "Lili", score: 5, lastGained: 3 })]))).toBe("Lili passe en tête.")
    const climb = rankRows([
      player(1, { score: 9 }), player(2, { score: 8 }), player(3, { username: "Bas", score: 7, lastGained: 3 }), player(4, { score: 6 }), player(5, { score: 5 }),
    ])
    expect(rankNote(climb)).toBe("Bas remonte de 2 places.")
    expect(rankNote(rankRows([player(1, { username: "A", score: 3 }), player(2, { username: "B", score: 2 })]))).toBe("B n'est qu'à 1 point de A.")
    expect(rankNote(rankRows([player(1)]))).toBeNull()
  })
})
