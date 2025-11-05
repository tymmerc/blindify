export type UserSummary = {
  id: number
  username: string | null
  spotify_id: string
  email: string | null
}

export type SoloTrack = {
  spotify_track_id: string
  title: string
  artist: string
  preview_url: string | null
  album_cover: string | null
}

export type SoloGameResponse = {
  sessionId: number
  tracks: SoloTrack[]
  sourceUsed?: string
}
