"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  const maxAge = Math.max(60, Math.floor(maxAgeSeconds))
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`
}

export const dynamic = "force-dynamic"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const url = new URL(window.location.href)
    const accessToken = url.searchParams.get("access_token")
    const refreshToken = url.searchParams.get("refresh_token")
    const expiresInParam = url.searchParams.get("expires_in")

    if (!accessToken) {
      router.replace("/auth/login?error=session_invalid")
      return
    }

    const expiresIn = Number(expiresInParam ?? "3600")

    setCookie("blindify_access_token", accessToken, expiresIn > 120 ? expiresIn - 60 : expiresIn)
    if (refreshToken) {
      setCookie("blindify_refresh_token", refreshToken, 60 * 60 * 24 * 30)
    } else {
      clearCookie("blindify_refresh_token")
    }

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
