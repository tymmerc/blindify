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
    if (!r.ok) throw new Error("Failed to start game")
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

  // ==================== TRACKS ====================

  /**
   * Ajoute une track aux likes Spotify de l'utilisateur
   */
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

  // ==================== SOURCES DE MUSIQUE ====================

  /**
   * Récupère les playlists de l'utilisateur
   */
  async getPlaylists() {
    const r = await fetch(`${API_URL}/api/sources/playlists`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch playlists")
    return r.json()
  },

  /**
   * Récupère les top tracks de l'utilisateur
   * @param timeRange - Période de temps ('short_term', 'medium_term', 'long_term')
   */
  async getTopTracks(timeRange: "short_term" | "medium_term" | "long_term" = "medium_term") {
    const r = await fetch(`${API_URL}/api/sources/top-tracks?time_range=${timeRange}`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch top tracks")
    return r.json()
  },

  /**
   * Récupère les morceaux récemment joués
   */
  async getRecentlyPlayed() {
    const r = await fetch(`${API_URL}/api/sources/recently-played`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch recently played")
    return r.json()
  },

  /**
   * Obtient des recommandations IA basées sur l'humeur
   * @param mood - Humeur pour la génération ('balanced', 'energetic', 'chill', etc.)
   * @param count - Nombre de tracks à générer
   */
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

  // ==================== PROFIL & STATS ====================

  /**
   * Récupère le profil complet de l'utilisateur
   */
  async getProfile() {
    const r = await fetch(`${API_URL}/api/user/profile`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) return null
    return r.json()
  },

  /**
   * Récupère les statistiques détaillées de l'utilisateur
   * Inclut: total games, score moyen, meilleur score, artistes favoris
   */
  async getDetailedStats() {
    const r = await fetch(`${API_URL}/api/stats/detailed`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch detailed stats")
    return r.json()
  },

  /**
   * Récupère le classement global des joueurs
   */
  async getLeaderboard() {
    const r = await fetch(`${API_URL}/api/stats/leaderboard`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch leaderboard")
    return r.json()
  },

  /**
   * Récupère l'historique des parties jouées
   */
  async getHistory() {
    const r = await fetch(`${API_URL}/api/games/history`, {
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Failed to fetch history")
    return r.json()
  },

  // ==================== MULTIJOUEUR ====================

  /**
   * Crée une nouvelle salle multijoueur
   */
  async createRoom(settings: { 
    name: string; 
    maxPlayers: number; 
    questionCount: number 
  }) {
    const r = await fetch(`${API_URL}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(settings),
    })
    if (!r.ok) throw new Error("Create room failed")
    return r.json()
  },

  /**
   * Rejoint une salle multijoueur existante
   * @param code - Code de la salle à rejoindre
   */
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

  /**
   * Quitte une salle multijoueur
   */
  async leaveRoom(roomId: string) {
    const r = await fetch(`${API_URL}/api/rooms/${roomId}/leave`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    })
    if (!r.ok) throw new Error("Leave room failed")
    return r.json()
  },

  /**
   * Démarre une partie multijoueur (réservé au host)
   */
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
