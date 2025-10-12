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

  async startSoloGame(difficulty: "easy" | "normal" | "hard" = "normal") {
    const r = await fetch(`${API_URL}/api/games/solo/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ difficulty }),
    })
    if (!r.ok) throw new Error("Failed to start game")
    return r.json()
  },

  async markTracksAsPlayed(trackIds: string[]) {
    const r = await fetch(`${API_URL}/api/user/tracks/played`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ trackIds }),
    })
    if (!r.ok) throw new Error("Failed to mark tracks as played")
    return r.json()
  },

  async importAllTracks() {
    const r = await fetch(`${API_URL}/api/user/tracks`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Import failed")
    return r.json()
  },

  async getDetailedStats() {
    const r = await fetch(`${API_URL}/api/stats/detailed`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Stats failed")
    return r.json()
  },

  async getHistory() {
    const r = await fetch(`${API_URL}/api/games/history`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("History failed")
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
