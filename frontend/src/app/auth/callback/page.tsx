"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"

export const dynamic = "force-dynamic"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const url = new URL(window.location.href)
    const sessionToken = url.searchParams.get("session_token")
    const expiresInParam = url.searchParams.get("expires_in")

    if (!sessionToken) {
      router.replace("/auth/login?error=session_invalid")
      return
    }

    const expiresIn = Number.isNaN(Number(expiresInParam))
      ? 60 * 60 * 24
      : Math.max(300, Number(expiresInParam))

    api.setSessionCookie(sessionToken, expiresIn)

    router.replace("/menu")
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
