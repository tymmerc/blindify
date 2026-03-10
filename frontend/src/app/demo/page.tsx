"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { MultiplayerGameClient } from "@/components/game/MultiplayerGameClient"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import type { MultiplayerGameState, MultiplayerPlayerState, UserSummary } from "@/lib/types"
import { modeAccent } from "@/lib/uiTokens"

const DEMO_USER: UserSummary = {
  id: 1,
  provider: "guest",
  provider_id: "demo-guest",
  username: "Simulation",
  email: null,
  avatar: null,
}

const MOCK_TRACKS = [
  { title: "Echoes of Neon", artist: "Kairo Drive" },
  { title: "Midnight Relay", artist: "Velvet Loop" },
  { title: "Glass City Lights", artist: "Nova Pulse" },
]

function resetPlayers(players: Record<number, MultiplayerPlayerState>): Record<number, MultiplayerPlayerState> {
  const next: Record<number, MultiplayerPlayerState> = {}
  Object.values(players).forEach(player => {
    next[player.userId] = {
      ...player,
      hasAnswered: false,
      isReady: false,
      lastGuess: undefined,
      lastVerdict: undefined,
    }
  })
  return next
}

function createRoundState(index: number, players: Record<number, MultiplayerPlayerState>): MultiplayerGameState {
  const track = MOCK_TRACKS[index]
  const startAt = Date.now()
  const revealAt = startAt + 12000
  return {
    roomCode: "DEMO",
    hostUserId: DEMO_USER.id,
    mode: "friends",
    phase: "GUESSING",
    currentRound: index + 1,
    totalRounds: MOCK_TRACKS.length,
    currentTrack: track
      ? {
          round: index + 1,
          trackId: `demo-${index + 1}`,
          audioSourceId: `demo-${index + 1}`,
          title: track.title,
          artist: track.artist,
          previewUrl: null,
          albumCover: null,
          metadata: null,
        }
      : null,
    timing: { startAt, revealAt },
    players: resetPlayers(players),
    config: {
      autoAdvance: true,
      roundDurationMs: 12000,
    },
  }
}

function simulateReveal(state: MultiplayerGameState): MultiplayerGameState {
  const currentIdx = state.currentRound - 1
  const track = MOCK_TRACKS[currentIdx]
  const updatedPlayers: Record<number, MultiplayerPlayerState> = {}
  Object.values(state.players).forEach(player => {
    const correct = player.userId === DEMO_USER.id ? Boolean(player.lastGuess) : player.userId % 2 === 0
    const gain = correct ? 120 : 70
    const streak = correct ? (player.streak ?? 0) + 1 : 0
    updatedPlayers[player.userId] = {
      ...player,
      hasAnswered: true,
      isReady: false,
      lastGuess: player.lastGuess || track?.title || "Réponse démo",
      lastVerdict: correct ? "correct" : "close",
      score: (player.score ?? 0) + gain,
      accuracy: Math.min(100, (player.accuracy ?? 0) + (correct ? 8 : 3)),
      rounds: (player.rounds ?? 0) + 1,
      correct: (player.correct ?? 0) + (correct ? 1 : 0),
      streak,
      bestStreak: Math.max(player.bestStreak ?? 0, streak),
    }
  })
  return {
    ...state,
    phase: "REVEAL",
    players: updatedPlayers,
  }
}

function advanceFromReveal(state: MultiplayerGameState): MultiplayerGameState {
  if (state.currentRound >= state.totalRounds) {
    return { ...state, phase: "FINISHED" }
  }
  return createRoundState(state.currentRound, state.players)
}

export default function DemoPage() {
  const router = useRouter()
  const accent = modeAccent("event")

  const initialPlayers = useMemo<Record<number, MultiplayerPlayerState>>(
    () => ({
      [DEMO_USER.id]: {
        userId: DEMO_USER.id,
        username: "Toi (démo)",
        avatar: null,
        score: 0,
        accuracy: 80,
        rounds: 0,
        correct: 0,
        streak: 0,
        bestStreak: 0,
        hasAnswered: false,
        isReady: false,
      },
      2: {
        userId: 2,
        username: "Demo Bot",
        avatar: null,
        score: 0,
        accuracy: 75,
        rounds: 0,
        correct: 0,
        streak: 0,
        bestStreak: 0,
        hasAnswered: false,
        isReady: false,
      },
      3: {
        userId: 3,
        username: "Invité",
        avatar: null,
        score: 0,
        accuracy: 70,
        rounds: 0,
        correct: 0,
        streak: 0,
        bestStreak: 0,
        hasAnswered: false,
        isReady: false,
      },
    }),
    []
  )

  const [serverNow, setServerNow] = useState(Date.now())
  const [state, setState] = useState<MultiplayerGameState>(() => createRoundState(0, initialPlayers))

  useEffect(() => {
    const timer = setInterval(() => setServerNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setState(prev => {
      if (prev.phase !== "GUESSING") return prev
      if (!prev.timing.revealAt || serverNow < prev.timing.revealAt) return prev
      return simulateReveal(prev)
    })
  }, [serverNow])

  const handleAnswer = useCallback((guess: string) => {
    setState(prev => {
      if (prev.phase !== "GUESSING") return prev
      const self = prev.players[DEMO_USER.id]
      if (!self) return prev
      return {
        ...prev,
        players: {
          ...prev.players,
          [DEMO_USER.id]: { ...self, hasAnswered: true, lastGuess: guess },
        },
      }
    })
  }, [])

  const handleReady = useCallback(() => {
    setState(prev => {
      if (prev.phase !== "REVEAL") return prev
      const self = prev.players[DEMO_USER.id]
      if (!self) return prev
      const updatedPlayers = {
        ...prev.players,
        [DEMO_USER.id]: { ...self, isReady: true },
      }
      const allReady = Object.values(updatedPlayers).every(p => p.isReady)
      if (!allReady) {
        return { ...prev, players: updatedPlayers }
      }
      return advanceFromReveal({ ...prev, players: updatedPlayers })
    })
  }, [])

  return (
    <div className="min-h-screen bg-[#050505] px-6 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em]" style={{ color: accent }}>
              Simulation
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em]">Démo sans configuration</h1>
            <p className="text-sm text-white/70">Parcours complet offline : timings réels, réponses simulées, audio coupé.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push("/modes?from=/demo")}
            className="rounded-full border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            Retour modes
          </Button>
        </div>

        <SurfaceCard className="space-y-2">
          <h3 className="text-lg font-semibold text-white">Comment ça marche</h3>
          <p className="text-sm text-white/70">Pas de compte ni de Spotify. Les titres et scores sont simulés pour montrer le flow complet.</p>
        </SurfaceCard>

        <MultiplayerGameClient
          user={DEMO_USER}
          state={state}
          serverNow={serverNow}
          onAnswer={(title, artist) => handleAnswer(`${title} ${artist}`.trim())}
          onReady={handleReady}
          onExit={() => router.push("/modes?from=/demo")}
          disabled={state.phase === "FINISHED"}
          autoAdvance
          accentColor={accent}
          mode="event"
        />
      </div>
    </div>
  )
}
