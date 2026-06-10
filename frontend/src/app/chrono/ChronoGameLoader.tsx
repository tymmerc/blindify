"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { SoloTrack } from "@/lib/types"
import { ChronoGameClient } from "@/components/game/ChronoGameClient"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

const CHRONO_TRACK_COUNT = 35

function parseDuration(raw: string | null): number {
  const parsed = Number(raw)
  if (parsed === 60 || parsed === 120 || parsed === 180 || parsed === 300) return parsed
  return 180
}

export default function ChronoGameLoader() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const quickUrl = searchParams.get("quickUrl")
  const durationSeconds = parseDuration(searchParams.get("duration"))

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        setLoading(true)
        setError(null)

        if (!quickUrl) {
          setError("URL manquante.")
          return
        }

        const decoded = decodeURIComponent(quickUrl)
        const result = await api.quickPlay(decoded, CHRONO_TRACK_COUNT)
        if (!active) return
        setTracks(result.tracks as SoloTrack[])
      } catch (err) {
        console.error("chrono_game_start_failed", err)
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de demarrer le chrono. Verifie le lien et reessaie."
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [quickUrl])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)]">
        <div className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm uppercase tracking-[0.5em] text-slate-300">
          Preparation du chrono...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] px-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl border border-white/10 bg-[#0c0c0c] p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-[#a855f7]" />
          <p className="text-sm text-slate-300">{error}</p>
          <Button variant="outline" onClick={() => router.replace("/chrono")} className="gap-2">
            Reessayer
          </Button>
        </div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] px-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-3xl border border-white/10 bg-[#0c0c0c] p-8 text-center text-sm text-slate-300">
          <p>Aucun titre trouvable. Essaie une autre playlist.</p>
          <Button variant="outline" onClick={() => router.replace("/chrono")}>
            Retour
          </Button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <ChronoGameClient
        tracks={tracks}
        durationSeconds={durationSeconds}
      />
    </main>
  )
}
