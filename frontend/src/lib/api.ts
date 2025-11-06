import { clientApi } from "./apiClient"
import type {
  ProviderConnectionSummary,
  SoloGameResponse,
  UserSummary,
} from "./types"

export type CurrentUserPayload = {
  user: UserSummary
  providerConnection: ProviderConnectionSummary | null
}

function setSessionCookie(token: string, maxAgeSeconds = 60 * 60 * 24) {
  if (typeof document === "undefined") return
  const maxAge = Math.max(60, Math.floor(maxAgeSeconds))
  document.cookie = `blindify_session_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`
}

function clearSessionCookie() {
  if (typeof document === "undefined") return
  document.cookie = "blindify_session_token=; Path=/; Max-Age=0; Secure; SameSite=Lax"
}

export const api = {
  getLoginUrl(): string {
    return clientApi.getLoginUrl()
  },
  async checkAuth(): Promise<CurrentUserPayload | null> {
    return clientApi.currentUser()
  },
  async startSoloGame(params: {
    difficulty?: "easy" | "normal" | "hard"
    source?: string
    count?: number
    provider?: string
  } = {}): Promise<SoloGameResponse> {
    return clientApi.startSoloGame(params)
  },
  async addLike(_userId: number | null | undefined, audioSourceId: string): Promise<void> {
    return clientApi.addLike(audioSourceId)
  },
  async logout(): Promise<void> {
    await clientApi.logout()
    clearSessionCookie()
  },
  async startGuestSession(nickname?: string): Promise<void> {
    const { sessionToken } = await clientApi.createGuestSession(nickname)
    setSessionCookie(sessionToken, 60 * 60 * 4)
  },
  setSessionCookie,
  clearSessionCookie,
}
