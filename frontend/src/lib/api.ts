// ====================================
// API CLIENT POUR BLINDIFY
// ====================================
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://blindify-production.up.railway.app";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("spotify_access_token")
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  getLoginUrl() {
    return `${API_URL}/auth/login`;
  },

  async checkAuth() {
    const r = await fetch(`${API_URL}/api/auth/me`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!r.ok) return null;
    return r.json();
  },

  async startSoloGame(params: {
    difficulty?: "easy" | "normal" | "hard";
    source?: string;
    sourceId?: string | null;
    mood?: string;
    count?: number;
  } = {}) {
    const r = await fetch(`${API_URL}/api/games/solo/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error("Failed to start game");
    return r.json();
  },

  async createRoom() {
    const r = await fetch(`${API_URL}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });
    if (!r.ok) throw new Error("Failed to create room");
    return r.json();
  },

  async joinRoom(roomCode: string) {
    const r = await fetch(`${API_URL}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ roomCode }),
    });
    if (!r.ok) throw new Error("Failed to join room");
    return r.json();
  },

  async getProfile() {
    const r = await fetch(`${API_URL}/api/profile`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!r.ok) throw new Error("Failed to load profile");
    return r.json();
  },

  async addLike(userId: number, trackId: string) {
    const r = await fetch(`${API_URL}/api/likes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, track_id: trackId }),
    });
    if (!r.ok) throw new Error("Failed to like");
    return r.json();
  },

  async getLikes(userId: number) {
    const r = await fetch(`${API_URL}/api/likes/${userId}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!r.ok) throw new Error("Failed to get likes");
    return r.json();
  },
  async getHistory() {
    const r = await fetch(`${API_URL}/api/history`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!r.ok) throw new Error("Failed to load history");
    return r.json();
  }

  
};

