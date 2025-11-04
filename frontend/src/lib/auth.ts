import { redirect } from "next/navigation"
import { getServerApi } from "./apiServer"
import type { UserSummary } from "./types"

export async function requireUser(): Promise<UserSummary> {
  const api = getServerApi()
  const user = await api.currentUser()
  if (!user) {
    redirect("/auth/login")
  }
  return user
}

export async function maybeUser(): Promise<UserSummary | null> {
  const api = getServerApi()
  return api.currentUser()
}
