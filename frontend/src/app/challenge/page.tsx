"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { clientApi } from "@/lib/apiClient"
import { api } from "@/lib/api"
import { SoloGameClient, type RoundStats } from "@/components/game/SoloGameClient"
import type { SoloTrack, UserSummary } from "@/lib/types"
import { Loader2 } from "lucide-react"

type ChallengeData = {
  code: string
  creatorName: string
  creatorScore: number
  creatorCorrect: number
  creatorTotal: number
  creatorBestStreak: number
  trackCount: number
  tracks: Array<{
    title: string
    artist: string
    album_cover: string | null
    audio_url: string | null
    audioSourceId: string | null
    track_id: string | null
    type: string
  }>
  createdAt: string
  attempts: LeaderboardEntry[]
}

type LeaderboardEntry = {
  playerName: string
  score: number
  correct: number
  total: number
  bestStreak: number
  completedAt: string
}

type Phase = "loading" | "intro" | "playing" | "leaderboard" | "error" | "no-code"

function ChallengeContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get("code")?.toUpperCase().trim() ?? ""

  const [phase, setPhase] = useState<Phase>(code ? "loading" : "no-code")
  const [challenge, setChallenge] = useState<ChallengeData | null>(null)
  const [error, setError] = useState("")
  const [playerName, setPlayerName] = useState("")
  const [user, setUser] = useState<UserSummary | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [currentPlayerName, setCurrentPlayerName] = useState("")
  const [codeInput, setCodeInput] = useState("")

  // Ensure user session exists (guest if needed)
  useEffect(() => {
    api.ensureUserSession("Challenger").then((result) => {
      if (result) setUser(result.user)
    }).catch(() => {})
  }, [])

  // Fetch challenge data
  useEffect(() => {
    if (!code) return
    clientApi.getChallenge(code).then((data) => {
      setChallenge(data)
      setPhase("intro")
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Defi introuvable")
      setPhase("error")
    })
  }, [code])

  const soloTracks: SoloTrack[] = useMemo(() => {
    if (!challenge) return []
    return challenge.tracks.map((t, i) => ({
      round: i + 1,
      audioSourceId: t.audioSourceId ?? t.track_id ?? `challenge-${i}`,
      type: (t.type as SoloTrack["type"]) || "guest",
      track_id: t.track_id ?? `challenge-${i}`,
      title: t.title,
      artist: t.artist,
      album_cover: t.album_cover,
      audio_url: t.audio_url,
      metadata: {},
    }))
  }, [challenge])

  const handleStart = useCallback(() => {
    const name = playerName.trim() || "Joueur"
    setCurrentPlayerName(name)
    setPhase("playing")
  }, [playerName])

  const handleChallengeComplete = useCallback(async (stats: RoundStats) => {
    if (!code) return
    try {
      const result = await clientApi.completeChallenge(code, {
        playerName: currentPlayerName || "Joueur",
        score: stats.points,
        correct: stats.correct,
        total: stats.rounds,
        bestStreak: stats.bestStreak,
      })
      setLeaderboard(result.leaderboard)
    } catch {
      // Still show leaderboard from challenge data if submit fails
      if (challenge) {
        setLeaderboard(challenge.attempts)
      }
    }
    setPhase("leaderboard")
  }, [code, currentPlayerName, challenge])

  const handleCodeSubmit = useCallback(() => {
    const trimmed = codeInput.trim().toUpperCase()
    if (trimmed.length >= 4) {
      window.location.href = `/blindify/challenge/?code=${trimmed}`
    }
  }, [codeInput])

  if (phase === "no-code") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-3xl font-semibold">Rejoindre un defi</h1>
          <p className="text-sm text-white/60">Entre le code du defi pour commencer</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="CODE DU DEFI"
              maxLength={12}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-lg font-mono tracking-widest text-white placeholder-white/30 focus:border-[#a855f7]/50 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
            />
          </div>
          <button
            type="button"
            onClick={handleCodeSubmit}
            disabled={codeInput.trim().length < 4}
            className="w-full rounded-xl border-2 border-[#a855f7] bg-transparent px-6 py-3 text-sm font-semibold text-[#a855f7] transition hover:bg-[#a855f7]/10 disabled:opacity-40"
          >
            Rejoindre
          </button>
        </div>
      </div>
    )
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#a855f7]" />
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-red-400">Defi introuvable</h1>
          <p className="text-sm text-white/60">{error}</p>
          <a
            href="/blindify/challenge/"
            className="inline-block rounded-xl border border-white/15 px-6 py-2.5 text-sm text-white/80 transition hover:bg-white/5"
          >
            Entrer un code
          </a>
        </div>
      </div>
    )
  }

  if (phase === "intro" && challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[#a855f7]">Defi</p>
            <h1 className="text-3xl font-semibold">
              Defi de {challenge.creatorName}
            </h1>
            <p className="text-sm text-white/60">
              {challenge.trackCount} titre{challenge.trackCount > 1 ? "s" : ""}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Score a battre</span>
              <span className="text-2xl font-bold text-[#a855f7]">{challenge.creatorScore} pts</span>
            </div>
            <div className="flex items-center justify-between text-sm text-white/50">
              <span>{challenge.creatorCorrect}/{challenge.creatorTotal} correct</span>
              <span>Serie max : {challenge.creatorBestStreak}</span>
            </div>
            {challenge.attempts.length > 0 && (
              <div className="border-t border-white/10 pt-3 text-xs text-white/40">
                {challenge.attempts.length} joueur{challenge.attempts.length > 1 ? "s" : ""} ont deja releve le defi
              </div>
            )}
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ton pseudo"
              maxLength={120}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-[#a855f7]/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleStart}
              disabled={!user}
              className="w-full rounded-xl border-2 border-[#a855f7] bg-[#a855f7]/10 px-6 py-3.5 text-sm font-semibold text-[#a855f7] transition hover:bg-[#a855f7]/20 disabled:opacity-40"
            >
              {user ? "Relever le defi" : "Chargement..."}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === "playing" && user && soloTracks.length > 0) {
    return (
      <div className="min-h-screen bg-[#050505]">
        <SoloGameClient
          user={user}
          tracks={soloTracks}
          mode="solo"
          challengeCode={code}
          onChallengeComplete={handleChallengeComplete}
        />
      </div>
    )
  }

  if (phase === "leaderboard" && challenge) {
    // Build full leaderboard: creator + attempts
    const allEntries = [
      {
        playerName: challenge.creatorName,
        score: challenge.creatorScore,
        correct: challenge.creatorCorrect,
        total: challenge.creatorTotal,
        bestStreak: challenge.creatorBestStreak,
        isCreator: true,
        isCurrent: false,
      },
      ...leaderboard.map((entry) => ({
        ...entry,
        isCreator: false,
        isCurrent: entry.playerName === currentPlayerName,
      })),
    ].sort((a, b) => b.score - a.score)

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-[#a855f7]">Classement</p>
            <h1 className="text-3xl font-semibold">Resultats du defi</h1>
          </div>

          <div className="space-y-2">
            {allEntries.map((entry, idx) => {
              const isHighlighted = entry.isCurrent
              const medalColors = ["text-yellow-400", "text-gray-300", "text-orange-400"]
              return (
                <div
                  key={`${entry.playerName}-${idx}`}
                  className={`flex items-center justify-between rounded-xl border p-4 transition ${
                    isHighlighted
                      ? "border-[#a855f7]/50 bg-[#a855f7]/10"
                      : "border-white/10 bg-[#0c0c0c]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${idx < 3 ? medalColors[idx] : "text-white/40"}`}>
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{entry.playerName}</span>
                        {entry.isCreator && (
                          <span className="rounded-full bg-[#a855f7]/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#a855f7]">
                            Createur
                          </span>
                        )}
                        {isHighlighted && (
                          <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green-400">
                            Toi
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-white/40">
                        {entry.correct}/{entry.total} correct · Serie {entry.bestStreak}
                      </span>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-[#a855f7]">{entry.score} pts</span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <a
              href="/blindify/solo/"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/5"
            >
              Retour
            </a>
            <button
              type="button"
              onClick={() => {
                const challengeUrl = `https://tymmerc.eu/blindify/challenge/?code=${code}`
                navigator.clipboard.writeText(challengeUrl).catch(() => {})
              }}
              className="rounded-xl border-2 border-[#a855f7] bg-transparent px-5 py-2.5 text-sm font-semibold text-[#a855f7] transition hover:bg-[#a855f7]/10"
            >
              Copier le lien du defi
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
      <Loader2 className="h-8 w-8 animate-spin text-[#a855f7]" />
    </div>
  )
}

export default function ChallengePage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#050505] text-sm text-white/70">Chargement...</div>}>
      <ChallengeContent />
    </Suspense>
  )
}
