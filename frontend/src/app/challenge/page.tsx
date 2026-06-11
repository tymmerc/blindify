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
      <div className="flex min-h-screen items-center justify-center px-6 text-[#2e2014]">
        <div className="w-full max-w-md space-y-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Defi</p>
          <h1 className="font-display text-3xl font-semibold">Rejoindre un defi</h1>
          <p className="text-sm text-[#6b573f]">Entre le code du defi pour commencer</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="CODE DU DEFI"
              maxLength={12}
              className="flex-1 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-center font-display text-lg font-semibold tracking-[0.3em] text-[#2e2014] outline-none transition placeholder:font-sans placeholder:text-sm placeholder:italic placeholder:tracking-[0.15em] placeholder:text-[#b3a182] focus:border-[#c65133]"
              onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
            />
          </div>
          <button
            type="button"
            onClick={handleCodeSubmit}
            disabled={codeInput.trim().length < 4}
            className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Rejoindre
          </button>
        </div>
      </div>
    )
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-[#2e2014]">
        <Loader2 className="h-8 w-8 animate-spin text-[#c65133]" />
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-[#2e2014]">
        <div className="w-full max-w-md space-y-4 border-2 border-[#2e2014] bg-[#ece1c8] p-8 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <h1 className="font-display text-2xl font-semibold text-[#9c2f1d]">Defi introuvable</h1>
          <p className="text-sm text-[#6b573f]">{error}</p>
          <a
            href="/blindify/challenge/"
            className="inline-block rounded-full border-[1.5px] border-[#2e2014] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Entrer un code
          </a>
        </div>
      </div>
    )
  }

  if (phase === "intro" && challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-[#2e2014]">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Defi</p>
            <h1 className="font-display text-3xl font-semibold">
              Defi de <em className="font-medium italic text-[#c65133]">{challenge.creatorName}</em>
            </h1>
            <p className="text-sm text-[#6b573f]">
              {challenge.trackCount} titre{challenge.trackCount > 1 ? "s" : ""}
            </p>
          </div>

          <div className="space-y-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6b573f]">Score a battre</span>
              <span className="font-display text-2xl font-bold text-[#c65133]">{challenge.creatorScore} pts</span>
            </div>
            <div className="flex items-center justify-between text-sm text-[#6b573f]">
              <span>{challenge.creatorCorrect}/{challenge.creatorTotal} correct</span>
              <span>Serie max : {challenge.creatorBestStreak}</span>
            </div>
            {challenge.attempts.length > 0 && (
              <div className="border-t-2 border-dotted border-[rgba(46,32,20,.45)] pt-3 text-xs text-[#8a7558]">
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
              className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-1 py-2 font-display text-lg text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
            <button
              type="button"
              onClick={handleStart}
              disabled={!user}
              className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
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
      <div className="min-h-screen">
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
      <div className="flex min-h-screen items-center justify-center px-6 text-[#2e2014]">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Face B · Classement</p>
            <h1 className="font-display text-3xl font-semibold">Resultats du defi</h1>
          </div>

          <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            {allEntries.map((entry, idx) => {
              const isHighlighted = entry.isCurrent
              return (
                <div
                  key={`${entry.playerName}-${idx}`}
                  className="flex items-baseline gap-3 py-2.5"
                >
                  <span className="w-8 shrink-0 text-xs font-bold text-[#8a7558]">
                    A{idx + 1}
                  </span>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className={`truncate font-display text-base font-semibold ${isHighlighted ? "text-[#c65133]" : "text-[#2e2014]"}`}>
                      {entry.playerName}
                    </span>
                    {entry.isCreator && (
                      <span className="shrink-0 rounded-full border-[1.5px] border-[#e0a32e] bg-[#e0a32e] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                        Createur
                      </span>
                    )}
                    {isHighlighted && (
                      <span className="shrink-0 rounded-full border-[1.5px] border-[#7d9471] bg-[#7d9471] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]">
                        Toi
                      </span>
                    )}
                  </div>
                  <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-[rgba(46,32,20,.45)]" />
                  <span className="shrink-0 text-right">
                    <span className="font-display text-base font-bold text-[#2e2014]">{entry.score} pts</span>
                    <span className="block text-[10px] text-[#8a7558]">
                      {entry.correct}/{entry.total} · serie {entry.bestStreak}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <a
              href="/blindify/solo/"
              className="rounded-full border-[1.5px] border-[#2e2014] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            >
              Retour
            </a>
            <button
              type="button"
              onClick={() => {
                const challengeUrl = `https://tymmerc.eu/blindify/challenge/?code=${code}`
                navigator.clipboard.writeText(challengeUrl).catch(() => {})
              }}
              className="btn-neon text-sm"
            >
              Copier le lien du defi
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-[#2e2014]">
      <Loader2 className="h-8 w-8 animate-spin text-[#c65133]" />
    </div>
  )
}

export default function ChallengePage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[#6b573f]">Chargement...</div>}>
      <ChallengeContent />
    </Suspense>
  )
}
