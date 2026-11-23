import { describe, expect, it } from "vitest"
import { answerRows, formatPoints, myGap, pacingScreen, pointsLabel, pointsParts, rankNote, rankRows, secondsUntil, streakLabel, trackOwner, trackOwnerIds } from "./roundPacing"
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

  // Event, hote qui presente : le serveur dit qui montrer (le proprietaire qu'on pouvait designer).
  it("montre le proprietaire choisi par le serveur, pas un autre co-proprietaire ni l'hote", () => {
    const shared = { ...track({ owner_user_id: 1, owner_username: "Hote", owner_user_ids: [1, 3, 5] }), shownOwner: { userId: 3, username: "Clem" } }
    const owner = trackOwner(shared, [player(5), player(2), player(3, { username: "Clem" })])
    expect(owner).toMatchObject({ userId: 3, name: "Clem" })
    // Parti pendant la manche : le nom envoye par le serveur, jamais celui de l'hote.
    expect(trackOwner(shared, [player(5), player(2)])).toMatchObject({ userId: 3, name: "Clem" })
  })

  it("personne de proposable (shownOwner null) : le vrai proprietaire, sans question", () => {
    const hostOnly = { ...track({ owner_user_id: 1, owner_username: "Hote", owner_user_ids: [1] }, false), shownOwner: null }
    expect(trackOwner(hostOnly, [player(2), player(3)])).toMatchObject({ userId: 1, name: "Hote", question: false })
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
    expect(rankNote(rankRows([player(1, { username: "A", score: 3000 }), player(2, { username: "B", score: 2920 })]))).toBe("B n'est qu'à 80 points de A.")
    expect(rankNote(rankRows([player(1, { username: "A", score: 3000 }), player(2, { username: "B", score: 2850 })]))).toBeNull()
    expect(rankNote(rankRows([player(1)]))).toBeNull()
  })
})

// T43 : points en centaines, detail des points et ecart avec le joueur devant.
const NNBSP = "\u202f"

describe("points en centaines", () => {
  it("formatPoints groupe les milliers sans jamais couper", () => {
    expect(formatPoints(850)).toBe("850")
    expect(formatPoints(12450)).toBe(`12${NNBSP}450`)
    expect(formatPoints(0)).toBe("0")
  })

  it("pointsLabel accorde point au pluriel", () => {
    expect(pointsLabel(1)).toBe("1 point")
    expect(pointsLabel(0)).toBe("0 point")
    expect(pointsLabel(1200)).toBe(`1${NNBSP}200 points`)
  })

  it("pointsParts : reponse selon la rapidite, serie, qui a ajoute", () => {
    expect(pointsParts({ points: { answer: 870, streak: 200, owner: 200, ms: 4_230 }, titleOk: true, artistOk: true })).toEqual([
      { label: "titre et artiste en 4,2 s", points: 870 },
      { label: "série", points: 200 },
      { label: "qui a ajouté", points: 200 },
    ])
    expect(pointsParts({ points: { answer: 400, streak: 0, owner: 0, ms: 12_000 }, titleOk: false, artistOk: true })).toEqual([
      { label: "artiste en 12,0 s", points: 400 },
    ])
    expect(pointsParts({ points: { answer: 0, streak: 0, owner: 200, ms: 3_000 }, titleOk: false, artistOk: false })).toEqual([
      { label: "qui a ajouté", points: 200 },
    ])
    expect(pointsParts({ points: null, titleOk: true, artistOk: true })).toEqual([])
  })

  it("streakLabel a partir de 2 manches d'affilee", () => {
    expect(streakLabel(0)).toBeNull()
    expect(streakLabel(1)).toBeNull()
    expect(streakLabel(3)).toBe("Série de 3")
  })

  it("answerRows passe le detail et la serie", () => {
    const rows = answerRows(null, [player(1, { lastGained: 1070, lastPoints: { answer: 870, streak: 200, owner: 0, ms: 4_000 }, streak: 3 })])
    expect(rows[0].points?.answer).toBe(870)
    expect(rows[0].streak).toBe(3)
  })

  it("myGap : l'ecart avec le joueur juste devant, ou l'avance du premier", () => {
    const rows = rankRows([
      player(1, { username: "Lou", score: 3400 }),
      player(2, { username: "Max", score: 3280 }),
      player(3, { username: "Zoé", score: 1500 }),
    ])
    expect(myGap(rows, 2)).toBe("À 120 points de Lou.")
    expect(myGap(rows, 3)).toBe(`À 1${NNBSP}780 points de Max.`)
    expect(myGap(rows, 1)).toBe("120 points d'avance sur Max.")
    expect(myGap(rows, null)).toBeNull()
    expect(myGap(rankRows([player(1)]), 1)).toBeNull()
  })

  it("myGap : egalite de points, departagee au temps", () => {
    const rows = rankRows([
      player(1, { username: "Lou", score: 1000, totalReactionMs: 3_000 }),
      player(2, { username: "Max", score: 1000, totalReactionMs: 5_000 }),
    ])
    expect(myGap(rows, 2)).toBe("À égalité avec Lou, derrière au temps de réponse.")
    expect(myGap(rows, 1)).toBe("À égalité avec Max, devant au temps de réponse.")
  })
})
