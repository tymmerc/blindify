"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { SoloTrack } from "@/lib/types"
import { SoloGameClient } from "@/components/game/SoloGameClient"
import { Button } from "@/components/ui/button"
import Link from "next/link"

type QuickSession = {
  id: number
  mode: string
  difficulty: string
  provider: string
  totalRounds: number
  startedAt: string
}

function QuickPlayInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const profileUrl = searchParams.get("url") ?? ""
  const roundCount = Number(searchParams.get("count")) || 10

  const [session, setSession] = useState<QuickSession | null>(null)
  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState("Recherche des playlists...")

  useEffect(() => {
    if (!profileUrl) {
      setError("Aucune URL fournie.")
      setLoading(false)
      return
    }

    let active = true

    async function bootstrap() {
      try {
        setLoading(true)
        setError(null)
        setProgress("Recherche des playlists publiques...")

        const decoded = decodeURIComponent(profileUrl)

        setProgress("Récupération des titres et résolution des previews...")
        const result = await api.quickPlay(decoded, roundCount)

        if (!active) return

        setSession(result.session)
        setTracks(result.tracks as SoloTrack[])
      } catch (err) {
        if (!active) return
        const raw = err instanceof Error ? err.message : ""
        let userMessage: string
        if (raw.includes("no_tracks") || raw.includes("Aucun titre") || raw.includes("no_playlists")) {
          userMessage = "Aucune playlist publique trouvée pour ce profil. Vérifie que tes playlists sont en mode public."
        } else if (raw.includes("invalid") || raw.includes("URL") || raw.includes("unsupported")) {
          userMessage = "L'URL n'est pas reconnue. Colle un lien de profil ou playlist Spotify / Deezer."
        } else {
          userMessage = raw || "Impossible de préparer le jeu. Vérifie l'URL et réessaie."
        }
        setError(userMessage)
      } finally {
        if (active) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [profileUrl])

  const handleGameComplete = useCallback(
    async (_summary: { rounds: number; correct: number; bestStreak: number }) => {
      // No-op for anonymous quick play — no stats saved
    },
    []
  )

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-ink">
        <div
          className="relative h-16 w-16 rounded-full border-2 border-line"
          style={{
            background: "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)",
            animation: "vinyl-spin 2s linear infinite",
          }}
        >
          <span className="absolute inset-[33%] rounded-full border-2 border-line bg-terra" />
          <span className="absolute inset-[45%] rounded-full bg-paper" />
        </div>
        <p className="text-sm text-ink-2">{progress}</p>
        <p className="text-xs text-sourd">Cela peut prendre quelques secondes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-ink">
        <div className="w-full max-w-md space-y-4 rounded-md border-2 border-rouge-txt bg-paper-deep p-8 text-center shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]">
          <p className="text-sm font-bold text-rouge-txt">{error}</p>
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="rounded-full border-[1.5px] border-line bg-paper px-4 py-2 text-sm font-bold text-ink hover:bg-ink-block hover:text-on-ink"
            >
              Retour
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="rounded-md border-2 border-line bg-terra px-4 py-2 text-sm font-bold text-on-ink shadow-[3px_3px_0_rgb(var(--c-shadow))] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#b8492d] hover:text-on-ink hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
            >
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!session || tracks.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-ink">
        <div className="flex w-full max-w-md flex-col items-center space-y-3 text-center">
          <span
            aria-hidden
            className="relative mb-1 block h-12 w-12 rounded-full border-2 border-line"
            style={{ background: "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2px, #3a2a1a 2px 4px)" }}
          >
            <span className="absolute inset-[33%] rounded-full border border-line bg-terra" />
            <span className="absolute inset-[45%] rounded-full bg-paper" />
          </span>
          <p className="font-display text-lg font-semibold">Aucun titre jouable trouvé</p>
          <p className="text-sm text-ink-2">
            Les playlists de ce profil sont peut-être privées, ou aucun titre ne dispose d'un aperçu audio.
            Essaie avec un autre profil ou une playlist publique.
          </p>
        </div>
        <Link
          href="/solo"
          className="rounded-md border-2 border-line bg-terra px-6 py-2 text-sm font-bold text-on-ink shadow-[3px_3px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
        >
          Essayer un autre lien
        </Link>
      </div>
    )
  }

  return (
    <main className="min-h-screen text-ink">
      <SoloGameClient
        user={{ id: 0, provider: "guest", provider_id: "quick", username: "Joueur", email: null, avatar: null }}
        tracks={tracks}
        sessionId={session.id}
        mode="solo"
        difficulty="normal"
        source="library"
        onGameComplete={handleGameComplete}
      />
    </main>
  )
}

export default function QuickPlayPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-sm text-ink-2">
          Chargement...
        </div>
      }
    >
      <QuickPlayInner />
    </Suspense>
  )
}
