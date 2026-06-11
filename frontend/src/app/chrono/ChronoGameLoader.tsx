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
        <div className="rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b573f]">
          Preparation du chrono...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-8 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <AlertTriangle className="h-10 w-10 text-[#9c2f1d]" />
          <p className="text-sm text-[#6b573f]">{error}</p>
          <Button variant="outline" onClick={() => router.replace("/chrono")} className="gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] font-bold text-[#2e2014] hover:bg-[#2e2014] hover:text-[#f4ecdb]">
            Reessayer
          </Button>
        </div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-8 text-center text-sm text-[#6b573f] shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <p>Aucun titre trouvable. Essaie une autre playlist.</p>
          <Button variant="outline" onClick={() => router.replace("/chrono")} className="rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] font-bold text-[#2e2014] hover:bg-[#2e2014] hover:text-[#f4ecdb]">
            Retour
          </Button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen text-[#2e2014]">
      <ChronoGameClient
        tracks={tracks}
        durationSeconds={durationSeconds}
      />
    </main>
  )
}
