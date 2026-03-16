import { API_BASE_URL } from "./config"
import type {
  GameSessionSummary,
  MultiplayerParticipant,
  MultiplayerRoom,
  ProviderConnectionSummary,
  RoomInvitation,
  RoomSelfPreference,
  SoloGameResponse,
  SoloTrack,
  UserSummary,
} from "./types"

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = "ApiError"
  }
}

function buildUrl(path: string): string {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`
  }
  return `${API_BASE_URL}${path}`
}

type ApiEnvelope<T> = {
  success: boolean
  data: T | null
  error: { code: string; message: string; details?: unknown } | null
}

type RawInvitation = {
  id: number
  room_id?: number | null
  roomId?: number | null
  room_code?: string
  roomCode?: string
  from_user?: number
  fromUser?: number
  to_user?: number
  toUser?: number
  status: RoomInvitation["status"]
  expires_at?: string
  expiresAt?: string
  created_at?: string
  createdAt?: string
  from_username?: string | null
  fromUsername?: string | null
  from_avatar?: string | null
  fromAvatar?: string | null
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError(response.status, "Invalid JSON response")
  }
}

function normalizeInvitation(raw: RawInvitation): RoomInvitation {
  return {
    id: raw.id,
    roomId: raw.room_id ?? raw.roomId ?? null,
    roomCode: raw.room_code ?? raw.roomCode ?? "",
    fromUser: raw.from_user ?? raw.fromUser ?? 0,
    toUser: raw.to_user ?? raw.toUser ?? 0,
    status: raw.status,
    expiresAt: raw.expires_at ?? raw.expiresAt ?? new Date().toISOString(),
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    fromUsername: raw.from_username ?? raw.fromUsername ?? null,
    fromAvatar: raw.from_avatar ?? raw.fromAvatar ?? null,
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = response.statusText || "API request failed"
    try {
      const errorPayload = await response.json() as ApiEnvelope<unknown>
      if (errorPayload && errorPayload.error) {
        message = errorPayload.error.message || message
        if (errorPayload.error.details && typeof errorPayload.error.details === "string") {
          message = `${message}: ${errorPayload.error.details}`
        }
      }
    } catch {
      // ignore json parsing issue, keep default message
    }
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = await parseJson<ApiEnvelope<T>>(response)

  if (!payload.success) {
    const message = payload.error?.message ?? "API request failed"
    throw new ApiError(response.status, message)
  }

  return (payload.data ?? ({} as T))
}

export const clientApi = {
  async register(username: string, password: string): Promise<{ user: UserSummary; sessionToken: string }> {
    return request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
  },
  async login(username: string, password: string): Promise<{ user: UserSummary; sessionToken: string }> {
    return request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
  },
  async currentUser(): Promise<{ user: UserSummary; providerConnection: ProviderConnectionSummary | null } | null> {
    try {
      return await request<{ user: UserSummary; providerConnection: ProviderConnectionSummary | null }>(
        "/api/auth/me",
        { cache: "no-store" }
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return null
      }
      throw err
    }
  },
  async startSoloGame(options: {
    difficulty?: "easy" | "normal" | "hard"
    source?: string
    playlistId?: string
    count?: number
    provider?: string
  } = {}): Promise<SoloGameResponse> {
    return request<SoloGameResponse>("/api/games/solo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        difficulty: options.difficulty ?? "normal",
        source: options.source ?? "library",
        count: options.count ?? 10,
        playlistId: options.playlistId,
        provider: options.provider,
      }),
    })
  },
  async recordSoloResult(payload: { sessionId: number; rounds: number; correct: number; bestStreak: number }) {
    await request("/api/games/solo/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  },
  async addLike(audioSourceId: string): Promise<void> {
    await request("/api/likes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio_source_id: audioSourceId }),
    })
  },
  async createRoom(options: {
    name?: string
    difficulty?: "easy" | "normal" | "hard"
    maxPlayers?: number
    questionCount?: number
    autoAdvance?: boolean
  } = {}): Promise<{ room: MultiplayerRoom }> {
    return request<{ room: MultiplayerRoom }>("/api/rooms/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    })
  },
  async joinRoom(code: string): Promise<{ room: MultiplayerRoom }> {
    return request<{ room: MultiplayerRoom }>(`/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
  },
  async roomDetails(code: string): Promise<{ room: MultiplayerRoom; participants: MultiplayerParticipant[]; selfPreference: RoomSelfPreference }> {
    return request<{ room: MultiplayerRoom; participants: MultiplayerParticipant[]; selfPreference: RoomSelfPreference }>(`/api/rooms/${code}`, {
      method: "GET",
    })
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
    gameState?: unknown
  }> {
    return request(`/api/rooms/${code}/state`, { method: "GET" })
  },
  async setRoomPreference(code: string, payload: { source: string; playlistId?: string | null }) {
    return request(`/api/rooms/${code}/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  },
  async startMultiplayerGame(
    code: string,
    payload: { provider?: string; source?: string; playlistId?: string; autoAdvance?: boolean } = {}
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
    gameState?: unknown
  }> {
    return request<{
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
      gameState?: unknown
    }>(`/api/rooms/${code}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  },
  async friends(): Promise<{
    friends: import("./types").FriendEntry[]
    incoming: import("./types").FriendEntry[]
    outgoing: import("./types").FriendEntry[]
  }> {
    return request("/api/friends", { method: "GET" })
  },
  async requestFriend(username: string): Promise<{ friendship: import("./types").FriendEntry; autoAccepted?: boolean }> {
    return request("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    })
  },
  async acceptFriend(userId: number): Promise<{ friendship: import("./types").FriendEntry }> {
    return request(`/api/friends/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
  },
  async removeFriend(userId: number): Promise<{ removed: boolean }> {
    return request(`/api/friends/${userId}`, { method: "DELETE" })
  },
  async declineFriend(userId: number): Promise<{ declined: boolean }> {
    return request("/api/friends/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
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
    return request("/api/friends/activity", { cache: "no-store" })
  },
  async pendingInvitations(): Promise<{ invitations: RoomInvitation[] }> {
    const res = await request<{ invitations: RawInvitation[] }>("/api/invitations/pending", {
      method: "GET",
      cache: "no-store",
    })
    return { invitations: (res.invitations ?? []).map(normalizeInvitation) }
  },
  async sendInvitation(toUserId: number, roomCode: string): Promise<{ invitation: RoomInvitation }> {
    const res = await request<{ invitation: RawInvitation }>("/api/invitations/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, roomCode }),
    })
    return { invitation: normalizeInvitation(res.invitation) }
  },
  async acceptInvitation(
    invitationId: number
  ): Promise<{ invitation: RoomInvitation; room: MultiplayerRoom; joined: boolean }> {
    const res = await request<{ invitation: RawInvitation; room: MultiplayerRoom; joined: boolean }>(
      "/api/invitations/accept",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      }
    )
    return {
      invitation: normalizeInvitation(res.invitation),
      room: res.room,
      joined: res.joined,
    }
  },
  async declineInvitation(invitationId: number): Promise<{ declined: boolean }> {
    return request("/api/invitations/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    })
  },
  async logout(): Promise<void> {
    await request("/api/auth/logout", {
      method: "POST",
    })
  },
  async createGuestSession(nickname?: string): Promise<{ sessionToken: string }> {
    return request<{ sessionToken: string }>("/api/auth/guest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nickname }),
    })
  },
  async detailedStats(): Promise<{
    stats: {
      totalGames: number
      accuracyRate: number
      averageReactionTime: number
      bestStreak: number
      totalXp: number
      lastPlayedAt: string | null
    }
  }> {
    return request("/api/stats/detailed")
  },
  async gameHistory(): Promise<{ sessions: GameSessionSummary[] }> {
    return request("/api/games/history")
  },
  async importPlaylists(url: string): Promise<{
    provider: "spotify" | "deezer"
    type: "user" | "playlist"
    playlists: Array<{ id: string; name: string; trackCount: number; cover: string | null }>
    notice: string
  }> {
    return request("/api/import/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
  },
  async importSync(provider: string, playlistId: string): Promise<{ synced: number; failed: number }> {
    return request("/api/import/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, playlistId }),
    })
  },
  async importSyncAll(provider: string, playlistIds: string[]): Promise<{ synced: number; failed: number; total: number }> {
    return request("/api/import/sync-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, playlistIds }),
    })
  },
  async quickPlay(url: string, count?: number): Promise<{
    session: { id: number; mode: string; difficulty: string; provider: string; totalRounds: number; startedAt: string }
    tracks: Array<{ round: number; audioSourceId: string; type: string; track_id: string; title: string; artist: string; album_cover: string | null; audio_url: string; metadata: Record<string, unknown> }>
    profileInfo: { provider: string; playlistCount: number; totalTracks: number }
  }> {
    return request("/api/quick-play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, count }),
    })
  },
}

export type ClientApi = typeof clientApi
