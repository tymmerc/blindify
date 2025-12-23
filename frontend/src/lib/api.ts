import { clientApi } from "./apiClient"
import type {
  MusicProvider,
  MultiplayerParticipant,
  MultiplayerRoom,
  MultiplayerGameState,
  FriendEntry,
  ProviderConnectionSummary,
  RoomInvitation,
  RoomSelfPreference,
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
  async ensureUserSession(nickname?: string): Promise<CurrentUserPayload | null> {
    try {
      const existing = await clientApi.currentUser()
      if (existing) return existing
    } catch (err) {
      console.error("ensure_session_check_failed", err)
    }

    try {
      const { sessionToken } = await clientApi.createGuestSession(nickname)
      setSessionCookie(sessionToken, 60 * 60 * 4)
      return await clientApi.currentUser()
    } catch (err) {
      console.error("ensure_guest_session_failed", err)
      return null
    }
  },
  async startSoloGame(params: {
    difficulty?: "easy" | "normal" | "hard"
    source?: string
    playlistId?: string
    count?: number
    provider?: string
  } = {}): Promise<SoloGameResponse> {
    return clientApi.startSoloGame(params)
  },
  async recordSoloResult(payload: { sessionId: number; rounds: number; correct: number; bestStreak: number }) {
    return clientApi.recordSoloResult(payload)
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
    autoAdvance?: boolean
  }): Promise<{ room: MultiplayerRoom }> {
    return clientApi.createRoom(options)
  },
  async joinRoom(code: string): Promise<{ room: MultiplayerRoom }> {
    return clientApi.joinRoom(code)
  },
  async roomDetails(code: string): Promise<{ room: MultiplayerRoom; participants: MultiplayerParticipant[]; selfPreference: RoomSelfPreference }> {
    return clientApi.roomDetails(code)
  },
  async roomState(code: string): Promise<{
    room: MultiplayerRoom
    session: {
      id: number
      mode: string
      difficulty: string
      provider: string
      totalRounds: number
      startedAt: string
      roomCode: string
      currentRound?: number | null
      autoAdvance?: boolean
    } | null
    tracks: SoloTrack[]
    gameState?: MultiplayerGameState | null
  }> {
    return clientApi.roomState(code) as Promise<{
      room: MultiplayerRoom
      session: {
        id: number
        mode: string
        difficulty: string
        provider: string
        totalRounds: number
        startedAt: string
        roomCode: string
        currentRound?: number | null
        autoAdvance?: boolean
      } | null
      tracks: SoloTrack[]
      gameState?: MultiplayerGameState | null
    }>
  },
  async setRoomPreference(code: string, payload: { source: string; playlistId?: string | null }) {
    return clientApi.setRoomPreference(code, payload)
  },
  async startMultiplayerGame(
    code: string,
    payload?: { provider?: string; source?: string; playlistId?: string; autoAdvance?: boolean }
  ): Promise<{
    session: {
      id: number
      mode: string
      difficulty: string
      provider: string
      totalRounds: number
      startedAt: string
      roomCode: string
      autoAdvance?: boolean
    }
    tracks: SoloTrack[]
    gameState?: MultiplayerGameState
  }> {
    return clientApi.startMultiplayerGame(code, payload) as Promise<{
      session: {
        id: number
        mode: string
        difficulty: string
        provider: string
        totalRounds: number
        startedAt: string
        roomCode: string
        autoAdvance?: boolean
      }
      tracks: SoloTrack[]
      gameState?: MultiplayerGameState
    }>
  },
  async listFriends(): Promise<{
    friends: FriendEntry[]
    incoming: FriendEntry[]
    outgoing: FriendEntry[]
  }> {
    return clientApi.friends()
  },
  async requestFriend(username: string): Promise<{ friendship: FriendEntry; autoAccepted?: boolean }> {
    return clientApi.requestFriend(username)
  },
  async acceptFriend(userId: number): Promise<{ friendship: FriendEntry }> {
    return clientApi.acceptFriend(userId)
  },
  async declineFriend(userId: number): Promise<{ declined: boolean }> {
    return clientApi.declineFriend(userId)
  },
  async removeFriend(userId: number): Promise<{ removed: boolean }> {
    return clientApi.removeFriend(userId)
  },
  async friendsActivity(): Promise<{
    friends: Array<{
      userId: number
      username: string | null
      online: boolean
      activity: "idle" | "playing" | "hosting" | "spectating"
      context?: { type: "room" | "event"; id: string } | null
      roomCode: string | null
      state: string
      updatedAt: number
    }>
  }> {
    return clientApi.friendsActivity()
  },
  async listInvitations(): Promise<{ invitations: RoomInvitation[] }> {
    return clientApi.pendingInvitations()
  },
  async sendInvitation(toUserId: number, roomCode: string): Promise<{ invitation: RoomInvitation }> {
    return clientApi.sendInvitation(toUserId, roomCode)
  },
  async acceptInvitation(
    invitationId: number
  ): Promise<{ invitation: RoomInvitation; room: MultiplayerRoom; joined: boolean }> {
    return clientApi.acceptInvitation(invitationId)
  },
  async declineInvitation(invitationId: number): Promise<{ declined: boolean }> {
    return clientApi.declineInvitation(invitationId)
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
  async gameHistory() {
    return clientApi.gameHistory()
  },
  setSessionCookie,
  clearSessionCookie,
}
