import { API_BASE_URL } from "./config"
import type { SoloGameResponse, UserSummary } from "./types"

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

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new ApiError(response.status, "Invalid JSON response")
  }
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getCookie("blindify_access_token")
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
      const errorPayload = await response.json()
      if (errorPayload && typeof errorPayload.error === "string") {
        message = errorPayload.error
        if (typeof errorPayload.details === "string" && errorPayload.details) {
          message = `${message}: ${errorPayload.details}`
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

  return parseJson<T>(response)
}

export const clientApi = {
  getLoginUrl() {
    return buildUrl("/auth/login")
  },
  async currentUser(): Promise<UserSummary | null> {
    try {
      return await request<UserSummary>("/api/auth/me", { cache: "no-store" })
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
    count?: number
  } = {}): Promise<SoloGameResponse> {
    return request<SoloGameResponse>("/api/games/solo/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        difficulty: options.difficulty ?? "normal",
        source: options.source ?? "liked_tracks",
        count: options.count ?? 10,
      }),
    })
  },
  async addLike(trackId: string): Promise<void> {
    await request("/api/likes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ track_id: trackId }),
    })
  },
  async refreshSession(): Promise<{ expiresAt: number | null } | null> {
    try {
      return await request<{ expiresAt: number | null }>("/api/auth/refresh", {
        method: "POST",
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return null
      }
      throw err
    }
  },
  async logout(): Promise<void> {
    await request("/api/auth/logout", {
      method: "POST",
    })
    if (typeof document !== "undefined") {
      document.cookie = "blindify_access_token=; Path=/; Max-Age=0; Secure; SameSite=Lax"
      document.cookie = "blindify_refresh_token=; Path=/; Max-Age=0; Secure; SameSite=Lax"
    }
  },
}

export type ClientApi = typeof clientApi
