"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"

export const dynamic = "force-dynamic"

function CallbackInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<"checking" | "error">("checking")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function finalize() {
      const maybeError = params.get("error")
      if (maybeError) {
        setError(maybeError)
        setStatus("error")
        return
      }

      try {
        const me = await api.checkAuth()
        if (!active) return
        if (me) {
          router.replace("/menu")
          return
        }
        setStatus("error")
        setError("Impossible de valider la session Spotify")
      } catch (err) {
        console.error("auth_callback_failed", err)
        if (!active) return
        setStatus("error")
        setError("Une erreur est survenue lors de la connexion")
      }
    }

    finalize()

    return () => {
      active = false
    }
  }, [params, router])

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-purple-900 via-indigo-900 to-gray-900 text-white px-6 text-center">
      {status === "checking" ? (
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-purple-200">Blindify</p>
          <h1 className="text-2xl font-semibold">Connexion en cours…</h1>
          <p className="text-sm text-purple-100/80">Nous validons ta session Spotify.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-sm">
          <h1 className="text-2xl font-semibold">Connexion bloquée</h1>
          <p className="text-sm text-purple-100/80">{error}</p>
          <button
            type="button"
            onClick={() => router.replace("/auth/login")}
            className="w-full rounded-2xl bg-white px-6 py-3 text-base font-semibold text-purple-900 transition hover:bg-purple-100"
          >
            Retour à la connexion
          </button>
        </div>
      )}
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-white">Connexion…</div>}>
      <CallbackInner />
    </Suspense>
  )
}
