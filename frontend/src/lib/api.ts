import { clientApi } from "./apiClient"
import type {
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

export const api = {
  async register(username: string, password: string): Promise<{ user: UserSummary; sessionToken: string }> {
    return clientApi.register(username, password)
  },
  async login(username: string, password: string): Promise<{ user: UserSummary; sessionToken: string }> {
    return clientApi.login(username, password)
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
      await clientApi.createGuestSession(nickname)
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
  async createRoom(options?: {
    name?: string
    difficulty?: "easy" | "normal" | "hard"
    maxPlayers?: number
    questionCount?: number
    autoAdvance?: boolean
    nickname?: string
    mode?: "friends" | "event" | "streamer"
    hostPlays?: boolean
  }): Promise<{ room: MultiplayerRoom }> {
    return clientApi.createRoom(options)
  },
  async joinRoom(code: string, nickname?: string): Promise<{ room: MultiplayerRoom }> {
    return clientApi.joinRoom(code, nickname)
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
  async roomRounds(code: string) {
    return clientApi.roomRounds(code)
  },
  async updateRoomConfig(code: string, payload: { questionCount?: number; roundSeconds?: number }) {
    return clientApi.updateRoomConfig(code, payload)
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
  async recentPlayers(): Promise<{ players: Array<{ userId: number; username: string | null; lastPlayed: string }> }> {
    return clientApi.recentPlayers()
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
  },
  async deleteAccount(): Promise<void> {
    await clientApi.deleteAccount()
  },
  async startGuestSession(nickname?: string): Promise<void> {
    await clientApi.createGuestSession(nickname)
  },
  async reportBug(message: string, pageUrl?: string) {
    return clientApi.reportBug(message, pageUrl)
  },
  async detailedStats() {
    return clientApi.detailedStats()
  },
  async gameHistory() {
    return clientApi.gameHistory()
  },
  async gameHistoryDetailed() {
    return clientApi.gameHistoryDetailed()
  },
  async importPlaylists(url: string) {
    return clientApi.importPlaylists(url)
  },
  async importSync(provider: string, playlistId: string) {
    return clientApi.importSync(provider, playlistId)
  },
  async importSyncAll(provider: string, playlistIds: string[], maxTracksPerPlaylist?: number) {
    return clientApi.importSyncAll(provider, playlistIds, maxTracksPerPlaylist)
  },
  async quickPlay(url: string, count?: number) {
    return clientApi.quickPlay(url, count)
  },
  async createChallenge(data: {
    tracks: SoloTrack[]
    creatorName: string
    score: number
    correct: number
    total: number
    bestStreak: number
  }) {
    return clientApi.createChallenge(data)
  },
  async getChallenge(code: string) {
    return clientApi.getChallenge(code)
  },
  async completeChallenge(code: string, data: {
    playerName: string
    score: number
    correct: number
    total: number
    bestStreak: number
  }) {
    return clientApi.completeChallenge(code, data)
  },
}
