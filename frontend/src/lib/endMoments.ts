// T40 : les moments de la partie, pour l'ecran de fin. Tire du bilan manche par
// manche (GET /api/rooms/:code/rounds), calcule ici pour rester testable.
import { levenshteinDistance, normalize } from "@/lib/matching"

export interface SummaryRound {
  round: number
  title: string | null
  artist: string | null
  answers: number
  correct: number
  ownerUserId?: number | null
}

export interface SummaryResponse {
  round: number
  userId: number
  guessTitle: string
  guessArtist: string
  gained: number
}

export interface MomentPlayer {
  userId: number
  username: string | null
  avatar?: string | null
}

/** La reponse la plus loin de la bonne, parmi celles qui n'ont rien rapporte. */
export interface WildestAnswer {
  userId: number
  guessTitle: string
  guessArtist: string
  round: number
  title: string
  artist: string
}

/** Un morceau que des gens ont tente sans que personne ne marque. */
export interface MissedTrack {
  round: number
  title: string
  artist: string
  ownerUserId: number | null
}

/** Le joueur dont les morceaux ont ete le plus trouves par les autres. */
export interface BestPicker {
  userId: number
  found: number
  rounds: number
}

export interface EndMoments {
  wildest: WildestAnswer | null
  missed: MissedTrack | null
  picker: BestPicker | null
}

const joined = (title: string, artist: string) => normalize(`${title} ${artist}`)

/** 0 = identique, 1 = rien a voir. */
function distanceRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  return longest === 0 ? 0 : levenshteinDistance(a, b) / longest
}

export function endMoments(
  rounds: readonly SummaryRound[],
  responses: readonly SummaryResponse[],
  players: readonly MomentPlayer[],
): EndMoments {
  const inGame = new Set(players.map(p => p.userId))
  const byRound = new Map(rounds.map(r => [r.round, r]))

  let wildest: (WildestAnswer & { score: number; length: number }) | null = null
  for (const r of responses) {
    const round = byRound.get(r.round)
    const guessTitle = r.guessTitle.trim()
    const guessArtist = r.guessArtist.trim()
    if (!round?.title || r.gained > 0 || !inGame.has(r.userId) || (!guessTitle && !guessArtist)) continue
    const guess = joined(guessTitle, guessArtist)
    if (!guess) continue
    const score = distanceRatio(guess, joined(round.title, round.artist ?? ""))
    // Presque la bonne reponse (sans points : ecrite trop tard, ou bareme) : pas « a cote ».
    if (score < 0.3) continue
    const length = guess.length
    if (!wildest || score > wildest.score || (score === wildest.score && length > wildest.length)) {
      wildest = { userId: r.userId, guessTitle, guessArtist, round: r.round, title: round.title, artist: round.artist ?? "", score, length }
    }
  }

  const missedRound = rounds.find(r => r.title && r.answers > 0 && r.correct === 0)
  const missed: MissedTrack | null = missedRound?.title
    ? { round: missedRound.round, title: missedRound.title, artist: missedRound.artist ?? "", ownerUserId: missedRound.ownerUserId ?? null }
    : null

  // Bonnes reponses des AUTRES sur les morceaux de chacun (le proprietaire ne compte pas).
  const tally = new Map<number, { found: number; rounds: number }>()
  for (const round of rounds) {
    const owner = round.ownerUserId
    if (!owner || !inGame.has(owner)) continue
    const found = responses.filter(r => r.round === round.round && r.userId !== owner && r.gained > 0).length
    const prev = tally.get(owner) ?? { found: 0, rounds: 0 }
    tally.set(owner, { found: prev.found + found, rounds: prev.rounds + 1 })
  }
  let picker: BestPicker | null = null
  for (const [userId, t] of tally) {
    if (t.found === 0) continue
    if (!picker || t.found > picker.found || (t.found === picker.found && t.rounds < picker.rounds)) {
      picker = { userId, found: t.found, rounds: t.rounds }
    }
  }

  return {
    wildest: wildest ? { userId: wildest.userId, guessTitle: wildest.guessTitle, guessArtist: wildest.guessArtist, round: wildest.round, title: wildest.title, artist: wildest.artist } : null,
    missed,
    picker,
  }
}
