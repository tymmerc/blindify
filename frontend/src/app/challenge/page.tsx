"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { clientApi } from "@/lib/apiClient"
import { api } from "@/lib/api"
import { SoloGameClient, type RoundStats } from "@/components/game/SoloGameClient"
import type { SoloTrack, UserSummary } from "@/lib/types"
import { publicPath } from "@/lib/publicPath"
import type { LeaderboardEntry } from "@/lib/challengeLeaderboard"
import { challengeLoadProblem, type ChallengeLoadProblem } from "@/lib/errorText"
import {
  NICKNAME_KEY,
  cleanPlayerName,
  extractChallengeCode,
  isChallengeCode,
  normalizeChallengeCode,
  readStored,
  rememberNicknameIfNone,
} from "@/lib/soloSetup"
import { ChallengeLeaderboard } from "./ChallengeLeaderboard"
import { ChallengeShell } from "./ChallengeShell"
import { ChallengeLoading, ChallengeProblem } from "./ChallengeStatus"

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

type Phase = "loading" | "intro" | "playing" | "leaderboard" | "error" | "no-code"

function ChallengeContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get("code")?.toUpperCase().trim() ?? ""

  const [phase, setPhase] = useState<Phase>(code ? "loading" : "no-code")
  const [challenge, setChallenge] = useState<ChallengeData | null>(null)
  const [problem, setProblem] = useState<ChallengeLoadProblem>("network")
  // Incremente par "Reessayer" : relance le chargement du defi.
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [playerName, setPlayerName] = useState("")
  const [user, setUser] = useState<UserSummary | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [currentPlayerName, setCurrentPlayerName] = useState("")
  const [codeInput, setCodeInput] = useState("")

  // Pseudo deja saisi sur Blindz (ecran d'entree ou defi precedent) : pre-rempli.
  useEffect(() => {
    const stored = readStored(NICKNAME_KEY)
    if (stored) setPlayerName(stored)
  }, [])

  // Ensure user session exists (guest if needed)
  useEffect(() => {
    api.ensureUserSession("Challenger").then((result) => {
      if (result) setUser(result.user)
    }).catch(() => {})
  }, [])

  // Chargement du defi. Les messages du serveur et du navigateur ne sont
  // jamais montres tels quels : 400/404 = defi introuvable, le reste se retente.
  useEffect(() => {
    if (!code) return
    let active = true
    clientApi.getChallenge(code).then((data) => {
      if (!active) return
      setChallenge(data)
      setPhase("intro")
    }).catch((err) => {
      if (!active) return
      setProblem(challengeLoadProblem(err))
      setPhase("error")
    })
    return () => {
      active = false
    }
  }, [code, loadAttempt])

  const handleRetry = useCallback(() => {
    setPhase("loading")
    setLoadAttempt((n) => n + 1)
  }, [])

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
    const name = cleanPlayerName(playerName)
    setCurrentPlayerName(name)
    setPhase("playing")
  }, [playerName])

  const handleChallengeComplete = useCallback(async (stats: RoundStats) => {
    if (!code) return
    try {
      const result = await clientApi.completeChallenge(code, {
        playerName: currentPlayerName,
        score: stats.points,
        correct: stats.correct,
        total: stats.rounds,
        bestStreak: stats.bestStreak,
      })
      setLeaderboard(result.leaderboard)
      // Nom retenu pour la prochaine fois, sans ecraser le pseudo de /jouer.
      rememberNicknameIfNone(currentPlayerName)
    } catch {
      // Still show leaderboard from challenge data if submit fails
      if (challenge) {
        setLeaderboard(challenge.attempts)
      }
    }
    setPhase("leaderboard")
  }, [code, currentPlayerName, challenge])

  const handleCodeSubmit = useCallback(() => {
    const trimmed = normalizeChallengeCode(codeInput)
    if (isChallengeCode(trimmed)) {
      // publicPath : pas de /blindify en dur, la prod est servie a la racine.
      window.location.href = `${publicPath("/challenge/")}?code=${encodeURIComponent(trimmed)}`
    }
  }, [codeInput])

  if (phase === "no-code") {
    return (
      <ChallengeShell>
        <div className="space-y-6 text-center">
          <h1 className="font-display text-3xl font-semibold">Rejoindre un défi</h1>
          <p className="text-sm text-[#6b573f]">Un pote t&apos;a lancé un défi ? Tape le code qu&apos;il t&apos;a envoyé.</p>
          <div className="flex gap-3">
            <label htmlFor="challenge-code" className="sr-only">Code du défi</label>
            <input
              id="challenge-code"
              type="text"
              value={codeInput}
              // Pas de maxLength : le lien entier peut etre colle ici, on en garde le code.
              onChange={(e) => setCodeInput(extractChallengeCode(e.target.value).slice(0, 12))}
              placeholder="CODE DU DÉFI"
              className="flex-1 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-center font-display text-lg font-semibold tracking-[0.3em] text-[#2e2014] outline-none transition placeholder:font-sans placeholder:text-sm placeholder:italic placeholder:tracking-[0.15em] placeholder:text-[#b3a182] focus:border-[#c65133]"
              onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
            />
          </div>
          <button
            type="button"
            onClick={handleCodeSubmit}
            disabled={!isChallengeCode(codeInput)}
            className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Rejoindre
          </button>
          <p className="text-sm text-[#6b573f]">
            Tu veux lancer le tien ?{" "}
            <a href={`${publicPath("/solo/")}?tab=challenge`} className="font-bold text-[#2e2014] underline decoration-[#c65133] decoration-2 underline-offset-2">
              Crée un défi
            </a>{" "}
            depuis le solo.
          </p>
        </div>
      </ChallengeShell>
    )
  }

  if (phase === "loading") return <ChallengeLoading />

  if (phase === "error") return <ChallengeProblem problem={problem} onRetry={handleRetry} />

  if (phase === "intro" && challenge) {
    return (
      <ChallengeShell>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="break-words font-display text-3xl font-semibold">
              Défi de <em className="font-medium italic text-[#c65133]">{challenge.creatorName}</em>
            </h1>
            <p className="break-words text-sm text-[#6b573f]">
              Un blind test sur {challenge.trackCount} morceau{challenge.trackCount > 1 ? "x" : ""}, les mêmes que {challenge.creatorName} et dans le même ordre. Trouve le titre et l&apos;artiste, et bats son score.
            </p>
          </div>

          <div className="space-y-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6b573f]">Score à battre</span>
              <span className="font-display text-2xl font-bold text-[#c65133]">{challenge.creatorScore} pts</span>
            </div>
            <div className="flex items-center justify-between text-sm text-[#6b573f]">
              <span>{challenge.creatorCorrect}/{challenge.creatorTotal} correct</span>
              <span>Série max : {challenge.creatorBestStreak}</span>
            </div>
            {challenge.attempts.length > 0 && (
              <div className="border-t-2 border-dotted border-[rgba(46,32,20,.45)] pt-3 text-xs text-[#6b573f]">
                {challenge.attempts.length > 1
                  ? `${challenge.attempts.length} joueurs ont déjà relevé le défi`
                  : "1 joueur a déjà relevé le défi"}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label htmlFor="challenger-name" className="block text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b573f]">
              Ton nom au classement
            </label>
            <input
              id="challenger-name"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ton pseudo"
              maxLength={24}
              className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-1 py-2 font-display text-lg text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
            <button
              type="button"
              onClick={handleStart}
              /* Pseudo obligatoire : un classement sans nom ne sert a personne. */
              disabled={!user || playerName.trim().length < 2}
              className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {user ? "Relever le défi" : "Chargement..."}
            </button>
          </div>
        </div>
      </ChallengeShell>
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
    return <ChallengeLeaderboard challenge={challenge} attempts={leaderboard} currentPlayerName={currentPlayerName} />
  }

  return <ChallengeLoading />
}

export default function ChallengePage() {
  return (
    <Suspense fallback={<ChallengeLoading />}>
      <ChallengeContent />
    </Suspense>
  )
}
