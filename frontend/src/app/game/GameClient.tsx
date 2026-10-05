"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { SoloGameResponse, SoloTrack } from "@/lib/types"
import { SoloGameClient } from "@/components/game/SoloGameClient"
import { SoloLoading, SoloProblem } from "@/components/game/SoloStatus"
import { clearUserDashboardCache } from "@/lib/userData"
import { NICKNAME_KEY, readStored } from "@/lib/soloSetup"

function normalizeDifficulty(value: string | null): "easy" | "normal" | "hard" {
  return value === "easy" || value === "hard" ? value : "normal"
}

function normalizeSource(
  value: string | null
): "library" | "top" | "recent" | "liked" | "playlist" | "top_week" | "top_month" | "top_all" | "quickplay" {
  if (
    value === "top" ||
    value === "recent" ||
    value === "liked" ||
    value === "playlist" ||
    value === "top_week" ||
    value === "top_month" ||
    value === "top_all" ||
    value === "quickplay"
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
  const quickUrl = searchParams.get("quickUrl")
  const progressive = searchParams.get("progressive") === "true"
  const isQuickPlay = source === "quickplay" && Boolean(quickUrl)
  // Partie lancee depuis l'onglet "Defier un ami" : la fin met le defi en avant.
  const challengeIntent = searchParams.get("challenge") === "1"
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

        if (isQuickPlay && quickUrl) {
          // Quick play: no auth required, use public playlists
          const decoded = decodeURIComponent(quickUrl)
          const result = await api.quickPlay(decoded, roundsCount)
          if (!active) return
          // Le pseudo saisi a l'entree (/jouer) : c'est lui qu'un ami voit sur le
          // defi. Avant, tout defi lance d'ici s'appelait "Defi de Joueur".
          const username = readStored(NICKNAME_KEY) || "Joueur"
          setUserPayload({
            user: { id: 0, provider: "guest", provider_id: "quick", username, email: null, avatar: null },
            providerConnection: null,
          })
          setSessionInfo(result.session as SoloGameResponse["session"])
          setTracks(result.tracks as SoloTrack[])
          return
        }

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
          err instanceof Error && err.message
            ? err.message
            : "Impossible de lancer la partie. Vérifie ton lien et réessaie."
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [router, difficulty, source, playlistId, quickUrl, isQuickPlay, roundsCount])

  const hasTracks = useMemo(() => tracks.length > 0, [tracks])

  const handleGameComplete = useCallback(
    async (summary: { rounds: number; correct: number; bestStreak: number; points?: number }) => {
      if (!sessionInfo?.id) return
      // Quick play has session.id === 0 — don't persist stats
      if (sessionInfo.id === 0) return
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

  if (loading) return <SoloLoading />

  if (error) {
    return <SoloProblem message={error} onBack={() => router.replace("/solo")} />
  }

  if (!userPayload || !sessionInfo || !hasTracks) {
    return (
      <SoloProblem
        message="Aucun titre jouable avec ce lien. Les playlists sont peut-être privées, ou sans extrait disponible."
        onBack={() => router.replace("/solo")}
      />
    )
  }

  return (
    <main className="min-h-screen text-[#2e2014]">
      <SoloGameClient
        user={userPayload.user}
        tracks={tracks}
        sessionId={sessionInfo.id}
        mode="solo"
        difficulty={difficulty}
        source={source}
        progressive={progressive}
        challengeIntent={challengeIntent}
        onGameComplete={handleGameComplete}
      />
    </main>
  )
}
