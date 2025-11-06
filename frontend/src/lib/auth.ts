import { redirect } from "next/navigation"
import { getServerApi } from "./apiServer"
import type { CurrentUserPayload } from "./api"

export async function requireUser(): Promise<CurrentUserPayload> {
  const api = getServerApi()
  const data = await api.currentUser()
  if (!data) {
    redirect("/auth/login")
  }
  return data
}

export async function maybeUser(): Promise<CurrentUserPayload | null> {
  const api = getServerApi()
  return api.currentUser()
}
