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
      <div className="grid min-h-screen place-items-center">
        <div className="rounded-full border-[1.5px] border-line bg-paper-deep px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-2">
          Preparation du chrono...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-md border-2 border-line bg-paper-deep p-8 text-center shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]">
          <AlertTriangle className="h-10 w-10 text-rouge-txt" />
          <p className="text-sm text-ink-2">{error}</p>
          <Button variant="outline" onClick={() => router.replace("/chrono")} className="gap-2 rounded-full border-[1.5px] border-line bg-paper font-bold text-ink hover:bg-ink-block hover:text-on-ink">
            Reessayer
          </Button>
        </div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-md border-2 border-line bg-paper-deep p-8 text-center text-sm text-ink-2 shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]">
          <p>Aucun titre trouvable. Essaie une autre playlist.</p>
          <Button variant="outline" onClick={() => router.replace("/chrono")} className="rounded-full border-[1.5px] border-line bg-paper font-bold text-ink hover:bg-ink-block hover:text-on-ink">
            Retour
          </Button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen text-ink">
      <ChronoGameClient
        tracks={tracks}
        durationSeconds={durationSeconds}
      />
    </main>
  )
}
