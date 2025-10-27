const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://blindify-production.up.railway.app"

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("spotify_access_token") : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = {
  getLoginUrl() {
    return `${API_URL}/auth/login`
  },

  async checkAuth() {
    try {
      const r = await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders(), credentials: "include" })
      if (!r.ok) return null
      return await r.json()
    } catch {
      return null
    }
  },

  async startSoloGame(params: { 
    difficulty?: "easy" | "normal" | "hard", 
    source?: string,
    sourceId?: string | null,
    mood?: string,
    count?: number 
  } = {}) {
    const r = await fetch(`${API_URL}/api/games/solo/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(params),
    })
    if (!r.ok) throw new Error("Failed to start game")
    return r.json()
  },

  async submitAnswer(data: {
    sessionId: number,
    trackId: string,
    userAnswer: string,
    correctAnswer: string,
    responseTimeMs: number,
    questionNumber: number,
    hintUsed?: boolean,
    skipped?: boolean
  }) {
    const r = await fetch(`${API_URL}/api/games/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(data),
    })
    if (!r.ok) throw new Error("Failed to submit answer")
    return r.json()
  },

  async completeGame(sessionId: number) {
    const r = await fetch(`${API_URL}/api/games/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ sessionId }),
    })
    if (!r.ok) throw new Error("Failed to complete game")
    return r.json()
  },

  async likeTrack(trackId: string) {
    const r = await fetch(`${API_URL}/api/tracks/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ trackId }),
    })
    if (!r.ok) throw new Error("Failed to like track")
    return r.json()
  },

  async getPlaylists() {
    const r = await fetch(`${API_URL}/api/sources/playlists`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch playlists")
    return r.json()
  },

  async getTopTracks(timeRange: "short_term" | "medium_term" | "long_term" = "medium_term") {
    const r = await fetch(`${API_URL}/api/sources/top-tracks?time_range=${timeRange}`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch top tracks")
    return r.json()
  },

  async getRecentlyPlayed() {
    const r = await fetch(`${API_URL}/api/sources/recently-played`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch recently played")
    return r.json()
  },

  async getAIRecommendations(mood: string = "balanced", count: number = 20) {
    const r = await fetch(`${API_URL}/api/sources/ai-recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ mood, count }),
    })
    if (!r.ok) throw new Error("Failed to get AI recommendations")
    return r.json()
  },

  async getProfile() {
    const r = await fetch(`${API_URL}/api/user/profile`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) return null
    return r.json()
  },

  async getLeaderboard() {
    const r = await fetch(`${API_URL}/api/stats/leaderboard`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch leaderboard")
    return r.json()
  },

  async getHistory() {
    const r = await fetch(`${API_URL}/api/games/history`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch history")
    return r.json()
  },

  async createRoom(settings: { name: string; maxPlayers: number; questionCount: number }) {
    const r = await fetch(`${API_URL}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(settings),
    })
    if (!r.ok) throw new Error("Create room failed")
    return r.json()
  },

  async joinRoom(code: string) {
    const r = await fetch(`${API_URL}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ code }),
    })
    if (!r.ok) throw new Error("Join room failed")
    return r.json()
  },

  async leaveRoom(roomId: string) {
    const r = await fetch(`${API_URL}/api/rooms/${roomId}/leave`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Leave room failed")
    return r.json()
  },

  async startMultiplayerGame(roomId: string) {
    const r = await fetch(`${API_URL}/api/rooms/${roomId}/start`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Start multiplayer failed")
    return r.json()
  },
}

export default api