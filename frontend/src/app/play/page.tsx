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
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#050505] text-white">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-purple-500" />
          <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-pink-500" style={{ animationDirection: "reverse", animationDuration: "0.8s" }} />
        </div>
        <p className="text-sm text-white/60">{progress}</p>
        <p className="text-xs text-white/30">Cela peut prendre quelques secondes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#050505] px-6 text-white">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="rounded-xl border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Retour
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="rounded-xl border-purple-500/30 px-4 py-2 text-sm text-purple-400 hover:bg-purple-500/10"
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#050505] px-6 text-white">
        <div className="w-full max-w-md space-y-3 text-center">
          <p className="text-4xl">🎵</p>
          <p className="text-base font-semibold">Aucun titre jouable trouvé</p>
          <p className="text-sm text-white/50">
            Les playlists de ce profil sont peut-être privées, ou aucun titre ne dispose d'un aperçu audio.
            Essaie avec un autre profil ou une playlist publique.
          </p>
        </div>
        <Link
          href="/solo"
          className="rounded-xl bg-purple-500/20 border border-purple-500/30 px-6 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/30"
        >
          Essayer un autre lien
        </Link>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
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
        <div className="grid min-h-screen place-items-center bg-[#050505] text-sm text-white/60">
          Chargement...
        </div>
      }
    >
      <QuickPlayInner />
    </Suspense>
  )
}
