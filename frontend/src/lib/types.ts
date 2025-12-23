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
  accuracy: number
  rounds: number
  correct: number
  streak: number
  bestStreak: number
  hasAnswered: boolean
  isReady: boolean
  lastGuess?: string
  lastSourceGuess?: number | null
  lastVerdict?: "correct" | "close" | "wrong"
}

export type MultiplayerGameState = {
  roomCode: string
  hostUserId: number | null
  status: "lobby" | "playing" | "reveal" | "finished"
  currentRound: number
  totalRounds: number
  currentTrack: {
    round: number
    trackId: string
    audioSourceId?: string | number
    title: string
    artist: string
    previewUrl: string | null
    albumCover?: string | null
    metadata?: Record<string, unknown> | null
  } | null
  timing: {
    startAt: number | null
    revealAt: number | null
  }
  players: Record<number, MultiplayerPlayerState>
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
