"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { SoloGameResponse, SoloTrack } from "@/lib/types"
import { SoloGameClient } from "@/components/game/SoloGameClient"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { clearUserDashboardCache } from "@/lib/userData"

function normalizeDifficulty(value: string | null): "easy" | "normal" | "hard" {
  return value === "easy" || value === "hard" ? value : "normal"
}

function normalizeSource(
  value: string | null
): "library" | "top" | "recent" | "liked" | "playlist" | "top_week" | "top_month" | "top_all" {
  if (
    value === "top" ||
    value === "recent" ||
    value === "liked" ||
    value === "playlist" ||
    value === "top_week" ||
    value === "top_month" ||
    value === "top_all"
  )
    return value
  return "library"
}

export default function GameClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SoloGameResponse["session"] | null>(null)
  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const difficulty = normalizeDifficulty(searchParams.get("difficulty"))
  const source = normalizeSource(searchParams.get("source"))
  const playlistId = searchParams.get("playlistId")
  const roundsCount = (() => {
    const raw = searchParams.get("count")
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed) && parsed >= 5 && parsed <= 25) return parsed
    return 10
  })()

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        setLoading(true)
        setError(null)

        const me = await api.ensureUserSession("Invité")
        if (!active) return
        if (!me) {
          setError("Impossible de démarrer une session invité.")
          return
        }
        setUserPayload(me)

        const game: SoloGameResponse = await api.startSoloGame({
          difficulty,
          source,
          count: roundsCount,
          playlistId: playlistId ?? undefined,
        })

        if (!active) return
        setSessionInfo(game.session)
        setTracks(game.tracks)
      } catch (err) {
        console.error("solo_game_start_failed", err)
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Unable to start a new game. Try syncing more tracks or switching providers."
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [router, difficulty, source, playlistId, roundsCount])

  const hasTracks = useMemo(() => tracks.length > 0, [tracks])

  const handleGameComplete = useCallback(
    async (summary: { rounds: number; correct: number; bestStreak: number; points?: number }) => {
      if (!sessionInfo?.id) return
      try {
        await api.recordSoloResult({
          sessionId: sessionInfo.id,
          rounds: summary.rounds,
          correct: summary.correct,
          bestStreak: summary.bestStreak ?? 0,
        })
        clearUserDashboardCache()
      } catch (err) {
        console.error("record_solo_result_failed", err)
      }
    },
    [sessionInfo?.id]
  )

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm uppercase tracking-[0.5em] text-slate-300">
          Initialising game
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="surface flex max-w-md flex-col items-center gap-4 rounded-3xl border border-white/10 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-neon" />
          <p className="text-sm text-slate-300">{error}</p>
          <Button variant="outline" onClick={() => router.replace("/menu")} className="gap-2">
            Return to menu
          </Button>
        </div>
      </div>
    )
  }

  if (!userPayload || !sessionInfo || !hasTracks) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="surface flex max-w-md flex-col items-center gap-3 rounded-3xl border border-white/10 p-8 text-center text-sm text-slate-300">
          <p>No playable tracks were found for this configuration.</p>
          <Button variant="outline" onClick={() => router.replace("/menu")}>
            Back to menu
          </Button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <SoloGameClient
        user={userPayload.user}
        tracks={tracks}
        sessionId={sessionInfo.id}
        mode="solo"
        difficulty={difficulty}
        source={source}
        onGameComplete={handleGameComplete}
      />
    </main>
  )
}
