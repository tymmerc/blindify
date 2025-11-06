export type MusicProvider = "spotify" | "deezer" | "apple" | "local" | "guest"

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

export type MultiplayerRoom = {
  id: number
  room_code: string
  host_user_id: number
  status: string
  max_players: number
  question_count: number
  difficulty: string
  session_id?: number | null
}

export type MultiplayerParticipant = {
  user_id: number
  username: string | null
}
