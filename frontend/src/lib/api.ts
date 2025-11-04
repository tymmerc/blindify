// ====================================
// API CLIENT POUR BLINDIFY
// ====================================

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://blindify-production.up.railway.app";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("spotify_access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  // ============ AUTH =============
  getLoginUrl() {
    // Démarre le flow sur le BACKEND, jamais via Vercel /auth/login
    return `${API_URL}/auth/login`;
  },

  async checkAuth() {
    try {
      const r = await fetch(`${API_URL}/api/auth/me`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  },

  // ============ JEUX =============
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
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: "Failed to start game" }));
      throw new Error(`${r.status}: ${error.error || "Failed to start game"}`);
    }
    return r.json();
  },

  // ============ LIKES =============
  async addLike(userId: number, trackId: string) {
    const r = await fetch(`${API_URL}/api/likes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, track_id: trackId }),
    });
    if (!r.ok) throw new Error("Failed to like track");
    return r.json();
  },

  async getLikes(userId: number): Promise<{ track_id: string }[]> {
    const r = await fetch(`${API_URL}/api/likes/${userId}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!r.ok) throw new Error("Failed to fetch likes");
    return r.json();
  },
};
