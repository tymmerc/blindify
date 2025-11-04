export interface AuthenticatedUser {
  id: number
  spotify_id: string
  username: string | null
  email: string | null
  access_token: string | null
  refresh_token: string | null
  level: number
  xp: number
}
