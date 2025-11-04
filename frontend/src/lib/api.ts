// ====================================
// API CLIENT POUR BLINDIFY
// Gestion de toutes les requêtes au backend
// ====================================

// URL de l'API backend
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://blindify-production.up.railway.app"

/**
 * Génère les headers d'authentification avec le token Spotify
 */
function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("spotify_access_token") : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Client API centralisé pour toutes les interactions avec le backend
 */
export const api = {
  
  // ==================== AUTHENTIFICATION ====================
  
  /**
   * Récupère l'URL de connexion Spotify
   */
  getLoginUrl() {
    return `${API_URL}/auth/login`
  },

  /**
   * Vérifie si l'utilisateur est authentifié
   */
  async checkAuth() {
    try {
      const r = await fetch(`${API_URL}/api/auth/me`, { 
        headers: authHeaders(), 
        credentials: "include" 
      })
      if (!r.ok) return null
      return await r.json()
    } catch {
      return null
    }
  },

  // ==================== JEU SOLO ====================

  /**
   * Démarre une nouvelle partie solo
   * @param params - Paramètres de la partie (difficulté, source, etc.)
   */
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
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: "Failed to start game" }))
      throw new Error(`${r.status}: ${error.error || "Failed to start game"}`)
    }
    return r.json()
  },

  /**
   * Soumet une réponse à une question
   */
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

  /**
   * Finalise une partie et calcule les récompenses
   */
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

  // ==================== MULTIJOUEUR ====================

  /**
   * Crée une nouvelle room multijoueur
   */
  async createRoom() {
    const r = await fetch(`${API_URL}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    })
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: "Failed to create room" }))
      throw new Error(`${r.status}: ${error.error || "Failed to create room"}`)
    }
    return r.json()
  },

  /**
   * Rejoint une room existante
   */
  async joinRoom(roomCode: string) {
    const r = await fetch(`${API_URL}/api/rooms/${roomCode}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    })
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: "Failed to join room" }))
      throw new Error(`${r.status}: ${error.error || "Failed to join room"}`)
    }
    return r.json()
  },

  // ==================== PROFIL UTILISATEUR ====================

  /**
   * Récupère les informations du profil utilisateur
   */
  async getProfile() {
    const r = await fetch(`${API_URL}/api/users/profile`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch profile")
    return r.json()
  },

  /**
   * Met à jour le profil utilisateur
   */
  async updateProfile(data: {
    username?: string,
    avatar?: string
  }) {
    const r = await fetch(`${API_URL}/api/users/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(data),
    })
    if (!r.ok) throw new Error("Failed to update profile")
    return r.json()
  },

  // ==================== STATS & HISTORIQUE ====================

  /**
   * Récupère les statistiques de l'utilisateur
   */
  async getStats() {
    const r = await fetch(`${API_URL}/api/stats`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch stats")
    return r.json()
  },

  /**
   * Récupère l'historique des parties
   */
  async getHistory(params?: { limit?: number, offset?: number }) {
    const query = new URLSearchParams()
    if (params?.limit) query.set("limit", params.limit.toString())
    if (params?.offset) query.set("offset", params.offset.toString())
    
    const r = await fetch(`${API_URL}/api/games/history?${query}`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch history")
    return r.json()
  },

  /**
   * Récupère le leaderboard global
   */
  async getLeaderboard(params?: { 
    timeframe?: "daily" | "weekly" | "monthly" | "all-time",
    limit?: number 
  }) {
    const query = new URLSearchParams()
    if (params?.timeframe) query.set("timeframe", params.timeframe)
    if (params?.limit) query.set("limit", params.limit.toString())
    
    const r = await fetch(`${API_URL}/api/leaderboard?${query}`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch leaderboard")
    return r.json()
  },

  // ==================== SPOTIFY ====================

  /**
   * Récupère les playlists de l'utilisateur
   */
  async getPlaylists() {
    const r = await fetch(`${API_URL}/api/spotify/playlists`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch playlists")
    return r.json()
  },

  /**
   * Récupère les tracks d'une playlist
   */
  async getPlaylistTracks(playlistId: string) {
    const r = await fetch(`${API_URL}/api/spotify/playlists/${playlistId}/tracks`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch playlist tracks")
    return r.json()
  },

  /**
   * Récupère les top tracks de l'utilisateur
   */
  async getTopTracks(timeRange: "short_term" | "medium_term" | "long_term" = "medium_term") {
    const r = await fetch(`${API_URL}/api/spotify/top-tracks?time_range=${timeRange}`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch top tracks")
    return r.json()
  },
}