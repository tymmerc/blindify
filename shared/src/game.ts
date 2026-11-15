/**
 * Canonical game types shared between Blindify backend and frontend.
 *
 * Use string literal unions (not enums) so payloads serialize cleanly over JSON
 * and socket.io events are type-safe at compile time.
 */

export type GameMode = "friends" | "event" | "streamer"

export type GamePhase = "LOBBY" | "GUESSING" | "REVEAL" | "FINISHED"

export type Verdict = "correct" | "close" | "wrong"

export interface RoundTrack {
  round: number
  trackId: string
  audioSourceId?: string | number
  title: string
  artist: string
  album?: string | null
  previewUrl: string | null
  albumCover?: string | null
  metadata?: Record<string, unknown> | null
  ownerChoices?: number[]
  /** Source du morceau (spotify, deezer...). Absente pendant la manche : seulement au reveal. */
  provider?: string | null
}

export interface PlayerState {
  userId: number
  username: string | null
  avatar?: string | null
  score: number
  hasAnswered: boolean
  isReady: boolean
  disconnected?: boolean
  lastGuess?: string
  lastGuessTitle?: string | null
  lastGuessArtist?: string | null
  lastSourceGuess?: number | null
  lastVerdict?: Verdict
  /** Au reveal (T38) : le titre, l'artiste, le « de qui » de sa reponse etaient-ils justes ? */
  lastTitleOk?: boolean
  lastArtistOk?: boolean
  lastOwnerOk?: boolean
  answerAt?: number | null
  lastGained?: number
  totalReactionMs?: number
  accuracy?: number
  rounds?: number
  correct?: number
  streak?: number
  bestStreak?: number
  /** Absent (T22) : aucune reponse depuis 3 manches. Reste au classement, marque. */
  absent?: boolean
  /** Manches ou il a vraiment repondu (« Je sais pas » compris). */
  answeredRounds?: number
}

export interface GameTiming {
  startAt: number | null
  revealAt: number | null
}

export interface GameConfig {
  autoAdvance: boolean
  roundDurationMs: number
}

/**
 * Joueur arrive pendant une partie (T19) : il regarde, puis joue a partir de
 * la manche suivante. Jamais dans `players` tant qu'il attend.
 */
export interface WaitingPlayer {
  userId: number
  username: string | null
}

/**
 * Partie en veille (T22) : plus aucun joueur connecte (« empty »), ou personne
 * n'a repondu depuis 3 manches (« silent »). En pause, elle s'arrete d'elle-meme
 * a `stopAt` (heure serveur, ms) si personne ne revient.
 */
export interface IdlePause {
  reason: "empty" | "silent"
  stopAt: number
}

/**
 * Les deux ecrans de la phase REVEAL (T38) : la reponse, puis le classement.
 * Le 3-2-1 qui suit est le debut de la manche suivante (startAt dans le futur).
 */
export type RevealStep = "answer" | "scores"

/** Ecran en cours du reveal et heure serveur (ms) de sa fin. */
export interface RoundPacing {
  step: RevealStep
  endsAt: number
  /** Duree de l'ecran (ms), pour la barre qui se vide. */
  ms: number
}

export interface GameState {
  roomCode: string
  hostUserId: number | null
  hostPlays?: boolean
  singleContributor?: boolean
  mode: GameMode
  phase: GamePhase
  currentRound: number
  totalRounds: number
  currentTrack: RoundTrack | null
  players: Record<number, PlayerState>
  /** Arrives en cours de partie, en attente de la manche suivante. */
  waiting?: WaitingPlayer[]
  /** Partie mise en pause par l'hote (timers geles cote serveur). */
  paused?: boolean
  /** Pause de veille posee par le serveur (T22) ; null sinon. */
  idle?: IdlePause | null
  /** Absents de la partie d'avant, pas repris dans celle-ci (T22). */
  absentees?: WaitingPlayer[]
  /** Ecran en cours du reveal (T38) ; null hors REVEAL. */
  pacing?: RoundPacing | null
  timing: GameTiming
  config: GameConfig
}

/**
 * Mode constants (avoid magic strings without forcing enum semantics).
 */
export const MODES = {
  FRIENDS: "friends",
  EVENT: "event",
  STREAMER: "streamer",
} as const satisfies Record<string, GameMode>

export const PHASES = {
  LOBBY: "LOBBY",
  GUESSING: "GUESSING",
  REVEAL: "REVEAL",
  FINISHED: "FINISHED",
} as const satisfies Record<string, GamePhase>
