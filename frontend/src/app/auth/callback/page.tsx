"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export const dynamic = "force-dynamic"

const PENDING_AUTH_REDIRECT_KEY = "blindify:post_auth_redirect"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    // Session cookie is now set by the backend as HttpOnly — no JS handling needed.
    // Check for pending redirect (e.g., user was joining a game before login)
    let pendingRedirect: string | null = null
    try {
      pendingRedirect = window.localStorage.getItem(PENDING_AUTH_REDIRECT_KEY)
      if (pendingRedirect) {
        window.localStorage.removeItem(PENDING_AUTH_REDIRECT_KEY)
      }
    } catch {
      // ignore storage errors
    }

    if (pendingRedirect && pendingRedirect.startsWith("/") && !pendingRedirect.includes("://")) {
      router.replace(pendingRedirect)
    } else {
      router.replace("/friends")
    }
  }, [router])

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-purple-900 via-indigo-900 to-gray-900 text-white px-6 text-center">
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-[0.3em] text-purple-200">Blindify</p>
        <h1 className="text-2xl font-semibold">Connexion en cours…</h1>
        <p className="text-sm text-purple-100/80">Nous validons ta session Spotify.</p>
      </div>
    </main>
  )
}
