import "server-only"

import { cookies } from "next/headers"
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
  } catch {
    throw new ApiError(response.status, "Invalid JSON response")
  }
}

export function getServerApi() {
  const cookieHeader = cookies().toString()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(buildUrl(path), {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...init?.headers,
        Cookie: cookieHeader,
      },
    })

    if (!response.ok) {
      let message = response.statusText || "API request failed"
      try {
        const errorPayload = (await response.json()) as ApiEnvelope<unknown>
        if (errorPayload?.error?.message) {
          message = errorPayload.error.message
        }
      } catch {
        // ignore parse error, keep default message
      }
      throw new ApiError(response.status, message)
    }

    if (response.status === 204) {
      return { success: true, data: null, error: null } as T
    }

    return parseJson<T>(response)
  }

  return {
    getLoginUrl() {
      return buildUrl("/auth/login")
    },
    async currentUser(): Promise<{ user: UserSummary; providerConnection: ProviderConnectionSummary | null } | null> {
      try {
        const payload = await request<ApiEnvelope<{ user: UserSummary; providerConnection: ProviderConnectionSummary | null }>>(
          "/api/auth/me"
        )
        if (!payload.success) {
          throw new ApiError(500, payload.error?.message ?? "Failed to load user")
        }
        return payload.data
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null
        }
        throw err
      }
    },
    async requireUser(): Promise<{ user: UserSummary; providerConnection: ProviderConnectionSummary | null }> {
      const data = await this.currentUser()
      if (!data) {
        throw new ApiError(401, "Unauthorized")
      }
      return data
    },
    async startSoloGame(options: {
      difficulty?: "easy" | "normal" | "hard"
      source?: string
      count?: number
      provider?: string
    } = {}): Promise<SoloGameResponse> {
      const payload = await request<ApiEnvelope<SoloGameResponse>>("/api/games/solo", {
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
      if (!payload.success || !payload.data) {
        throw new ApiError(500, payload.error?.message ?? "Unable to start solo game")
      }
      return payload.data
    },
  }
}

export type ServerApi = ReturnType<typeof getServerApi>
