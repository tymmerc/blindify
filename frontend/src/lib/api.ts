import { clientApi } from "./apiClient"
import type {
  MusicProvider,
  MultiplayerParticipant,
  MultiplayerRoom,
  ProviderConnectionSummary,
  SoloGameResponse,
  SoloTrack,
  UserSummary,
} from "./types"

export type CurrentUserPayload = {
  user: UserSummary
  providerConnection: ProviderConnectionSummary | null
}

function setSessionCookie(token: string, maxAgeSeconds = 60 * 60 * 24) {
  if (typeof document === "undefined") return
  const maxAge = Math.max(60, Math.floor(maxAgeSeconds))
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:"
  const sameSite = isHttps ? "None" : "Lax"
  const secureFlag = isHttps ? "; Secure" : ""
  document.cookie = `blindify_session_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${secureFlag}`
}

function clearSessionCookie() {
  if (typeof document === "undefined") return
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:"
  const sameSite = isHttps ? "None" : "Lax"
  const secureFlag = isHttps ? "; Secure" : ""
  document.cookie = `blindify_session_token=; Path=/; Max-Age=0; SameSite=${sameSite}${secureFlag}`
}

export const api = {
  getLoginUrl(): string {
    return clientApi.getLoginUrl()
  },
  getProviderLoginUrl(provider: string): string {
    return clientApi.getProviderLoginUrl(provider)
  },
  async checkAuth(): Promise<CurrentUserPayload | null> {
    return clientApi.currentUser()
  },
  async startSoloGame(params: {
    difficulty?: "easy" | "normal" | "hard"
    source?: string
    count?: number
    provider?: string
  } = {}): Promise<SoloGameResponse> {
    return clientApi.startSoloGame(params)
  },
  async addLike(_userId: number | null | undefined, audioSourceId: string): Promise<void> {
    return clientApi.addLike(audioSourceId)
  },
  async getSpotifyToken(): Promise<{ accessToken: string; expiresAt: string | null; provider: MusicProvider }> {
    return clientApi.spotifyToken() as Promise<{ accessToken: string; expiresAt: string | null; provider: MusicProvider }>
  },
  async createRoom(options?: {
    name?: string
    difficulty?: "easy" | "normal" | "hard"
    maxPlayers?: number
    questionCount?: number
  }): Promise<{ room: MultiplayerRoom }> {
    return clientApi.createRoom(options)
  },
  async joinRoom(code: string): Promise<{ room: MultiplayerRoom }> {
    return clientApi.joinRoom(code)
  },
  async roomDetails(code: string): Promise<{ room: MultiplayerRoom; participants: MultiplayerParticipant[] }> {
    return clientApi.roomDetails(code)
  },
  async startMultiplayerGame(code: string, payload?: { provider?: string }): Promise<{
    session: {
      id: number
      mode: string
      difficulty: string
      provider: string
      totalRounds: number
      startedAt: string
      roomCode: string
    }
    tracks: SoloTrack[]
  }> {
    return clientApi.startMultiplayerGame(code, payload)
  },
  async logout(): Promise<void> {
    await clientApi.logout()
    clearSessionCookie()
  },
  async startGuestSession(nickname?: string): Promise<void> {
    const { sessionToken } = await clientApi.createGuestSession(nickname)
    setSessionCookie(sessionToken, 60 * 60 * 4)
  },
  async detailedStats() {
    return clientApi.detailedStats()
  },
  setSessionCookie,
  clearSessionCookie,
}
