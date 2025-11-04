import "server-only"

import { cookies } from "next/headers"
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
      const message = response.statusText || "API request failed"
      throw new ApiError(response.status, message)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return parseJson<T>(response)
  }

  return {
    getLoginUrl() {
      return buildUrl("/auth/login")
    },
    async currentUser(): Promise<UserSummary | null> {
      try {
        return await request<UserSummary>("/api/auth/me")
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null
        }
        throw err
      }
    },
    async requireUser(): Promise<UserSummary> {
      const user = await this.currentUser()
      if (!user) {
        throw new ApiError(401, "Unauthorized")
      }
      return user
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
  }
}

export type ServerApi = ReturnType<typeof getServerApi>
