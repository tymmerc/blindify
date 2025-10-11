const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
console.log("[v0] API_URL initialized:", API_URL)

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("spotify_access_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = {
  async checkAuth() {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error("Auth check failed:", error)
      return null
    }
  },

  async importTracks() {
    try {
      const response = await fetch(`${API_URL}/api/user/tracks`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) throw new Error("Failed to import tracks")
      return await response.json()
    } catch (error) {
      console.error("Import tracks failed:", error)
      throw error
    }
  },

  async importAllTracks(onProgress?: (current: number, total: number) => void) {
    try {
      let allTracks: Array<{
        id: string
        name: string
        artist: string
        preview_url: string
        album_image: string
      }> = []
      let offset = 0
      const limit = 50
      let hasMore = true

      while (hasMore) {
        const response = await fetch(`${API_URL}/api/user/tracks?offset=${offset}&limit=${limit}`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) throw new Error("Failed to import tracks")
        const data = await response.json()

        allTracks = [...allTracks, ...(data.tracks || [])]
        offset += limit
        hasMore = data.hasMore || false

        if (onProgress) {
          onProgress(allTracks.length, data.total || allTracks.length)
        }
      }

      return { tracks: allTracks, total: allTracks.length }
    } catch (error) {
      console.error("Import all tracks failed:", error)
      throw error
    }
  },

  async startSoloGame(difficulty: "easy" | "normal" | "hard" = "normal") {
    try {
      const response = await fetch(`${API_URL}/api/games/solo/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ difficulty }),
      })

      if (!response.ok) throw new Error("Failed to start game")
      return await response.json()
    } catch (error) {
      console.error("Start game failed:", error)
      throw error
    }
  },

  async createRoom(settings: { name: string; maxPlayers: number; questionCount: number }) {
    try {
      const response = await fetch(`${API_URL}/api/rooms/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(settings),
      })

      if (!response.ok) throw new Error("Failed to create room")
      return await response.json()
    } catch (error) {
      console.error("Create room failed:", error)
      throw error
    }
  },

  async joinRoom(code: string) {
    try {
      const response = await fetch(`${API_URL}/api/rooms/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ code }),
      })

      if (!response.ok) throw new Error("Failed to join room")
      return await response.json()
    } catch (error) {
      console.error("Join room failed:", error)
      throw error
    }
  },

  async leaveRoom(roomId: string) {
    try {
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/leave`, {
        method: "POST",
        headers: getAuthHeaders(),
      })

      if (!response.ok) throw new Error("Failed to leave room")
      return await response.json()
    } catch (error) {
      console.error("Leave room failed:", error)
      throw error
    }
  },

  async startMultiplayerGame(roomId: string) {
    try {
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: getAuthHeaders(),
      })

      if (!response.ok) throw new Error("Failed to start game")
      return await response.json()
    } catch (error) {
      console.error("Start multiplayer game failed:", error)
      throw error
    }
  },

  async getHistory() {
    try {
      const response = await fetch(`${API_URL}/api/games/history`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) throw new Error("Failed to fetch history")
      return await response.json()
    } catch (error) {
      console.error("Get history failed:", error)
      throw error
    }
  },

  async getDetailedStats() {
    try {
      const response = await fetch(`${API_URL}/api/stats/detailed`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) throw new Error("Failed to fetch detailed stats")
      return await response.json()
    } catch (error) {
      console.error("Get detailed stats failed:", error)
      throw error
    }
  },

  async markTracksAsPlayed(trackIds: string[]) {
    try {
      const response = await fetch(`${API_URL}/api/user/tracks/played`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ trackIds }),
      })

      if (!response.ok) throw new Error("Failed to mark tracks as played")
      return await response.json()
    } catch (error) {
      console.error("Mark tracks as played failed:", error)
      throw error
    }
  },

  getLoginUrl() {
    return `${API_URL}/auth/login`
  },
}

export default api
