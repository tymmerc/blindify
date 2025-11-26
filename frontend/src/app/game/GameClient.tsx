"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { SoloGameResponse, SoloTrack } from "@/lib/types"
import { SoloGameClient } from "@/components/game/SoloGameClient"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

function normalizeDifficulty(value: string | null): "easy" | "normal" | "hard" {
  return value === "easy" || value === "hard" ? value : "normal"
}

function normalizeSource(value: string | null): "library" | "top" | "recent" | "liked" {
  if (value === "top" || value === "recent" || value === "liked") return value
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

        const me = await api.checkAuth()
        if (!active) return
        if (!me) {
          router.replace("/auth/login")
          return
        }
        setUserPayload(me)

        const game: SoloGameResponse = await api.startSoloGame({
          difficulty,
          source,
          count: roundsCount,
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
  }, [router, difficulty, source])

  const hasTracks = useMemo(() => tracks.length > 0, [tracks])

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
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 opacity-40">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, rgba(168,85,247,0.16), transparent 55%), radial-gradient(circle at 80% 10%, rgba(34,197,94,0.2), transparent 55%), radial-gradient(circle at 50% 80%, rgba(59,130,246,0.18), transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-10">
        <header className="surface flex flex-col gap-4 rounded-3xl border border-white/10 p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Solo session</p>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                Round up your guesses
              </h1>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs uppercase tracking-[0.5em] text-slate-300">
              {sessionInfo.provider.toUpperCase()} · {sessionInfo.totalRounds} rounds
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Difficulty <span className="text-neon">{difficulty}</span> · Source{" "}
            <span className="text-neon">{source}</span>
          </p>
        </header>

        <SoloGameClient
          user={userPayload.user}
          tracks={tracks}
          mode="solo"
          difficulty={difficulty}
          source={source}
        />
      </div>
    </main>
  )
}
