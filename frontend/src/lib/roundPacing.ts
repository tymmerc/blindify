// T38 : le rythme entre deux manches, facon Kahoot. Le serveur decide quand on
// passe d'un ecran a l'autre (state.pacing, timing.startAt) ; ce fichier dit
// seulement quel ecran montrer et prepare ce qu'il affiche.
import type { MultiplayerGameState, MultiplayerPlayerState } from "@/lib/types"

export type PacingScreen = "lobby" | "countdown" | "play" | "answer" | "scores" | "finished"

/** L'ecran a montrer a l'heure serveur `now`. */
export function pacingScreen(state: Pick<MultiplayerGameState, "phase" | "pacing" | "timing"> | null | undefined, now: number): PacingScreen {
  if (!state) return "lobby"
  switch (state.phase) {
    case "FINISHED":
      return "finished"
    case "REVEAL":
      return state.pacing?.step === "scores" ? "scores" : "answer"
    case "GUESSING": {
      const startAt = state.timing?.startAt
      return startAt && startAt > now ? "countdown" : "play"
    }
    default:
      return "lobby"
  }
}

/** Secondes entieres restantes avant `ts` (au moins 0). */
export function secondsUntil(ts: number | null | undefined, now: number): number {
  if (!ts) return 0
  return Math.max(0, Math.ceil((ts - now) / 1000))
}

export type Verdict = "correct" | "close" | "wrong"

/** Libelles du jeu (les memes qu'avant T38). */
export const VERDICT_LABEL: Record<Verdict, string> = {
  correct: "Trouvé",
  close: "Presque",
  wrong: "À côté",
}

function toUserId(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * A qui revient le morceau (metadata posee au lancement, meme regle que
 * backend/src/services/roundOwners.ts) : le contributeur d'abord, puis les
 * autres joueurs qui l'avaient importe. Vide pendant la manche (caviardee).
 */
export function trackOwnerIds(metadata: Record<string, unknown> | null | undefined): number[] {
  if (!metadata || typeof metadata !== "object") return []
  const primary = toUserId(metadata.owner_user_id)
  const shared = Array.isArray(metadata.owner_user_ids)
    ? metadata.owner_user_ids.map(toUserId).filter((id): id is number => id !== null)
    : []
  return Array.from(new Set(primary ? [primary, ...shared] : shared))
}

type Player = Pick<
  MultiplayerPlayerState,
  "userId" | "username" | "avatar" | "score" | "hasAnswered" | "lastGuess" | "lastGuessTitle" | "lastGuessArtist" | "lastSourceGuess" | "lastVerdict" | "lastGained" | "lastTitleOk" | "lastArtistOk" | "lastOwnerOk" | "totalReactionMs" | "disconnected"
>

export interface TrackOwner {
  userId: number | null
  name: string
  avatar: string | null
  /** Joueurs qui ont trouve de qui venait le morceau, parmi ceux a qui on l'a demande. */
  guessed: number
  asked: number
  /** La question « qui a ajoute ? » a-t-elle ete posee cette manche ? */
  question: boolean
}

/** « Le morceau de X » : null si le morceau n'a pas de proprietaire connu. */
export function trackOwner(
  track: MultiplayerGameState["currentTrack"] | null | undefined,
  players: readonly Player[],
): TrackOwner | null {
  const ids = trackOwnerIds(track?.metadata)
  const metaName = typeof track?.metadata?.owner_username === "string" ? track.metadata.owner_username.trim() : ""
  if (ids.length === 0 && !metaName) return null
  const owner = players.find(p => ids.includes(p.userId)) ?? null
  const question = track?.ownerQuestion !== false
  const askedPlayers = players.filter(p => !ids.includes(p.userId))
  return {
    userId: owner?.userId ?? ids[0] ?? null,
    name: owner?.username?.trim() || metaName || "Un joueur",
    avatar: owner?.avatar ?? null,
    guessed: askedPlayers.filter(p => p.lastSourceGuess != null && ids.includes(p.lastSourceGuess)).length,
    asked: askedPlayers.length,
    question,
  }
}

export interface AnswerRow {
  userId: number
  username: string
  avatar: string | null
  /** Ce que le joueur a tape, tel quel (vide = rien tape dans ce champ). */
  title: string
  artist: string
  /** null : on ne sait pas quel champ etait juste (ancien serveur). */
  titleOk: boolean | null
  artistOk: boolean | null
  verdict: Verdict
  gained: number
  /** Rien tape du tout : « a passé » s'il a repondu, sinon « pas de réponse ». */
  empty: boolean
  answered: boolean
  isOwner: boolean
  /** Son pari sur la personne qui a mis le morceau (null : pas de pari, ou c'est son morceau). */
  bet: { name: string; ok: boolean } | null
}

const VERDICT_ORDER: Record<Verdict, number> = { correct: 0, close: 1, wrong: 2 }

function splitGuess(p: Player): { title: string; artist: string } {
  const title = (p.lastGuessTitle ?? "").trim()
  const artist = (p.lastGuessArtist ?? "").trim()
  if (title || artist) return { title, artist }
  // Ancien format : une seule chaine.
  return { title: (p.lastGuess ?? "").trim(), artist: "" }
}

/** Qui a repondu quoi : trouve d'abord, les reponses a cote (souvent les droles) a la fin. */
export function answerRows(
  track: MultiplayerGameState["currentTrack"] | null | undefined,
  players: readonly Player[],
): AnswerRow[] {
  const ownerIds = trackOwnerIds(track?.metadata)
  const askOwner = track?.ownerQuestion !== false
  const nameOf = (id: number) => players.find(p => p.userId === id)?.username?.trim() || "un joueur"
  return players
    .map((p): AnswerRow => {
      const { title, artist } = splitGuess(p)
      const verdict: Verdict = p.lastVerdict ?? "wrong"
      const isOwner = ownerIds.includes(p.userId)
      const titleOk = typeof p.lastTitleOk === "boolean" ? p.lastTitleOk : verdict === "correct" ? true : verdict === "wrong" ? false : null
      const artistOk = typeof p.lastArtistOk === "boolean" ? p.lastArtistOk : verdict === "correct" ? true : verdict === "wrong" ? false : null
      const betId = p.lastSourceGuess
      const bet = askOwner && !isOwner && betId != null && ownerIds.length > 0
        ? { name: nameOf(betId), ok: typeof p.lastOwnerOk === "boolean" ? p.lastOwnerOk : ownerIds.includes(betId) }
        : null
      return {
        userId: p.userId,
        username: p.username?.trim() || "Joueur",
        avatar: p.avatar ?? null,
        title,
        artist,
        titleOk,
        artistOk,
        verdict,
        gained: p.lastGained ?? 0,
        empty: !title && !artist,
        answered: p.hasAnswered,
        isOwner,
        bet,
      }
    })
    .sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || b.gained - a.gained)
}

export interface RankRow {
  userId: number
  username: string
  avatar: string | null
  score: number
  gained: number
  /** Place apres la manche (0 = premier). */
  rank: number
  /** Place avant la manche. */
  prevRank: number
  /** Places gagnees (positif) ou perdues (negatif). */
  move: number
}

const byScore = (score: (p: Player) => number) => (a: Player, b: Player) =>
  score(b) - score(a) || (a.totalReactionMs ?? Infinity) - (b.totalReactionMs ?? Infinity) || a.userId - b.userId

/** Le classement apres la manche, avec la place d'avant (score moins les points de la manche). */
export function rankRows(players: readonly Player[]): RankRow[] {
  const after = [...players].sort(byScore(p => p.score))
  const before = [...players].sort(byScore(p => p.score - (p.lastGained ?? 0)))
  return after.map((p, rank) => {
    const prevRank = before.findIndex(b => b.userId === p.userId)
    return {
      userId: p.userId,
      username: p.username?.trim() || "Joueur",
      avatar: p.avatar ?? null,
      score: p.score,
      gained: p.lastGained ?? 0,
      rank,
      prevRank,
      move: prevRank - rank,
    }
  })
}

export const TOP_SIZE = 5

/** Une phrase sur ce qui vient de bouger au classement (null si rien de notable). */
export function rankNote(rows: readonly RankRow[]): string | null {
  if (rows.length < 2) return null
  const leader = rows[0]
  if (leader.prevRank !== 0 && leader.score > 0) return `${leader.username} passe en tête.`
  const entered = rows.find(r => r.rank < TOP_SIZE && r.prevRank >= TOP_SIZE)
  if (entered) return `${entered.username} entre dans le top ${TOP_SIZE}.`
  const climber = [...rows].sort((a, b) => b.move - a.move)[0]
  if (climber && climber.move >= 2) return `${climber.username} remonte de ${climber.move} places.`
  const gap = leader.score - rows[1].score
  if (gap === 1) return `${rows[1].username} n'est qu'à 1 point de ${leader.username}.`
  if (gap === 0 && leader.score > 0) return `${leader.username} et ${rows[1].username} sont à égalité.`
  return null
}

/** « 1er », « 2e »… */
export function placeLabel(rank: number): string {
  return rank === 0 ? "1er" : `${rank + 1}e`
}

/** Couleur stable d'un joueur sans photo (fond et texte lisible dessus), jetons du theme. */
const TONES: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "rgb(var(--c-terra))", fg: "rgb(var(--c-on-ink))" },
  { bg: "rgb(var(--c-acier))", fg: "rgb(var(--c-on-ink))" },
  { bg: "rgb(var(--c-gold))", fg: "rgb(var(--c-on-accent))" },
  { bg: "rgb(var(--c-sage))", fg: "rgb(var(--c-on-accent))" },
  { bg: "rgb(var(--c-rouge))", fg: "rgb(var(--c-on-ink))" },
  { bg: "rgb(var(--c-ambre))", fg: "rgb(var(--c-on-accent))" },
  { bg: "rgb(var(--c-ink))", fg: "rgb(var(--c-paper))" },
  { bg: "rgb(var(--c-vermillon))", fg: "rgb(var(--c-on-ink))" },
]

export function playerTone(userId: number): { background: string; color: string } {
  const tone = TONES[Math.abs(userId) % TONES.length]
  return { background: tone.bg, color: tone.fg }
}
