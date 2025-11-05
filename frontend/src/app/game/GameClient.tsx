"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { SoloGameResponse, SoloTrack, UserSummary } from "@/lib/types"
import type { ApiError } from "@/lib/apiClient"
import { SoloGameClient } from "@/components/game/SoloGameClient"

function normalizeDifficulty(value: string | null): "easy" | "normal" | "hard" {
  if (value === "easy" || value === "hard") {
    return value
  }
  return "normal"
}

function normalizeSource(value: string | null): string {
  if (!value) return "liked_tracks"
  return value
}

export default function GameClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<UserSummary | null>(null)
  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const difficultyParam = searchParams.get("difficulty")
  const sourceParam = searchParams.get("source")
  const difficulty = normalizeDifficulty(difficultyParam)
  const source = normalizeSource(sourceParam)

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        setLoading(true)
        setError(null)

        const me = await api.checkAuth()
        if (!active) return
        if (!me) {
          router.replace("/auth/login")
          return
        }
        setUser(me)

        const game: SoloGameResponse = await api.startSoloGame({
          difficulty,
          source,
          count: 10,
        })
        if (!active) return
        setTracks(game.tracks)
      } catch (err) {
        const rawMessage = err && typeof err === "object" && "message" in err ? String((err as ApiError).message) : null
        const message = rawMessage === "No tracks available"
          ? "Spotify ne renvoie aucun extrait jouable pour cette configuration. Ajoute des titres likés avec preview et réessaie."
          : rawMessage
        console.error("game_bootstrap_failed", err)
        if (!active) return
        setError(message || "Impossible de démarrer la partie. Réessaie plus tard.")
      } finally {
        if (active) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [router, difficulty, source])

  const hasContent = useMemo(() => tracks.length > 0 && !!user, [tracks, user])

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold">Préparation de ta partie…</p>
          <p className="text-sm text-muted-foreground">Nous récupérons tes titres Spotify.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div className="max-w-sm space-y-4">
          <p className="text-lg font-semibold">Oups !</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => router.replace("/menu")}
            className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Retour au menu
          </button>
        </div>
      </div>
    )
  }

  if (!hasContent || !user) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-semibold">Aucun morceau disponible</p>
          <p className="text-sm text-muted-foreground">
            Nous n'avons pas trouvé d'extraits jouables dans ta bibliothèque Spotify pour cette configuration.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/menu")}
            className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Retour au menu
          </button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-16">
        <header className="space-y-2 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-purple-600">Mode solo</p>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Blindtest en cours
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Difficulté <span className="font-semibold">{difficulty}</span> · Source <span className="font-semibold">{source.replace(/_/g, " ")}</span>
          </p>
        </header>

        <SoloGameClient user={user} tracks={tracks} />
      </div>
    </main>
  )
}
