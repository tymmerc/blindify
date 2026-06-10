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
}

export type MultiplayerParticipant = {
  user_id: number
  username: string | null
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
  accuracy?: number
  rounds?: number
  correct?: number
  streak?: number
  bestStreak?: number
}

export type MultiplayerGameState = {
  roomCode: string
  hostUserId: number | null
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
  } | null
  players: Record<number, MultiplayerPlayerState>
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
  mode: GameMode
  phase: GamePhase
  currentRound: number
  totalRounds: number
  currentTrack: RoundTrack | null
  players: Record<number, PlayerState>
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
