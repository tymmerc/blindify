import { clientApi } from "./apiClient"
import type { SoloGameResponse, UserSummary } from "./types"

export const api = {
  getLoginUrl(): string {
    return clientApi.getLoginUrl()
  },
  async checkAuth(): Promise<UserSummary | null> {
    return clientApi.currentUser()
  },
  async startSoloGame(params: {
    difficulty?: "easy" | "normal" | "hard"
    source?: string
    count?: number
  } = {}): Promise<SoloGameResponse> {
    return clientApi.startSoloGame(params)
  },
  async addLike(_userId: number | null | undefined, trackId: string): Promise<void> {
    return clientApi.addLike(trackId)
  },
  async logout(): Promise<void> {
    return clientApi.logout()
  },
}
