import { API_BASE_URL } from "./config"
import type {
  ProviderConnectionSummary,
  SoloGameResponse,
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
        provider: options.provider,
      }),
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
}

export type ClientApi = typeof clientApi
