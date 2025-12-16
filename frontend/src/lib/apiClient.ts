import { API_BASE_URL } from "./config"
import type {
  GameSessionSummary,
  MultiplayerParticipant,
  MultiplayerRoom,
  ProviderConnectionSummary,
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

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getCookie("blindify_session_token")
  const response = await fetch(buildUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init?.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
  getLoginUrl() {
    return buildUrl("/auth/login")
  },
  getProviderLoginUrl(provider: string) {
    const sanitized = provider.trim().toLowerCase()
    if (!sanitized) {
      return buildUrl("/auth/login")
    }
    return buildUrl(`/auth/${sanitized}/login`)
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
  async spotifyToken(): Promise<{ accessToken: string; expiresAt: string | null; provider: string }> {
    return request<{ accessToken: string; expiresAt: string | null; provider: string }>(
      "/api/auth/providers/spotify/token"
    )
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
    return request(`/api/friends/${userId}/accept`, { method: "POST" })
  },
  async removeFriend(userId: number): Promise<{ removed: boolean }> {
    return request(`/api/friends/${userId}`, { method: "DELETE" })
  },
  async logout(): Promise<void> {
    await request("/api/auth/logout", {
      method: "POST",
    })
    if (typeof document !== "undefined") {
      document.cookie = "blindify_session_token=; Path=/; Max-Age=0; Secure; SameSite=Lax"
    }
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
}

export type ClientApi = typeof clientApi
