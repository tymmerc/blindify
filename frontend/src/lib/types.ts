export type MusicProvider = "spotify" | "deezer" | "apple" | "local" | "guest"

export type PresenceContext = { type: "room" | "event"; id: string }

export type FriendPresence = {
  online: boolean
  activity: "idle" | "playing" | "hosting" | "spectating"
  context?: PresenceContext | null
  status: "online" | "offline" | "playing" // legacy, derived server-side
  roomCode: string | null // legacy, derived from context
  updatedAt: number
}

export type UserSummary = {
  id: number
  provider: MusicProvider
  provider_id: string
  username: string | null
  email: string | null
  avatar: string | null
}

export type ProviderConnectionSummary = {
  id: number
  provider: MusicProvider
  expires_at: string | null
  scope: string[] | null
}

export type SoloTrack = {
  round: number
  audioSourceId: string
  type: MusicProvider
  track_id: string
  title: string
  artist: string
  album_cover: string | null
  audio_url: string | null
  metadata: Record<string, unknown>
}

export type SoloGameResponse = {
  session: {
    id: number
    mode: string
    difficulty: string
    provider: MusicProvider
    totalRounds: number
    startedAt: string
  }
  tracks: SoloTrack[]
}

export type UserStats = {
  totalGames: number
  accuracyRate: number
  averageReactionTime: number
  bestStreak: number
  totalXp: number
  lastPlayedAt: string | null
}

export type GameSessionSummary = {
  id: number
  mode: string
  difficulty: string
  source_provider: MusicProvider | string
  total_rounds: number
  started_at: string
  ended_at: string | null
  state: string
}

export type GameHistoryTrack = {
  title: string
  artist: string
  album_cover: string | null
}

export type GameHistoryEntry = {
  id: number
  mode: string
  difficulty: string
  state: string
  totalRounds: number
  createdAt: string
  score: number
  correct: number
  bestStreak: number
  tracks: GameHistoryTrack[]
}

export type MultiplayerRoom = {
  id: number
  room_code: string
  host_user_id: number
  status: string
  max_players: number
  question_count: number
  difficulty: string
  session_id?: number | null
  auto_advance?: boolean
  host_plays?: boolean
  round_duration_ms?: number | null
}

export type MultiplayerParticipant = {
  user_id: number
  username: string | null
  status?: "active" | "away" | "disconnected"
  /** Nombre de titres que ce joueur amene (cartes actives de sa bibliotheque). */
  track_count?: number
}

export type MultiplayerPlayerState = {
  userId: number
  username: string | null
  avatar?: string | null
  score: number
  hasAnswered: boolean
  isReady: boolean
  lastGuess?: string
  lastVerdict?: "correct" | "close" | "wrong"
  answerAt?: number | null
  lastGained?: number
  totalReactionMs?: number
  accuracy?: number
  rounds?: number
  correct?: number
  streak?: number
  bestStreak?: number
  /** Le serveur a perdu la socket de ce joueur (onglet ferme, reseau coupe). */
  disconnected?: boolean
}

export type MultiplayerGameState = {
  roomCode: string
  hostUserId: number | null
  hostPlays?: boolean
  singleContributor?: boolean
  mode: "friends" | "event" | "streamer"
  phase: "LOBBY" | "GUESSING" | "REVEAL" | "FINISHED"
  currentRound: number
  totalRounds: number
  currentTrack: {
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
  } | null
  players: Record<number, MultiplayerPlayerState>
  /** Partie mise en pause par l'hote. */
  paused?: boolean
  /** L'hote (source audio en mode event) est-il toujours connecte ? */
  hostConnected?: boolean
  timing: {
    startAt: number | null
    revealAt: number | null
  }
  config: {
    autoAdvance: boolean
    roundDurationMs: number
  }
}

// =============================================================================
// Canonical game types (mirror of /opt/blindify/shared/src/game.ts).
// MultiplayerGameState / MultiplayerPlayerState above are legacy aliases — new
// code should use GameState / PlayerState below.
// =============================================================================

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
  answerAt?: number | null
  lastGained?: number
  totalReactionMs?: number
  accuracy?: number
  rounds?: number
  correct?: number
  streak?: number
  bestStreak?: number
}

export interface GameTiming {
  startAt: number | null
  revealAt: number | null
}

export interface GameConfig {
  autoAdvance: boolean
  roundDurationMs: number
}

export interface GameState {
  roomCode: string
  hostUserId: number | null
  hostPlays?: boolean
  mode: GameMode
  phase: GamePhase
  currentRound: number
  totalRounds: number
  currentTrack: RoundTrack | null
  players: Record<number, PlayerState>
  paused?: boolean
  timing: GameTiming
  config: GameConfig
}

// =============================================================================

export type StreamerPhase =
  | "LOBBY"
  | "STARTING_ROUND"
  | "GUESSING_CHAT"
  | "REVEAL_PARTIAL"
  | "GUESSING_STREAMER"
  | "REVEAL_FINAL"
  | "ROUND_ENDED"
  | "GAME_OVER"

export type StreamerSubMode = "viewers_only" | "duo" | "solo"
export type TrackSource = "streamer" | "chat"

export type StreamerRound = {
  round: number
  trackId: string
  audioSourceId?: string | number
  title: string
  artist: string
  album?: string | null
  previewUrl: string | null
  albumCover?: string | null
  metadata?: Record<string, unknown> | null
  trackSource: TrackSource
}

export type StreamerState = {
  roomCode: string
  hostUserId: number
  subMode: StreamerSubMode
  phase: StreamerPhase
  currentRound: number
  totalRounds: number
  currentTrack: StreamerRound | null
  timing: { startAt: number | null; endAt: number | null }
  chatScore: number
  chatStreak: number
  streamerScore: number
  streamerWins: number
  chatWins: number
  chatSnapshot?: { total: number; correct: number; percentCorrect: number } | null
}

export type ImportedLink = {
  id: number
  url: string
  provider: string | null
  kind: "user" | "playlist" | "legacy" | string | null
  label: string | null
  image_url: string | null
  active: boolean
  times_played: number
  last_import_at: string
  track_count: number
}

export type LinkDetails = {
  link: { id: number; label: string | null; provider: string | null; kind: string | null }
  stats: { total: string | number; playable: string | number; artists: string | number }
  decades: Array<{ decade: number; n: string | number }>
  covers: string[]
  tracks: Array<{ title: string; artist: string }>
}

export type RoomSelfPreference = {
  source_pref: string | null
  playlist_pref: string | null
} | null

export type FriendEntry = {
  id: number
  userId: number
  username: string | null
  avatar: string | null
  provider: MusicProvider
  status: "pending" | "accepted"
  direction: "incoming" | "outgoing" | "accepted"
  createdAt: string
  presence?: FriendPresence
}

export type RoomInvitation = {
  id: number
  roomId: number | null
  roomCode: string
  fromUser: number
  toUser: number
  status: "pending" | "accepted" | "declined" | "expired"
  expiresAt: string
  createdAt: string
  fromUsername?: string | null
  fromAvatar?: string | null
}
