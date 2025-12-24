"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { api } from "@/lib/api"
import type { SoloTrack, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowRight, Check, Flame, Heart, Loader2, Play, Sparkles, Timer, Volume2, VolumeX } from "lucide-react"
import { getSocket } from "@/lib/socket"
import { audioManager, DEFAULT_AUDIO_VOLUME } from "@/lib/audioManager"
import { RoundUiState, roundFlowReducer, computeScore, resolveModeFlags, ROUND_FEEDBACK_MS } from "@/lib/roundFlow"
import { useMode } from "@/contexts/ModeContext"

type Verdict = "correct" | "close" | "wrong"
type FinalizeReason = "timeout" | "reveal" | "guess"
type RoundState = "pending" | "current" | Verdict

const UUID_LIKE_REGEX = /^[0-9a-fA-F-]{10,}$/;

export interface SoloGameClientProps {
  user: UserSummary
  tracks: SoloTrack[]
  sessionId?: number
  mode?: "solo" | "multiplayer"
  isHost?: boolean
  autoAdvance?: boolean
  difficulty?: "easy" | "normal" | "hard"
  source?: string
  leaderboard?: Array<{ userId: number; username: string | null; score: number; accuracy: number }>
  sharedDeadlineMs?: number | null
  nextSignal?: number
  nextRoundNumber?: number
  nextTrackId?: string
  roomCode?: string
  onHostNext?: (nextRound: number, revealAt: number) => void
  onRoundComplete?: (payload: {
    track: SoloTrack
    verdict: Verdict
    guess: string
    round: number
    stats: RoundStats
  }) => void
  onGameComplete?: (stats: RoundStats) => void
}

export interface RoundStats {
  rounds: number
  correct: number
  streak: number
  bestStreak: number
  points: number
}

const LISTENING_DURATION = 45
const COUNTDOWN_DURATION = 3
const LISTENING_DURATION_MS = LISTENING_DURATION * 1000
const AUDIO_OWNER = "solo"

function ListeningSurface({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(168,85,247,0.18),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(34,197,94,0.12),transparent_55%)]" />
      {active ? (
        <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.12),transparent_55%)]" />
      ) : null}
    </div>
  )
}

function AudioBars() {
  return (
    <div className="flex items-end gap-1">
      {[6, 10, 14, 10, 6].map((h, idx) => (
        <span
          key={idx}
          className="w-1.5 rounded-sm bg-[var(--ma-gradient)]"
          style={{
            height: `${h * 4}px`,
            animation: `barPulse 1.2s ease-in-out ${idx * 0.1}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes barPulse {
          0%,
          100% {
            transform: scaleY(0.6);
            opacity: 0.6;
          }
          50% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

export function SoloGameClient({
  user,
  tracks,
  mode = "solo",
  isHost = false,
  autoAdvance = false,
  difficulty = "normal",
  source = "library",
  leaderboard,
  sharedDeadlineMs = null,
  nextSignal = 0,
  nextRoundNumber,
  nextTrackId,
  onHostNext,
  onRoundComplete,
  onGameComplete,
  sessionId,
  roomCode,
}: SoloGameClientProps) {
  const { accentColor } = useMode()
  const modeFlags = resolveModeFlags(undefined, accentColor)
  const [trackList, setTrackList] = useState<SoloTrack[]>(tracks)
  const [index, setIndex] = useState(0)
  const [flow, dispatchFlow] = useReducer(roundFlowReducer, {
    state: RoundUiState.Idle,
    startAt: null,
    deadline: null,
    lockedAt: null,
    revealedAt: null,
  })
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION)
  const [timer, setTimer] = useState(LISTENING_DURATION)
  const [guess, setGuess] = useState("")
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [feedback, setFeedback] = useState(false)
  const [liking, setLiking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameFinished, setGameFinished] = useState(false)
  const [roundStates, setRoundStates] = useState<RoundState[]>(() =>
    tracks.map((_, i) => (i === 0 ? "current" : "pending"))
  )
  const [resultDialog, setResultDialog] = useState<{
    track: SoloTrack
    verdict: Verdict
    round: number
    guess: string
    guessTitle: string
    guessArtist: string
    points: number
    breakdown: {
      base: number
      speed: number
      streakBonus: number
    }
  } | null>(null)
  const lastDialogRoundRef = useRef<number>(0)
  const finalizeLockRef = useRef<number | null>(null)
  const [likedTrackIds, setLikedTrackIds] = useState<Record<string, boolean>>({})
  const [likeStatus, setLikeStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const [stats, setStats] = useState<RoundStats>({
    rounds: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    points: 0,
  })
  const [manualPlayRequired, setManualPlayRequired] = useState(false)
  const [muted, setMuted] = useState(audioManager.getState().muted)
  const lastVolumeRef = useRef(DEFAULT_AUDIO_VOLUME)
  const [volume, setVolume] = useState(DEFAULT_AUDIO_VOLUME)
  const [showVolume, setShowVolume] = useState(false)
  const volumeHoverRef = useRef<NodeJS.Timeout | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const dismissedRoundsRef = useRef<Set<number>>(new Set())
  const historyContainerRef = useRef<HTMLDivElement | null>(null)
  const historyItemRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const sharedDeadlineRef = useRef<number | null>(null)
  const readyRoundRef = useRef<number | null>(null)
  const pausedByUserRef = useRef(false)
  const skipCountdownRef = useRef(false)
  const playStartedRef = useRef<string | null>(null)

  const statsRef = useRef(stats)
  const guessRef = useRef(guess)
  const guessTitleRef = useRef(guessTitle)
  const guessArtistRef = useRef(guessArtist)
  const verdictRef = useRef<Verdict | null>(verdict)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const listeningRafRef = useRef<number | null>(null)
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const listeningDeadlineRef = useRef<number>(0)
  const listeningStartAtRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const lastSyncedRoundRef = useRef<number | null>(null)

  const prevTracksKeyRef = useRef<string | null>(null)
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastStartSignalRef = useRef<number>(0)
  const isMultiplayer = mode === "multiplayer"
  const uiState = flow.state
  const isArmed = uiState === RoundUiState.Armed
  const isLocked = uiState === RoundUiState.Locked
  const isRevealed = uiState === RoundUiState.Revealed
  const accentTint = useCallback(
    (alpha: number) => {
      const hex = accentColor.startsWith("#") ? accentColor.slice(1) : accentColor
      if (hex.length !== 6) return accentColor
      const clamped = Math.min(255, Math.max(0, Math.round(alpha * 255)))
      const channel = clamped.toString(16).padStart(2, "0")
      return `#${hex}${channel}`
    },
    [accentColor]
  )

  useEffect(() => {
    return audioManager.subscribe(snapshot => {
      setMuted(snapshot.muted)
      setVolume(snapshot.volume)
      if (snapshot.volume > 0) {
        lastVolumeRef.current = snapshot.volume
      }
      if (snapshot.owner === AUDIO_OWNER) {
        setIsPlaying(snapshot.playing)
        audioRef.current = audioManager.getCurrent(AUDIO_OWNER)
      } else {
        setIsPlaying(false)
        audioRef.current = null
      }
    })
  }, [])

  useEffect(() => {
    const key = tracks.map(t => t.audioSourceId ?? t.track_id).join("|")
    if (prevTracksKeyRef.current === key) return
    prevTracksKeyRef.current = key
    historyItemRefs.current = {}
    setTrackList(tracks)
    setRoundStates(tracks.map((_, i) => (i === 0 ? "current" : "pending")))
    setIndex(0)
    lastDialogRoundRef.current = 0
    lastStartSignalRef.current = 0
    setResultDialog(null)
    dismissedRoundsRef.current.clear()
  }, [tracks])

  const current = trackList[index]
  const total = trackList.length
  const hasMoreRounds = index < total - 1
  const accuracy = stats.rounds > 0 ? Math.round((stats.correct / stats.rounds) * 100) : 0
  const history = useMemo(
    () =>
      trackList.map((track, i) => ({
        round: i + 1,
        title: track.title,
        artist: track.artist,
        state: roundStates[i] ?? "pending",
      })),
    [trackList, roundStates]
  )

  const markReady = useCallback(
    (roundNumber: number) => {
      if (!isMultiplayer || !roomCode) return
      if (readyRoundRef.current === roundNumber) return
      readyRoundRef.current = roundNumber
      const socket = getSocket()
      socket.emit("round:ready", { roomCode, round: roundNumber })
    },
    [isMultiplayer, roomCode]
  )

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  useEffect(() => {
    guessRef.current = guess
  }, [guess])

  useEffect(() => {
    guessTitleRef.current = guessTitle
  }, [guessTitle])

  useEffect(() => {
    guessArtistRef.current = guessArtist
  }, [guessArtist])

  useEffect(() => {
    verdictRef.current = verdict
  }, [verdict])

  const cleanupTimers = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }
    if (listeningRafRef.current !== null) {
      cancelAnimationFrame(listeningRafRef.current)
      listeningRafRef.current = null
    }
    audioManager.stop("solo_cleanup", AUDIO_OWNER)
    audioRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      cleanupTimers()
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
        autoAdvanceTimerRef.current = null
      }
    }
  }, [cleanupTimers])

  const hideCorrectAnswerPopup = useCallback(
    (roundToDismiss?: number) => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
        autoAdvanceTimerRef.current = null
      }
      setResultDialog(prev => {
        const closingRound = roundToDismiss ?? prev?.round ?? index + 1
        if (closingRound) {
          dismissedRoundsRef.current.add(closingRound)
          lastDialogRoundRef.current = Math.max(lastDialogRoundRef.current, closingRound)
        }
        return null
      })
    },
    [index]
  )

  const resolveTargetIndex = useCallback(
    (targetRound?: number, targetTrackId?: string | number) => {
      if (total <= 0) return 0
      if (targetTrackId) {
        const targetKey = String(targetTrackId)
        const found = trackList.findIndex(track => {
          const candidates = [track.audioSourceId, track.track_id]
            .filter(Boolean)
            .map(value => String(value))
          return candidates.includes(targetKey)
        })
        if (found >= 0) return found
      }
      if (typeof targetRound === "number" && Number.isFinite(targetRound)) {
        return Math.min(Math.max(0, targetRound - 1), total - 1)
      }
      return Math.min(Math.max(0, index + 1), total - 1)
    },
    [index, total, trackList]
  )

  const resetRoundState = useCallback(
    (targetRound: number, targetTrackId?: string | number, revealAt?: number) => {
      const targetIndex = resolveTargetIndex(targetRound, targetTrackId)
      cleanupTimers()
      dispatchFlow({ type: "RESET" })
      setVerdict(null)
      setFeedback(false)
      setGuess("")
      setGuessTitle("")
      setGuessArtist("")
      finalizeLockRef.current = null
      setError(null)
      setManualPlayRequired(false)
      setIsPlaying(false)
      pausedByUserRef.current = false
      setMuted(false)
      setTimer(LISTENING_DURATION)
      setCountdown(COUNTDOWN_DURATION)
      setGameFinished(false)
      sharedDeadlineRef.current = revealAt ?? sharedDeadlineRef.current ?? null
      listeningDeadlineRef.current = revealAt ?? listeningDeadlineRef.current ?? 0
      previewUrlRef.current = null
      playStartedRef.current = null
      setRoundStates(prev => {
        const next = [...prev]
        next.forEach((state, idx) => {
          if (idx === targetIndex) {
            next[idx] = state === "correct" || state === "close" || state === "wrong" ? state : "current"
          } else if (idx > targetIndex && state === "current") {
            next[idx] = "pending"
          }
        })
        return next
      })
      setIndex(Math.min(Math.max(0, targetIndex), Math.max(0, total - 1)))
      return targetIndex
    },
    [cleanupTimers, resolveTargetIndex, total]
  )

  const startTrackForRound = useCallback(
    (targetRound: number, targetTrackId?: string | number, revealAt?: number, opts?: { skipCountdown?: boolean }) => {
      readyRoundRef.current = null
      const now = Date.now()
      const warmupMs = opts?.skipCountdown ? 0 : COUNTDOWN_DURATION * 1000
      const providedDeadline =
        revealAt && Number.isFinite(revealAt) && revealAt > now - 2000 ? revealAt : null
      const deadlineCandidate = providedDeadline ?? now + warmupMs + LISTENING_DURATION_MS
      const startAt = Math.max(now + warmupMs, deadlineCandidate - LISTENING_DURATION_MS)
      const deadline = Math.max(startAt + LISTENING_DURATION_MS, deadlineCandidate)
      listeningDeadlineRef.current = deadline
      listeningStartAtRef.current = startAt
      const countdownMs = Math.max(0, startAt - now)
      const targetIndex = resetRoundState(targetRound, targetTrackId, deadline)
      sharedDeadlineRef.current = deadline
      dispatchFlow({ type: "ARM", startAt, deadline })
      skipCountdownRef.current = countdownMs === 0
      lastSyncedRoundRef.current = null
      setTimer(Math.max(0, Math.ceil((deadline - now) / 1000)))
      if (countdownMs === 0) {
        setCountdown(0)
        dispatchFlow({ type: "START", at: startAt })
      } else {
        setCountdown(Math.max(1, Math.ceil(countdownMs / 1000)))
      }
      return targetIndex
    },
    [resetRoundState, dispatchFlow]
  )

  const finalizeRound = useCallback(
    (nextVerdict: Verdict, reason: FinalizeReason, track: SoloTrack, submittedGuess: string) => {
      if (!track) return
      if (uiState === RoundUiState.Revealed) return
      if (finalizeLockRef.current === index) return
      finalizeLockRef.current = index

      cleanupTimers()

      const now = Date.now()
      dispatchFlow({ type: "LOCK", at: now })

      const startedAt = flow.startAt
      const reactionMs = startedAt ? Math.max(0, now - startedAt) : null
      const detail = evaluateGuessDetail(submittedGuess, track)
      const finalVerdict = detail.verdict ?? nextVerdict

      const prevStats = statsRef.current
      const correct = finalVerdict === "correct"
      const scoreResult = computeScore({
        correct,
        reactionMs,
        maxDurationMs: LISTENING_DURATION_MS,
        streak: prevStats.streak,
      })
      const gainedPoints = scoreResult.gained
      const streak = scoreResult.nextStreak

      const updatedStats: RoundStats = {
        rounds: prevStats.rounds + 1,
        correct: prevStats.correct + (correct ? 1 : 0),
        streak,
        bestStreak: Math.max(prevStats.bestStreak, streak),
        points: prevStats.points + gainedPoints,
      }

      statsRef.current = updatedStats
      setStats(updatedStats)
      setVerdict(finalVerdict)
      verdictRef.current = finalVerdict
      setFeedback(false)

      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current)
        revealTimeoutRef.current = null
      }
      revealTimeoutRef.current = setTimeout(() => {
        dispatchFlow({ type: "REVEAL", at: Date.now() })
        // Signal readiness for this round in multiplayer so the host can advance
        markReady(index + 1)
        setResultDialog({
          track,
          verdict: finalVerdict,
          round: index + 1,
          guess: submittedGuess,
          guessTitle: guessTitleRef.current,
          guessArtist: guessArtistRef.current,
          points: gainedPoints,
        breakdown: scoreResult.breakdown,
        })
        lastDialogRoundRef.current = index + 1
      }, 120)

      onRoundComplete?.({
        track,
        verdict: finalVerdict,
        guess: submittedGuess,
        round: index + 1,
        stats: updatedStats,
      })
      setRoundStates(prev => {
        const copy = [...prev]
        copy[index] = finalVerdict
        if (index + 1 < copy.length) {
          copy[index + 1] = "current"
        }
        return copy
      })

      if (index >= total - 1) {
        setGameFinished(true)
        onGameComplete?.(updatedStats)
      }
    },
    [cleanupTimers, uiState, flow.startAt, dispatchFlow, index, total, onRoundComplete, onGameComplete, markReady]
  )

  const scheduleListeningTimer = useCallback(
    (track: SoloTrack) => {
      const now = Date.now()
      const externalDeadline =
        sharedDeadlineRef.current && sharedDeadlineRef.current > now
          ? sharedDeadlineRef.current
          : sharedDeadlineMs && sharedDeadlineMs > now
            ? sharedDeadlineMs
            : null
      listeningDeadlineRef.current = externalDeadline ?? now + LISTENING_DURATION_MS
      if (listeningDeadlineRef.current <= now) {
        listeningDeadlineRef.current = now + LISTENING_DURATION_MS
      }
      listeningStartAtRef.current = Math.max(now, listeningDeadlineRef.current - LISTENING_DURATION_MS)

      const tick = () => {
        const remainingMs = listeningDeadlineRef.current - Date.now()
        const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
        setTimer(prev => (prev === nextSeconds ? prev : nextSeconds))
        if (remainingMs <= 0) {
          const latestGuess = guessRef.current
          const computedVerdict = verdictRef.current ?? evaluateGuess(latestGuess, track)
          finalizeRound(computedVerdict, "timeout", track, latestGuess)
        } else {
          listeningRafRef.current = requestAnimationFrame(tick)
        }
      }

      listeningRafRef.current = requestAnimationFrame(tick)
    },
    [finalizeRound, sharedDeadlineMs]
  )

  useEffect(() => {
    if (!current || gameFinished) return

    if (skipCountdownRef.current) {
      skipCountdownRef.current = false
      return
    }

    // Only run countdown when explicitly in countdown phase.
    if (uiState !== RoundUiState.Armed) return

    cleanupTimers()

    const updateCountdown = () => {
      const now = Date.now()
      const startAt = listeningStartAtRef.current || now
      const deadline = listeningDeadlineRef.current || startAt + LISTENING_DURATION_MS
      const untilStart = Math.max(0, Math.ceil((startAt - now) / 1000))
      const untilReveal = Math.max(0, Math.ceil((deadline - now) / 1000))
      setCountdown(untilStart)
      setTimer(untilReveal)
      if (untilStart <= 0) {
        dispatchFlow({ type: "START", at: startAt })
        return true
      }
      return false
    }

    if (updateCountdown()) {
      return
    }

    countdownRef.current = setInterval(() => {
      if (updateCountdown()) {
        if (countdownRef.current) clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }, 1000)
    setGuess("")
    setGuessTitle("")
    setGuessArtist("")
    setVerdict(null)
    setFeedback(false)
    setMuted(false)
    setIsPlaying(false)
    setError(null)
    setManualPlayRequired(false)
    pausedByUserRef.current = false
    playStartedRef.current = null
    previewUrlRef.current = null

    return () => {
      cleanupTimers()
    }
  }, [current, cleanupTimers, gameFinished, uiState, dispatchFlow])

  useEffect(() => {
    setRoundStates(prev =>
      trackList.map((_, i) => {
        if (prev[i]) return prev[i]
        return i === 0 ? "current" : "pending"
      })
    )
  }, [trackList])

  useEffect(() => {
    if (flow.state !== RoundUiState.Idle) return
    if (!trackList[index]) return
    const targetTrack = trackList[index]
    const targetId = targetTrack?.audioSourceId ?? targetTrack?.track_id
    startTrackForRound(index + 1, targetId, sharedDeadlineMs ?? undefined, { skipCountdown: false })
  }, [flow.state, trackList, index, startTrackForRound, sharedDeadlineMs])

  // Synchronise le timer avec une échéance partagée (round:start/started socket)
  useEffect(() => {
    if (uiState !== RoundUiState.Playing) return
    const roundNumber = Math.floor(index / 1) + 1
    if (lastSyncedRoundRef.current === roundNumber) return
    lastSyncedRoundRef.current = roundNumber
    const now = Date.now()
    const deadline =
      sharedDeadlineMs && sharedDeadlineMs > now
        ? sharedDeadlineMs
        : now + LISTENING_DURATION * 1000
    listeningDeadlineRef.current = deadline
    sharedDeadlineRef.current = deadline
    setTimer(Math.max(0, Math.ceil((deadline - now) / 1000)))
  }, [sharedDeadlineMs, uiState, index])

  useEffect(() => {
    if (!autoAdvanceTimerRef.current) return
    return () => {
      clearTimeout(autoAdvanceTimerRef.current!)
      autoAdvanceTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    setRoundStates(prev => {
      const copy = [...prev]
      if (copy[index] === "pending") copy[index] = "current"
      return copy
    })
  }, [index])

  useEffect(() => {
    const container = historyContainerRef.current
    if (!container) return
    const currentRoundNumber = Math.min(index + 1, trackList.length)
    const target = historyItemRefs.current[currentRoundNumber]
    if (!target || !container.contains(target)) return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const isVisible = targetRect.top >= containerRect.top && targetRect.bottom <= containerRect.bottom
    if (!isVisible) {
      target.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }, [index, trackList.length, roundStates])

  useEffect(() => {
    if (!current || gameFinished) return
    if (uiState !== RoundUiState.Playing) return

    cleanupTimers()
    setTimer(LISTENING_DURATION)

    let cancelled = false

    const ensurePreview = async () => {
      if (current.audio_url) {
        previewUrlRef.current = current.audio_url
        return current.audio_url
      }
      if (current.type !== "spotify") return null
      try {
        const token = await api.getSpotifyToken()
        const queries = [
          `track:${current.title} artist:${current.artist}`,
          current.title,
        ]
        for (const q of queries) {
          const resp = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
            headers: { Authorization: `Bearer ${token.accessToken}` },
          })
          if (!resp.ok) continue
          const data = await resp.json()
          const preview = data?.tracks?.items?.[0]?.preview_url as string | undefined
          if (preview) {
            setTrackList(prev =>
              prev.map(t => (t.audioSourceId === current.audioSourceId ? { ...t, audio_url: preview } : t))
            )
            previewUrlRef.current = preview
            return preview
          }
        }
        return null
      } catch (err) {
        console.error("preview_fallback_failed", err)
        return null
      }
    }

    const startAudio = async (previewUrl: string, track: SoloTrack) => {
      audioManager.stop("solo_replace")
      await audioManager.play({
        src: previewUrl,
        loop: true,
        volume: muted ? 0 : lastVolumeRef.current,
        owner: AUDIO_OWNER,
      })
      if (cancelled) return
      audioManager.setMuted(muted, AUDIO_OWNER)
      audioManager.setVolume(muted ? 0 : lastVolumeRef.current, AUDIO_OWNER)
      audioRef.current = audioManager.getCurrent(AUDIO_OWNER)
      setManualPlayRequired(false)
      setFeedback(false)
      setIsPlaying(true)
      pausedByUserRef.current = false
      scheduleListeningTimer(track)
    }

    const startPlayback = async () => {
      const previewUrl = await ensurePreview()
      if (!previewUrl) {
        setFeedback(true)
        const latestGuess = guessRef.current
        finalizeRound("wrong", "timeout", current, latestGuess)
        return
      }

      previewUrlRef.current = previewUrl
      playStartedRef.current = current?.audioSourceId ?? current?.track_id ?? "round"

      try {
        await startAudio(previewUrl, current)
      } catch (err) {
        if (cancelled) return
        if ((err as DOMException)?.name === "NotAllowedError") {
          setManualPlayRequired(true)
          setFeedback(true)
          return
        }
        console.error("html_audio_play_failed", err)
        setFeedback(true)
        setManualPlayRequired(true)
        setIsPlaying(false)
      }
    }

    startPlayback()

    return () => {
      cancelled = true
      if (listeningRafRef.current !== null) {
        cancelAnimationFrame(listeningRafRef.current)
        listeningRafRef.current = null
      }
      audioManager.stop("solo_listening_cleanup", AUDIO_OWNER)
    }
  }, [
    uiState,
    current,
    cleanupTimers,
    finalizeRound,
    gameFinished,
    hasMoreRounds,
    total,
    setIndex,
    scheduleListeningTimer,
    muted,
  ])

  const handleManualPlay = useCallback(async () => {
    if (!current) return
    const previewUrl = previewUrlRef.current
    if (!previewUrl) {
      setFeedback(true)
      return
    }
    try {
      audioManager.stop("solo_manual_replace")
      await audioManager.play({
        src: previewUrl,
        loop: true,
        volume: muted ? 0 : lastVolumeRef.current,
        owner: AUDIO_OWNER,
      })
      audioManager.setMuted(muted, AUDIO_OWNER)
      audioManager.setVolume(muted ? 0 : lastVolumeRef.current, AUDIO_OWNER)
      audioRef.current = audioManager.getCurrent(AUDIO_OWNER)
      setManualPlayRequired(false)
      setIsPlaying(true)
      pausedByUserRef.current = false
      scheduleListeningTimer(current)
    } catch (err) {
      console.error("manual_play_failed", err)
      setFeedback(true)
    }
  }, [current, scheduleListeningTimer, muted])

  const albumName = useMemo(() => {
    if (!current?.metadata) return null
    return (current.metadata.album as string | undefined) ?? null
  }, [current])

  const releaseYear = useMemo(() => {
    if (!current?.metadata) return null
    const release = current.metadata.release_date as string | undefined
    if (!release) return null
    return release.slice(0, 4)
  }, [current])

  const handleGuessSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!current || isRevealed || isLocked || uiState !== RoundUiState.Playing) return
      const currentVerdict = evaluateGuess(guess, current)
      setVerdict(currentVerdict)
      finalizeRound(currentVerdict, "guess", current, guess)
    },
    [current, guess, isRevealed, isLocked, uiState, finalizeRound]
  )

  const handleReveal = useCallback(() => {
    if (!current) return
    const finalVerdict = verdict ?? evaluateGuess(guess, current)
    finalizeRound(finalVerdict, "reveal", current, guess)
  }, [current, verdict, guess, finalizeRound])

  const handleNext = useCallback(
    (emitHost = true, targetRound?: number, skipCountdown = false) => {
      const nextRound = typeof targetRound === "number" ? targetRound : index + 2
      if (mode === "multiplayer" && onHostNext && isHost && emitHost) {
        // Host only emits the intent; the round:started broadcast will close the popup for everyone.
        const revealAt = Date.now() + LISTENING_DURATION * 1000
        onHostNext(nextRound, revealAt)
        return
      }
      hideCorrectAnswerPopup()
      if (!hasMoreRounds) {
        setGameFinished(true)
        return
      }
      startTrackForRound(nextRound, undefined, sharedDeadlineMs ?? undefined, { skipCountdown })
    },
    [mode, onHostNext, isHost, index, hideCorrectAnswerPopup, hasMoreRounds, startTrackForRound, sharedDeadlineMs]
  )

  const forceAdvanceTo = useCallback(
    (targetIndex: number, revealAt?: number) => {
      const clamped = Math.min(Math.max(0, targetIndex), total - 1)
      const targetTrack = trackList[clamped]
      const targetTrackId = targetTrack?.audioSourceId ?? targetTrack?.track_id
      hideCorrectAnswerPopup()
      const deadline = revealAt ?? sharedDeadlineMs ?? sharedDeadlineRef.current ?? undefined
      startTrackForRound(clamped + 1, targetTrackId, deadline, { skipCountdown: false })
    },
    [total, trackList, hideCorrectAnswerPopup, startTrackForRound, sharedDeadlineMs]
  )

  const handleSkipQuestion = useCallback(() => {
    // En multi, seul l'hôte peut skipper pour éviter des fins prématurées côté invités
    if (isMultiplayer && !isHost) return
    if (!current || isRevealed) return
    const submittedGuess = guessRef.current ?? guess
    const finalVerdict = verdictRef.current ?? "wrong"
    finalizeRound(finalVerdict, "reveal", current, submittedGuess)
    // finalizeRound already avance au round suivant après délai; pas besoin d'un saut supplémentaire ici.
  }, [current, isRevealed, finalizeRound, guess, isMultiplayer, isHost])

  // Server-driven round start (round:started): close the popup everywhere, then sync timers and playback.
  useEffect(() => {
    if (!isMultiplayer) return
    if (nextSignal === 0) return
    if (lastStartSignalRef.current === nextSignal) return
    lastStartSignalRef.current = nextSignal
    const targetRound = typeof nextRoundNumber === "number" ? nextRoundNumber : index + 2
    hideCorrectAnswerPopup()
    startTrackForRound(targetRound, nextTrackId, sharedDeadlineMs ?? undefined, { skipCountdown: false })
  }, [
    isMultiplayer,
    nextSignal,
    nextRoundNumber,
    index,
    hideCorrectAnswerPopup,
    startTrackForRound,
    nextTrackId,
    sharedDeadlineMs,
  ])

  // Fallback: si l'hôte annonce une manche supérieure à la nôtre, on skip même sans signal horodaté
  useEffect(() => {
    if (!isMultiplayer || isHost) return
    if (!nextRoundNumber || nextRoundNumber <= index + 1) return
    forceAdvanceTo(nextRoundNumber - 1, sharedDeadlineMs ?? undefined)
  }, [isMultiplayer, isHost, nextRoundNumber, index, forceAdvanceTo, sharedDeadlineMs])

  const handleToggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev
      audioManager.setMuted(next)
      if (!next) {
        audioManager.setVolume(lastVolumeRef.current, AUDIO_OWNER)
      }
      return next
    })
  }, [])

  const handleTogglePlay = useCallback(() => {
    const audio = audioManager.getCurrent(AUDIO_OWNER)
    if (!audio) {
      handleManualPlay()
      return
    }
    if (audio.paused) {
      audioManager.resume(AUDIO_OWNER)
      setIsPlaying(true)
    } else {
      audioManager.pause(AUDIO_OWNER)
      pausedByUserRef.current = true
      setIsPlaying(false)
    }
  }, [handleManualPlay])

  const handleRestart = useCallback(() => {
    const audio = audioManager.getCurrent(AUDIO_OWNER)
    if (audio) {
      try {
        audio.currentTime = 0
        audioManager.resume(AUDIO_OWNER)
        setIsPlaying(true)
      } catch {
        // ignore
      }
    } else {
      handleManualPlay()
    }
  }, [handleManualPlay])

  // Signaler la disponibilité sur chaque manche une fois la révélation affichée (multijoueur)
  useEffect(() => {
    if (!roomCode || mode !== "multiplayer") return
    if (uiState !== RoundUiState.Revealed) return
    markReady(index + 1)
  }, [roomCode, mode, uiState, index, markReady])

  const handleVolumeChange = useCallback(
    (value: number) => {
      const clamped = Math.min(1, Math.max(0, value))
      setVolume(clamped)
      if (clamped > 0) {
        lastVolumeRef.current = clamped
      }
      audioManager.setVolume(clamped)
      const shouldMute = clamped === 0
      setMuted(shouldMute)
      audioManager.setMuted(shouldMute)
    },
    []
  )

  const showVolumePanel = useCallback(() => {
    if (volumeHoverRef.current) {
      clearTimeout(volumeHoverRef.current)
      volumeHoverRef.current = null
    }
    setShowVolume(true)
  }, [])

  const hideVolumePanel = useCallback(() => {
    if (volumeHoverRef.current) clearTimeout(volumeHoverRef.current)
    volumeHoverRef.current = setTimeout(() => setShowVolume(false), 2000)
  }, [])

  useEffect(() => {
    if (uiState !== RoundUiState.Revealed) return
    if (!current) return
    if (resultDialog) return
    const roundNumber = index + 1
    if (lastDialogRoundRef.current === roundNumber) return
    if (dismissedRoundsRef.current.has(roundNumber)) return
    const dialogVerdict = verdictRef.current ?? verdict ?? "wrong"
    const dialogGuess = guessRef.current ?? guess
    setResultDialog({
      track: current,
      verdict: dialogVerdict,
      round: roundNumber,
      guess: dialogGuess,
      guessTitle: guessTitleRef.current,
      guessArtist: guessArtistRef.current,
      points: 0,
      breakdown: { base: 0, speed: 0, streakBonus: 0 },
    })
    lastDialogRoundRef.current = roundNumber
  }, [uiState, current, index, verdict, guess, resultDialog])

  useEffect(() => {
    if (stats.rounds === 0) return
    if (resultDialog) return
    if (lastDialogRoundRef.current === stats.rounds) return
    if (dismissedRoundsRef.current.has(stats.rounds)) return
    const resolvedTrack = trackList[stats.rounds - 1] ?? current
    if (!resolvedTrack) return
    const dialogVerdict = verdictRef.current ?? verdict ?? "wrong"
    const dialogGuess = guessRef.current ?? guess
    setResultDialog({
      track: resolvedTrack,
      verdict: dialogVerdict,
      round: stats.rounds,
      guess: dialogGuess,
      guessTitle: guessTitleRef.current,
      guessArtist: guessArtistRef.current,
      points: 0,
      breakdown: { base: 0, speed: 0, streakBonus: 0 },
    })
    lastDialogRoundRef.current = stats.rounds
  }, [stats.rounds, trackList, current, verdict, guess, resultDialog])

  // Safety net: si on n'est plus en phase "reveal" ou qu'on a avancé de manche,
  // on force la fermeture du pop-up résiduel.
  useEffect(() => {
    if (!resultDialog) return
    const currentRoundNumber = index + 1
    // Keep the popup visible while we stay on the same round; only close once we truly advance or it was dismissed.
    if (resultDialog.round < currentRoundNumber || dismissedRoundsRef.current.has(resultDialog.round)) {
      hideCorrectAnswerPopup(resultDialog.round)
    }
  }, [index, resultDialog, hideCorrectAnswerPopup])

  const handleLike = useCallback(
    async (track?: SoloTrack) => {
      const target = track ?? current
      if (!target || liking) return
      const candidateId = target.audioSourceId ?? target.track_id ?? ""
      const looksUuid = UUID_LIKE_REGEX.test(candidateId)
      const sourceId = looksUuid ? candidateId : target.audioSourceId
      if (!sourceId) {
        setError("Impossible d'ajouter ce titre : identifiant manquant.")
        setLikeStatus({ type: "error", message: "ID manquant pour ce titre." })
        return
      }
      const key = String(sourceId)
      if (likedTrackIds[key]) return
      try {
        setLiking(true)
        setLikeStatus(null)
        console.debug("add_like_request", { sourceId, track: target })
        await api.addLike(user.id, sourceId)
        setError(null)
        setFeedback(true)
        setLikeStatus({ type: "success", message: "Ajouté aux titres likés." })
        setLikedTrackIds(prev => ({ ...prev, [key]: true }))
      } catch (err) {
        console.error("like_failed", err)
        const message = err instanceof Error ? err.message : "Impossible d'ajouter ce titre."
        setError(message)
        setLikeStatus({ type: "error", message })
      } finally {
        setLiking(false)
      }
    },
    [current, liking, user.id, likedTrackIds]
  )

  useEffect(() => {
    if (!isMultiplayer || !isHost) return
    if (!autoAdvance) return
    if (!resultDialog || gameFinished) return
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
    autoAdvanceTimerRef.current = setTimeout(() => {
      handleNext(true)
    }, 900)
  }, [isMultiplayer, isHost, autoAdvance, resultDialog, gameFinished, handleNext])

  if (!current) {
    return (
      <div className="surface flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 p-10 text-center">
        <Sparkles className="h-10 w-10 text-neon" />
        <p className="text-sm text-slate-300">No tracks available — try syncing another provider.</p>
        <Button variant="outline" asChild>
          <Link href="/menu">Return to menu</Link>
        </Button>
      </div>
    )
  }

  if (gameFinished && !resultDialog) {
    return (
      <div className="surface flex flex-col items-center gap-6 rounded-3xl border border-white/10 p-10 text-center">
        <Sparkles className="h-12 w-12 text-neon" />
        <h2 className="text-3xl font-semibold text-white">Session complete!</h2>
        <p className="text-sm text-slate-300">
          {stats.correct} / {stats.rounds} correct · {stats.points} pts · Best streak: {stats.bestStreak} · Accuracy {accuracy}%.
        </p>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/menu">Return to menu</Link>
          </Button>
          <Button asChild>
            <Link href="/solo">Play again</Link>
          </Button>
        </div>
      </div>
    )
  }

  const percent = Math.round(((index) / Math.max(1, total)) * 100)
  const feedbackActive = isLocked || isRevealed
  const feedbackSignal = feedback || feedbackActive
  const containerData = {
    "data-rivalry": modeFlags.isRivalry ? "1" : "0",
    "data-readable": modeFlags.isReadableAtDistance ? "1" : "0",
    "data-participation": modeFlags.isParticipationFocused ? "1" : "0",
  }

  return (
    <>
      <div className="min-h-screen bg-black text-white grid lg:grid-cols-[1fr_320px] relative" {...containerData}>
      <div className="px-6 pb-10 pt-6">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/menu"
            className="rounded-md border border-[#1b1b1b] bg-transparent px-4 py-2 text-sm text-white hover:bg-[#151515]"
          >
            ← Quitter
          </Link>
          <div
            className="rounded-lg border px-4 py-2 text-sm font-semibold shadow flex flex-col sm:flex-row sm:items-center sm:gap-3"
            style={{
              borderColor: accentTint(0.55),
              backgroundColor: accentTint(0.18),
              color: accentColor,
            }}
          >
            <span>Score: {stats.points} pts</span>
            <span className="text-[11px] text-white/80">({stats.correct}/{total} correct)</span>
          </div>
        </div>

        <div
          className="rounded-xl border bg-[#0f0f0f] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
          style={{
            borderColor: feedbackSignal ? accentColor : "#1b1b1b",
            boxShadow: feedbackSignal ? `0 0 0 2px ${accentTint(0.45)}` : "0 10px 30px rgba(0,0,0,0.35)",
            transition: `box-shadow ${ROUND_FEEDBACK_MS}ms ease, border-color ${ROUND_FEEDBACK_MS}ms ease`,
          }}
        >
          <div className="mb-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-[#8a8a8a]">
              <span>Question {index + 1} sur {total}</span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#161616]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${percent}%`,
                  backgroundImage: `linear-gradient(90deg, ${accentColor}, ${accentTint(0.6)})`,
                  transition: "width 200ms linear",
                }}
              />
            </div>
          </div>

          <div className="relative mx-auto mb-6 grid h-[200px] w-[200px] place-items-center rounded-xl shadow-[0_25px_60px_rgba(204,90,196,0.35)] overflow-hidden bg-gradient-to-br from-[#b155f0] to-[#f24f90]">
            {current?.album_cover ? (
              <div
                className="absolute inset-0 scale-110 blur-md brightness-75"
                style={{ backgroundImage: `url(${current.album_cover})`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            ) : null}
            <div className="relative z-10 opacity-90">
              <AudioBars />
            </div>
          </div>

          <div
            className="text-center text-5xl font-bold mb-2 transition-all"
            style={{
              color: accentColor,
              filter: isLocked || isRevealed ? "drop-shadow(0 0 12px rgba(0,0,0,0.35))" : undefined,
            }}
          >
            {isArmed ? countdown.toString().padStart(2, "0") : timer.toString().padStart(2, "0")}
          </div>
          <div className="mb-6 text-center text-sm text-[#8a8a8a]">secondes restantes</div>

          <form className="flex flex-col gap-3" onSubmit={handleGuessSubmit}>
            <input
              value={guessTitle}
              onChange={event => {
                const value = event.target.value
                setGuessTitle(value)
                setGuess(`${value} ${guessArtist}`.trim())
              }}
              disabled={isLocked || isRevealed || isArmed}
              placeholder="Titre du morceau"
              className="w-full rounded-md border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-3 text-sm text-white outline-none focus:border-[#343434]"
            />
            <div className="flex gap-3">
              <input
                value={guessArtist}
                onChange={event => {
                  const value = event.target.value
                  setGuessArtist(value)
                  setGuess(`${guessTitle} ${value}`.trim())
                }}
                disabled={isLocked || isRevealed || isArmed}
                placeholder="Artiste"
                className="w-full rounded-md border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-3 text-sm text-white outline-none focus:border-[#343434]"
              />
              <button
                type="submit"
                disabled={isLocked || isRevealed || isArmed}
                className="min-w-[110px] rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${accentColor}, ${accentTint(0.65)})`,
                  boxShadow: `0 10px 28px ${accentTint(0.35)}`,
                  transition: `opacity 120ms ease, filter ${ROUND_FEEDBACK_MS}ms ease`,
                  filter: isLocked ? "saturate(0.6)" : "none",
                }}
              >
                Valider
              </button>
            </div>
          </form>

          <div className="mt-6 flex justify-center gap-3 items-center">
            <button className="circle-btn" onClick={handleRestart} title="Rejouer l'extrait">⟳</button>
            <label
              className="play-toggle"
              title={isPlaying ? "Pause" : "Lecture"}
              style={{
                backgroundImage: `linear-gradient(135deg, ${accentColor}, ${accentTint(0.7)})`,
                boxShadow: `0 10px 30px ${accentTint(0.4)}`,
              }}
            >
              <input type="checkbox" checked={isPlaying} onChange={handleTogglePlay} />
              <svg viewBox="0 0 384 512" className="play-icon">
                <path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"></path>
              </svg>
              <svg viewBox="0 0 320 512" className="pause-icon">
                <path d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48H80c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z"></path>
              </svg>
            </label>
            <style jsx>{`
              .circle-btn {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                border: 1px solid #1f1f1f;
                background: #121212;
                color: #f1f1f1;
                display: grid;
                place-items: center;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
              }
              .circle-btn:hover { transform: translateY(-1px); }
              .play-toggle {
                --color: #ffffff;
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: linear-gradient(135deg, #b155f0 0%, #f24f90 100%);
                box-shadow: 0 10px 30px rgba(200,90,200,0.35);
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                cursor: pointer;
                user-select: none;
              }
              .play-toggle input {
                position: absolute;
                opacity: 0;
                cursor: pointer;
                width: 0;
                height: 0;
              }
              .play-toggle .play-icon,
              .play-toggle .pause-icon {
                position: absolute;
                fill: var(--color);
                width: 26px;
                height: auto;
                animation: keyframes-fill 0.5s;
              }
              .play-toggle .pause-icon { display: none; }
              .play-toggle input:checked ~ .play-icon { display: none; }
              .play-toggle input:checked ~ .pause-icon { display: block; }
              @keyframes keyframes-fill {
                0% { transform: rotate(-180deg) scale(0); opacity: 0; }
                50% { transform: rotate(-10deg) scale(1.2); }
              }
            `}</style>
            <div
              className="relative flex items-center gap-2"
              onMouseEnter={showVolumePanel}
              onMouseLeave={hideVolumePanel}
            >
              <button
                className="circle-btn"
                onClick={handleToggleMute}
                title={muted ? "Activer le son" : "Couper le son"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <div
                className={`absolute left-full top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full bg-[#0f0f0f] px-2 py-1.5 shadow transition-all duration-200 ${
                  showVolume ? "opacity-100 scale-100 translate-x-2" : "pointer-events-none opacity-0 scale-95 translate-x-0"
                }`}
                onMouseEnter={showVolumePanel}
                onMouseLeave={hideVolumePanel}
              >
                <label className="solo-slider">
                  <input
                    type="range"
                    className="solo-level"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={e => handleVolumeChange(Number(e.target.value))}
                  />
                  <svg className="solo-volume-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.36 19.36a1 1 0 0 1-.705-1.71C19.167 16.148 20 14.142 20 12s-.833-4.148-2.345-5.65a1 1 0 1 1 1.41-1.419C20.958 6.812 22 9.322 22 12s-1.042 5.188-2.935 7.069a.997.997 0 0 1-.705.291z" fill="currentColor"></path>
                    <path d="M15.53 16.53a.999.999 0 0 1-.703-1.711C15.572 14.082 16 13.054 16 12s-.428-2.082-1.173-2.819a1 1 0 1 1 1.406-1.422A6 6 0 0 1 18 12a6 6 0 0 1-1.767 4.241.996.996 0 0 1-.703.289zM12 22a1 1 0 0 1-.707-.293L6.586 17H4c-1.103 0-2-.897-2-2V9c0-1.103.897-2 2-2h2.586l4.707-4.707A.998.998 0 0 1 13 3v18a1 1 0 0 1-1 1z" fill="currentColor"></path>
                  </svg>
                </label>
                <span className="text-[11px] text-[#cfcfcf] min-w-[36px] text-right">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-center text-sm text-[#8a8a8a]">
            <button onClick={handleSkipQuestion}>Passer cette question →</button>
          </div>
        </div>
      </div>

      <aside className="hidden h-full border-l border-[#1b1b1b] bg-black px-4 py-5 lg:block">
        <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[#9b9b9b]">Historique</div>
        <div
          ref={historyContainerRef}
          className="flex max-h-[calc(100vh-3rem)] flex-col gap-2 overflow-y-auto pr-1"
        >
          {history.map(item => (
            (() => {
              const showAnswer = item.state !== "pending" && item.state !== "current"
              const displayTitle = showAnswer ? item.title : "???"
              const displayArtist = showAnswer ? item.artist : "???"
              const bgAlpha =
                item.state === "correct"
                  ? 0.18
                  : item.state === "close"
                    ? 0.14
                    : item.state === "wrong"
                      ? 0.1
                      : item.state === "current"
                        ? 0.16
                        : 0.08
              const borderAlpha = item.state === "current" ? 0.6 : 0.35
              const badgeLabel =
                item.state === "correct"
                  ? "Validé"
                  : item.state === "close"
                    ? "Partiel"
                    : item.state === "wrong"
                      ? "Clos"
                      : item.state === "current"
                        ? "En cours"
                        : "À venir"
              return (
            <div
              key={item.round}
              ref={el => {
                historyItemRefs.current[item.round] = el
              }}
              className="rounded-lg border px-3 py-3"
              style={{
                borderColor: accentTint(borderAlpha),
                backgroundColor: accentTint(bgAlpha),
                transition: `border-color ${ROUND_FEEDBACK_MS}ms ease, background-color ${ROUND_FEEDBACK_MS}ms ease`,
              }}
              >
                <div className="mb-1 flex items-center justify-between text-[12px] text-[#9b9b9b]">
                  <span>Manche {item.round}</span>
                  <span
                    className="rounded-full border px-2 py-[2px] text-[11px] font-medium"
                    style={{
                      borderColor: accentTint(0.55),
                      backgroundColor: accentTint(0.18),
                      color: accentColor,
                    }}
                  >
                    {badgeLabel}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{displayTitle}</div>
                <div className="text-xs text-[#b5b5b5]">{displayArtist}</div>
              </div>
              )
            })()
          ))}
        </div>
      </aside>
    </div>
    <SliderStyles />
    {resultDialog ? (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--ma-surface,#0f0f0f)] p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold"
                style={{
                  borderColor: accentTint(0.55),
                  backgroundColor: accentTint(0.2),
                  color: accentColor,
                  transition: `border-color ${ROUND_FEEDBACK_MS}ms ease, background-color ${ROUND_FEEDBACK_MS}ms ease`,
                }}
              >
                {resultDialog.verdict === "correct" ? "OK" : resultDialog.verdict === "close" ? "PART" : "X"}
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#9b9b9b)]">
                  Résultat manche {resultDialog.round} / {total}
                </p>
                <h3 className="text-xl font-semibold text-white">
                  {resultDialog.verdict === "correct"
                    ? "Bonne réponse !"
                    : resultDialog.verdict === "close"
                      ? "Presque ça"
                      : "Mauvaise réponse"}
                </h3>
              </div>
            </div>
            <button
              className="text-sm text-[var(--ma-muted,#9b9b9b)] hover:text-white"
              onClick={() => hideCorrectAnswerPopup(resultDialog.round)}
            >
              ✕
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-[var(--ma-muted,#9b9b9b)]">Titre</div>
            <div className="text-lg font-semibold text-white">{resultDialog.track.title}</div>
            <div className="text-sm text-[var(--ma-muted,#9b9b9b)]">{resultDialog.track.artist}</div>
          </div>

          <div className="mt-3 rounded-xl border border-white/5 bg-black/40 p-3 text-sm text-[var(--ma-muted,#9b9b9b)] space-y-1">
            <div className="text-xs uppercase tracking-[0.3em]">Ta réponse</div>
            {resultDialog.guessTitle || resultDialog.guessArtist ? (
              <>
                <div>
                  <span className="text-[var(--ma-muted,#9b9b9b)]">Titre : </span>
                  <span className="text-white">{resultDialog.guessTitle || "—"}</span>
                </div>
                <div>
                  <span className="text-[var(--ma-muted,#9b9b9b)]">Artiste : </span>
                  <span className="text-white">{resultDialog.guessArtist || "—"}</span>
                </div>
              </>
            ) : (
              <div className="text-[var(--ma-muted,#9b9b9b)]">Aucune réponse saisie.</div>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white flex flex-col gap-1">
            <div className="font-semibold text-base">+{resultDialog.points} pts</div>
            <div className="text-[12px] text-[var(--ma-muted,#9b9b9b)]">
              Base {resultDialog.breakdown.base} · Vitesse {resultDialog.breakdown.speed} · Série {resultDialog.breakdown.streakBonus}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {(() => {
              const candidateId =
                resultDialog.track.audioSourceId ??
                (UUID_LIKE_REGEX.test(resultDialog.track.track_id) ? resultDialog.track.track_id : null)
              const alreadyLiked = candidateId ? likedTrackIds[String(candidateId)] : false
              return (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleLike(resultDialog.track)}
              disabled={liking || !candidateId || alreadyLiked}
              className="gap-2"
            >
              {liking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
              {alreadyLiked ? "Ajouté aux titres likés" : "Ajouter aux titres likés"}
            </Button>
              )
            })()}
            <Button
              type="button"
              onClick={() => handleNext(true)}
              className="gap-2"
              disabled={isMultiplayer && !isHost}
            >
              <ArrowRight className="h-4 w-4" />
              {resultDialog.round >= total ? "Terminer" : "Manche suivante"}
            </Button>
          </div>
          {likeStatus ? (
            <div
              className="mt-2 text-sm"
              style={{ color: accentColor }}
            >
              {likeStatus.message}
            </div>
          ) : null}
          {mode === "multiplayer" && leaderboard && leaderboard.length ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#9b9b9b)]">
                Classement live
              </div>
              <div className="flex flex-col gap-2 text-sm text-white">
                {leaderboard.map((entry, idx) => (
                  <div
                    key={entry.userId}
                    className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-[var(--ma-muted,#cfcfcf)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--ma-muted,#8a8a8a)] w-5 text-center">
                        #{idx + 1}
                      </span>
                      <span className="text-white">{entry.username || `Joueur ${entry.userId}`}</span>
                    </div>
                    <div className="text-xs text-[var(--ma-muted,#cfcfcf)]">
                      {entry.score} pts · {entry.accuracy}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    ) : null}
    </>
  )
}

const NORMALIZE_SUBS: Record<string, string> = {
  $: "s",
  "@": "a",
  "\u20ac": "e",
  "&": "and",
}

function normalize(text: string): string {
  // Soft-normalize to handle accents and stylized characters (e.g., A$AP -> asap) before token matching
  const folded = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  const replaced = folded.replace(/[@$€&]/g, char => NORMALIZE_SUBS[char] ?? " ")
  return replaced.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

const STOP_WORDS = new Set(["feat", "featuring", "feat.", "ft", "ft.", "with", "and", "x", "feat,", "featuring,"])

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word))
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

function isWordMatch(word: string, candidates: string[]): boolean {
  if (candidates.includes(word)) return true
  const tolerance = word.length <= 4 ? 1 : 2
  return candidates.some(candidate => {
    if (Math.abs(candidate.length - word.length) > tolerance) return false
    return levenshteinDistance(word, candidate) <= tolerance
  })
}

function evaluateGuessDetail(guess: string, track: SoloTrack): {
  verdict: Verdict
  matchedTitle: boolean
  matchedArtist: boolean
} {
  const guessWords = tokenize(guess)
  if (!guessWords.length) return { verdict: "wrong", matchedTitle: false, matchedArtist: false }

  const titleWords = tokenize(track.title)
  const artistWords = tokenize(track.artist)

  let matches = 0
  let titleMatches = 0
  let artistMatches = 0
  for (const word of guessWords) {
    if (isWordMatch(word, titleWords)) {
      matches += 1
      titleMatches += 1
    } else if (isWordMatch(word, artistWords)) {
      matches += 1
      artistMatches += 1
    }
  }

  const matchRatio = matches / Math.max(1, guessWords.length)
  let verdict: Verdict = "wrong"
  if (matchRatio === 1) {
    verdict = "correct"
  } else if (matchRatio >= 0.6 && matches >= 1) {
    verdict = "close"
  }

  return {
    verdict,
    matchedTitle: titleMatches > 0,
    matchedArtist: artistMatches > 0,
  }
}

function evaluateGuess(guess: string, track: SoloTrack): Verdict {
  return evaluateGuessDetail(guess, track).verdict
}

// Global styles for the compact volume slider
const SliderStyles = () => (
  <style jsx global>{`
    .solo-slider {
      --slider-width: 110px;
      --slider-height: 6px;
      --slider-bg: #3a3a3a;
      --slider-border-radius: 999px;
      --level-color: #f24f90;
      --level-transition-duration: 0.1s;
      --icon-margin: 10px;
      --icon-size: 18px;
      cursor: pointer;
      display: inline-flex;
      flex-direction: row-reverse;
      align-items: center;
      gap: 8px;
    }
    .solo-slider .solo-volume-icon {
      color: #8c8c8c;
      width: var(--icon-size);
      height: auto;
      margin-right: var(--icon-margin);
    }
    .solo-slider .solo-level {
      appearance: none;
      width: var(--slider-width);
      height: var(--slider-height);
      background: var(--slider-bg);
      overflow: hidden;
      border-radius: var(--slider-border-radius);
      transition: height var(--level-transition-duration);
      cursor: inherit;
    }
    .solo-slider .solo-level::-webkit-slider-thumb {
      appearance: none;
      width: 0;
      height: 0;
      box-shadow: -200px 0 0 200px var(--level-color);
    }
    .solo-slider:hover .solo-level {
      height: calc(var(--slider-height) * 1.7);
    }
  `}</style>
)
