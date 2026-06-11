"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { api } from "@/lib/api"
import { clientApi } from "@/lib/apiClient"
import type { SoloTrack, UserSummary } from "@/lib/types"
import { ArrowRight, Heart, Loader2, Play, Share2, Sparkles, Volume2, VolumeX } from "lucide-react"
import { StreakEffects } from "./StreakEffects"
import { buildShareText } from "@/lib/shareText"
import { ShareImageButton } from "./ShareImageButton"
import { getSocket } from "@/lib/socket"
import { audioManager, DEFAULT_AUDIO_VOLUME } from "@/lib/audioManager"
import { RoundUiState, roundFlowReducer, computeScore, resolveModeFlags, ROUND_FEEDBACK_MS } from "@/lib/roundFlow"
import { getListeningDuration } from "@/lib/progressiveDifficulty"
import { HintButton } from "./HintButton"
import { useMode } from "@/contexts/ModeContext"
import { evaluateGuess as evaluateGuessShared, evaluateGuessSeparate, normalize, tokenize, type Verdict } from "@/lib/matching"

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
  progressive?: boolean
  onHostNext?: (nextRound: number, revealAt: number) => void
  onRoundComplete?: (payload: {
    track: SoloTrack
    verdict: Verdict
    guess: string
    round: number
    stats: RoundStats
  }) => void
  onGameComplete?: (stats: RoundStats) => void
  challengeCode?: string
  onChallengeComplete?: (stats: RoundStats) => void
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

// Remap des anciens accents néon vers la palette "Club analogique".
const ANALOG_ACCENTS: Record<string, string> = {
  "#ec4899": "#c65133", // friends → terracotta
  "#8b5cf6": "#e0a32e", // event → or
  "#f97316": "#7d9471", // streamer → sauge
  "#a855f7": "#a8b8c8", // solo / défaut → bleu-gris
  "#22d3ee": "#7d9471",
}

const VINYL_GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"

function AnalogVinyl({
  size,
  spinning,
  accent,
  coverUrl,
  blurred,
}: {
  size: number
  spinning: boolean
  accent: string
  coverUrl?: string | null
  blurred?: boolean
}) {
  return (
    <div
      className="relative rounded-full border-[3px] border-[#2e2014]"
      style={{
        width: size,
        height: size,
        maxWidth: "80vw",
        maxHeight: "80vw",
        background: VINYL_GROOVES,
        animation: "vinyl-spin 7s linear infinite",
        animationPlayState: spinning ? "running" : "paused",
      }}
    >
      {coverUrl ? (
        <div className="absolute inset-[28%] overflow-hidden rounded-full border-[3px] border-[#2e2014]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt="Pochette d'album"
            className="h-full w-full object-cover transition-[filter] duration-700"
            style={{ filter: blurred ? "blur(5px) saturate(0.85)" : "none" }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-[32%] rounded-full border-[3px] border-[#2e2014]"
          style={{ background: accent }}
        />
      )}
      <div className="absolute inset-[47%] rounded-full border-2 border-[#2e2014] bg-[#f4ecdb]" />
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
  progressive = false,
  challengeCode,
  onChallengeComplete,
}: SoloGameClientProps) {
  const { accentColor: modeAccent } = useMode()
  const accentColor = ANALOG_ACCENTS[modeAccent.toLowerCase()] ?? modeAccent
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
      title: number
      artist: number
      speed: number
      penalty: number
      hint: number
    }
  } | null>(null)
  const lastDialogRoundRef = useRef<number>(0)
  const finalizeLockRef = useRef<number | null>(null)
  const [likedTrackIds, setLikedTrackIds] = useState<Record<string, boolean>>({})
  const [likeStatus, setLikeStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [hintCount, setHintCount] = useState(0)
  const hintCountRef = useRef(0)

  const [stats, setStats] = useState<RoundStats>({
    rounds: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    points: 0,
  })
  const [manualPlayRequired, setManualPlayRequired] = useState(false)
  const [noAudioAvailable, setNoAudioAvailable] = useState(false)
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
  const currentListeningDuration = progressive ? getListeningDuration(index, total) : LISTENING_DURATION
  const currentListeningDurationMs = currentListeningDuration * 1000
  const [shareLabel, setShareLabel] = useState("Partager")
  const [challengeLabel, setChallengeLabel] = useState("Defier un ami")
  const [challengeLoading, setChallengeLoading] = useState(false)

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
      socket.emit("game:ready", { roomCode, round: roundNumber })
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
      setNoAudioAvailable(false)
      setIsPlaying(false)
      pausedByUserRef.current = false
      setMuted(false)
      setTimer(progressive ? getListeningDuration(resolveTargetIndex(targetRound, targetTrackId), total) : LISTENING_DURATION)
      setCountdown(COUNTDOWN_DURATION)
      setHintCount(0)
      hintCountRef.current = 0
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
    [cleanupTimers, resolveTargetIndex, total, progressive]
  )

  const startTrackForRound = useCallback(
    (targetRound: number, targetTrackId?: string | number, revealAt?: number, opts?: { skipCountdown?: boolean }) => {
      readyRoundRef.current = null
      const now = Date.now()
      const warmupMs = opts?.skipCountdown ? 0 : COUNTDOWN_DURATION * 1000
      const targetIdx = resolveTargetIndex(targetRound, targetTrackId)
      const roundDurationMs = (progressive ? getListeningDuration(targetIdx, total) : LISTENING_DURATION) * 1000
      const providedDeadline =
        revealAt && Number.isFinite(revealAt) && revealAt > now - 2000 ? revealAt : null
      const deadlineCandidate = providedDeadline ?? now + warmupMs + roundDurationMs
      const startAt = Math.max(now + warmupMs, deadlineCandidate - roundDurationMs)
      const deadline = Math.max(startAt + roundDurationMs, deadlineCandidate)
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
    [resetRoundState, dispatchFlow, resolveTargetIndex, progressive, total]
  )

  const handleReplay = useCallback(() => {
    const initial: RoundStats = { rounds: 0, correct: 0, streak: 0, bestStreak: 0, points: 0 }
    setStats(initial)
    statsRef.current = initial
    setRoundStates(trackList.map((_, i) => (i === 0 ? "current" : "pending")))
    setGameFinished(false)
    setVerdict(null)
    setResultDialog(null)
    dismissedRoundsRef.current.clear()
    lastDialogRoundRef.current = 0
    startTrackForRound(1)
  }, [trackList, startTrackForRound])

  const handleShare = useCallback(() => {
    const text = buildShareText(stats, roundStates)
    navigator.clipboard.writeText(text).then(() => {
      setShareLabel("Copié !")
      setTimeout(() => setShareLabel("Partager"), 2000)
    }).catch(() => {
      setShareLabel("Erreur")
      setTimeout(() => setShareLabel("Partager"), 2000)
    })
  }, [stats, roundStates])

  const handleChallenge = useCallback(async () => {
    if (challengeLoading) return
    setChallengeLoading(true)
    try {
      const { code } = await clientApi.createChallenge({
        tracks: trackList,
        creatorName: user.username || "Joueur",
        score: stats.points,
        correct: stats.correct,
        total: stats.rounds,
        bestStreak: stats.bestStreak,
      })
      const challengeUrl = `https://tymmerc.eu/blindify/challenge/?code=${code}`
      await navigator.clipboard.writeText(challengeUrl)
      setChallengeLabel("Lien copie !")
      setTimeout(() => setChallengeLabel("Defier un ami"), 3000)
    } catch {
      setChallengeLabel("Erreur")
      setTimeout(() => setChallengeLabel("Defier un ami"), 2000)
    } finally {
      setChallengeLoading(false)
    }
  }, [challengeLoading, trackList, user.username, stats])

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
      // Use separate title/artist fields when available for more accurate matching
      const currentGuessTitle = guessTitleRef.current
      const currentGuessArtist = guessArtistRef.current
      const hasSeparateFields = (currentGuessTitle && currentGuessTitle.trim().length > 0) || (currentGuessArtist && currentGuessArtist.trim().length > 0)
      const detail = hasSeparateFields
        ? evaluateGuessSeparate(currentGuessTitle, currentGuessArtist, track)
        : evaluateGuessShared(submittedGuess, track)
      const finalVerdict = detail.verdict ?? nextVerdict

      const prevStats = statsRef.current
      const guessProvided = detail.guessProvided
      const scoreResult = computeScore({
        matchedTitle: detail.matchedTitle,
        matchedArtist: detail.matchedArtist,
        guessProvided,
        reactionMs,
        maxDurationMs: currentListeningDurationMs,
        streak: prevStats.streak,
        hintsUsed: hintCountRef.current,
      })
      const gainedPoints = scoreResult.gained
      const streak = scoreResult.nextStreak

      const correct = detail.matchedTitle && detail.matchedArtist
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
        onChallengeComplete?.(updatedStats)
      }
    },
    [cleanupTimers, uiState, flow.startAt, dispatchFlow, index, total, onRoundComplete, onGameComplete, markReady]
  )

  const scheduleListeningTimer = useCallback(
    (track: SoloTrack) => {
      const now = Date.now()
      const roundDurMs = currentListeningDurationMs
      const externalDeadline =
        sharedDeadlineRef.current && sharedDeadlineRef.current > now
          ? sharedDeadlineRef.current
          : sharedDeadlineMs && sharedDeadlineMs > now
            ? sharedDeadlineMs
            : null
      listeningDeadlineRef.current = externalDeadline ?? now + roundDurMs
      if (listeningDeadlineRef.current <= now) {
        listeningDeadlineRef.current = now + roundDurMs
      }
      listeningStartAtRef.current = Math.max(now, listeningDeadlineRef.current - roundDurMs)

      const tick = () => {
        const remainingMs = listeningDeadlineRef.current - Date.now()
        const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
        setTimer(prev => (prev === nextSeconds ? prev : nextSeconds))
        if (remainingMs <= 0) {
          const latestGuess = guessRef.current
          const computedVerdict = verdictRef.current ?? evaluateGuessShared(latestGuess, track).verdict
          finalizeRound(computedVerdict, "timeout", track, latestGuess)
        } else {
          listeningRafRef.current = requestAnimationFrame(tick)
        }
      }

      listeningRafRef.current = requestAnimationFrame(tick)
    },
    [finalizeRound, sharedDeadlineMs, currentListeningDurationMs]
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
      const deadline = listeningDeadlineRef.current || startAt + currentListeningDurationMs
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

  // Safety net: if stuck in LOCKED state for >500ms without transitioning to REVEALED, force reveal.
  useEffect(() => {
    if (flow.state !== RoundUiState.Locked) return
    const safetyTimer = setTimeout(() => {
      if (flow.state === RoundUiState.Locked) {
        dispatchFlow({ type: "REVEAL", at: Date.now() })
      }
    }, 500)
    return () => clearTimeout(safetyTimer)
  }, [flow.state, dispatchFlow])

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
        : now + currentListeningDurationMs
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
    setTimer(currentListeningDuration)

    let cancelled = false

    const ensurePreview = async () => {
      if (current.audio_url) {
        previewUrlRef.current = current.audio_url
        return current.audio_url
      }
      return null
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
        setNoAudioAvailable(true)
        // Auto-skip after 3s so user sees the "no audio" message
        setTimeout(() => {
          if (cancelled) return
          const latestGuess = guessRef.current
          finalizeRound("wrong", "timeout", current, latestGuess)
        }, 3000)
        return
      }

      previewUrlRef.current = previewUrl
      playStartedRef.current = current?.audioSourceId ?? current?.track_id ?? "round"

      try {
        await startAudio(previewUrl, current)
      } catch (err) {
        if (cancelled) return
        // Don't set feedback — it triggers the result popup flow.
        // Just show the manual play button overlay on the vinyl disc.
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
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current)
        revealTimeoutRef.current = null
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
      const currentVerdict = evaluateGuessShared(guess, current).verdict
      setVerdict(currentVerdict)
      finalizeRound(currentVerdict, "guess", current, guess)
    },
    [current, guess, isRevealed, isLocked, uiState, finalizeRound]
  )

  const handleReveal = useCallback(() => {
    if (!current) return
    const finalVerdict = verdict ?? evaluateGuessShared(guess, current).verdict
    finalizeRound(finalVerdict, "reveal", current, guess)
  }, [current, verdict, guess, finalizeRound])

  const handleNext = useCallback(
    (emitHost = true, targetRound?: number, skipCountdown = false) => {
      const nextRound = typeof targetRound === "number" ? targetRound : index + 2
      if (mode === "multiplayer" && onHostNext && isHost && emitHost) {
        // Host only emits the intent; the round:started broadcast will close the popup for everyone.
        const nextIdx = typeof targetRound === "number" ? targetRound - 1 : index + 1
        const nextDurMs = (progressive ? getListeningDuration(nextIdx, total) : LISTENING_DURATION) * 1000
        const revealAt = Date.now() + nextDurMs
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
        handleManualPlay()
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
      breakdown: { title: 0, artist: 0, speed: 0, penalty: 0, hint: 0 },
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
      breakdown: { title: 0, artist: 0, speed: 0, penalty: 0, hint: 0 },
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
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
        autoAdvanceTimerRef.current = null
      }
    }
  }, [isMultiplayer, isHost, autoAdvance, resultDialog, gameFinished, handleNext])

  if (!current) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-10 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <Sparkles className="h-10 w-10 text-[#c65133]" />
        <p className="text-sm text-[#6b573f]">No tracks available — try syncing another provider.</p>
        <Link
          href="/solo"
          className="rounded-md border-2 border-[#2e2014] px-5 py-2.5 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          Retour
        </Link>
      </div>
    )
  }

  if (gameFinished && !resultDialog) {
    return (
      <div className="flex flex-col items-center gap-6 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-10 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <Sparkles className="h-12 w-12 text-[#c65133]" />
        <h2 className="font-display text-3xl font-semibold text-[#2e2014]">Partie terminée !</h2>
        <p className="text-sm text-[#6b573f]">
          {stats.correct} / {stats.rounds} correct · {stats.points} pts · Série max : {stats.bestStreak} · Précision {accuracy}%
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/modes"
            className="inline-flex items-center rounded-md border-2 border-[#2e2014] px-5 py-2.5 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour aux modes
          </Link>
          <Link
            href="/solo"
            className="inline-flex items-center rounded-md border-2 border-[#2e2014] px-5 py-2.5 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Changer de playlist
          </Link>
          <button
            type="button"
            className="inline-flex items-center rounded-md border-2 border-[#2e2014] px-5 py-2.5 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            onClick={handleShare}
          >
            {shareLabel}
          </button>
          <ShareImageButton
            stats={stats}
            roundStates={roundStates}
            tracks={trackList.map((t) => ({ title: t.title, artist: t.artist }))}
          />
          {!challengeCode && (
            <button
              type="button"
              className="inline-flex items-center rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-5 py-2.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_rgba(46,32,20,.3)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgba(46,32,20,.3)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleChallenge}
              disabled={challengeLoading}
            >
              {challengeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
              {challengeLabel}
            </button>
          )}
          <button type="button" className="btn-neon" onClick={handleReplay}>
            Rejouer
          </button>
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
      <div className="min-h-screen text-[#2e2014] grid lg:grid-cols-[1fr_320px] relative" {...containerData}>
      <div className="px-6 pb-10 pt-6">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/solo"
            className="rounded-md border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            ← Quitter
          </Link>
          <div
            className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-sm font-semibold shadow-[3px_3px_0_rgba(46,32,20,.18)] flex flex-col sm:flex-row sm:items-center sm:gap-3"
            style={{ color: "#2e2014" }}
          >
            <span className="inline-flex items-center gap-2 font-display">
              Score: {stats.points} pts
              <StreakEffects streak={stats.streak} />
            </span>
            <span className="text-[11px] text-[#8a7558]">({stats.correct}/{total} correct)</span>
          </div>
        </div>

        <div
          className="rounded-md border-2 bg-[#ece1c8] p-6"
          style={{
            borderColor: feedbackSignal ? accentColor : "#2e2014",
            boxShadow: feedbackSignal ? `4px 4px 0 ${accentColor}` : "4px 4px 0 rgba(46,32,20,.18)",
            transition: `box-shadow ${ROUND_FEEDBACK_MS}ms ease, border-color ${ROUND_FEEDBACK_MS}ms ease`,
          }}
        >
          <div className="mb-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              <span>Question {index + 1} sur {total}</span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full border border-[rgba(46,32,20,.35)] bg-[#efe5d0]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${percent}%`,
                  background: accentColor,
                  transition: "width 200ms linear",
                }}
              />
            </div>
          </div>

          <div className="relative mx-auto mb-6 flex items-center justify-center">
            <AnalogVinyl size={220} spinning={isPlaying && !isLocked && !isRevealed} accent={accentColor} coverUrl={current?.album_cover} blurred={!isRevealed} />
            {manualPlayRequired && !isPlaying && !isRevealed && (
              <button
                type="button"
                onClick={handleManualPlay}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-full"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] text-[#2e2014] shadow-[3px_3px_0_rgba(46,32,20,.3)] transition hover:bg-[#c65133] hover:text-[#f4ecdb]">
                  <Play className="h-6 w-6 ml-0.5" />
                </div>
                <span className="rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] px-3 py-1 text-xs font-bold text-[#2e2014]">
                  Appuie pour lancer le son
                </span>
              </button>
            )}
            {noAudioAvailable && !isRevealed && (
              <div className="absolute bottom-2 flex items-center gap-2 rounded-full border-[1.5px] border-[#9c2f1d] bg-[#f4ecdb] px-3 py-1.5 text-xs font-bold text-[#9c2f1d]">
                <span>⚠ Pas d'aperçu audio disponible</span>
              </div>
            )}
            {isPlaying && !isLocked && !isRevealed && !noAudioAvailable && (
              <div className="absolute bottom-2 flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] px-3 py-1.5 text-xs text-[#6b573f]">
                <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: accentColor }} />
                <span>Extrait en cours</span>
              </div>
            )}
          </div>

          <div className="text-center font-display text-6xl font-bold text-[#2e2014] mb-2 transition-all">
            {isArmed ? countdown.toString().padStart(2, "0") : timer.toString().padStart(2, "0")}
          </div>
          <div className="mb-6 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">secondes restantes</div>

          <form className="flex flex-col gap-3" onSubmit={handleGuessSubmit}>
            <input
              value={guessTitle}
              onChange={event => {
                const value = event.target.value
                setGuessTitle(value)
                setGuess(`${value} ${guessArtist}`.trim())
              }}
              disabled={isLocked || isRevealed || isArmed}
              placeholder="Le morceau qui tourne…"
              className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-1 py-2 font-display text-lg text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133] disabled:opacity-50"
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
                placeholder="Qui chante ?"
                className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-1 py-2 font-display text-lg text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLocked || isRevealed || isArmed}
                className="min-w-[110px] rounded-md border-2 border-[#2e2014] bg-[#c65133] px-4 py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#2e2014]"
              >
                Valider
              </button>
            </div>
          </form>

          {current && (
            <div className="mt-3 flex justify-center">
              <HintButton
                track={current}
                disabled={isLocked || isRevealed || isArmed}
                onHintUsed={() => {
                  setHintCount(prev => {
                    const next = prev + 1
                    hintCountRef.current = next
                    return next
                  })
                }}
              />
            </div>
          )}

          {progressive && (
            <div className="mt-2 text-center">
              <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                {currentListeningDuration}s
              </span>
            </div>
          )}

          <div className="mt-6 flex justify-center gap-3 items-center">
            <button className="circle-btn" onClick={handleRestart} title="Rejouer l'extrait">⟳</button>
            <label
              className="play-toggle"
              title={isPlaying ? "Pause" : "Lecture"}
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
                border: 2px solid #2e2014;
                background: #f4ecdb;
                color: #2e2014;
                display: grid;
                place-items: center;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
              }
              .circle-btn:hover { transform: translateY(-1px); }
              .play-toggle {
                --color: #c65133;
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: #f4ecdb;
                border: 2px solid #2e2014;
                box-shadow: 3px 3px 0 rgba(46, 32, 20, 0.3);
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
                className={`absolute left-full top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#efe5d0] px-2 py-1.5 shadow-[2px_2px_0_rgba(46,32,20,.25)] transition-all duration-200 ${
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
                <span className="text-[11px] font-bold text-[#6b573f] min-w-[36px] text-right">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-center text-sm text-[#8a7558]">
            <button className="italic underline-offset-4 transition hover:text-[#c65133] hover:underline" onClick={handleSkipQuestion}>Passer cette question →</button>
          </div>
        </div>
      </div>

      <aside className="hidden h-full border-l-2 border-[#2e2014] bg-[#ece1c8] px-4 py-5 lg:block">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Face B · Historique</div>
        <div
          ref={historyContainerRef}
          className="flex max-h-[calc(100vh-3rem)] flex-col gap-2 overflow-y-auto pr-1"
        >
          {history.map(item => (
            (() => {
              const showAnswer = item.state !== "pending" && item.state !== "current"
              const displayTitle = showAnswer ? item.title : "???"
              const displayArtist = showAnswer ? item.artist : "???"
              const stateColor =
                item.state === "correct"
                  ? "#7d9471"
                  : item.state === "close"
                    ? "#e0a32e"
                    : item.state === "wrong"
                      ? "#9c2f1d"
                      : item.state === "current"
                        ? accentColor
                        : "rgba(46,32,20,.35)"
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
              className="rounded-md border-[1.5px] bg-[#efe5d0] px-3 py-3"
              style={{
                borderColor: item.state === "current" ? accentColor : "rgba(46,32,20,.22)",
                transition: `border-color ${ROUND_FEEDBACK_MS}ms ease, background-color ${ROUND_FEEDBACK_MS}ms ease`,
              }}
              >
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a7558]">
                  <span>Manche {item.round}</span>
                  <span
                    className="rounded-full border-[1.5px] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{
                      borderColor: stateColor,
                      color: item.state === "pending" ? "#8a7558" : stateColor,
                    }}
                  >
                    {badgeLabel}
                  </span>
                </div>
                <div className="font-display text-sm font-semibold text-[#2e2014]">{displayTitle}</div>
                <div className="text-xs text-[#6b573f]">{displayArtist}</div>
              </div>
              )
            })()
          ))}
        </div>
      </aside>
    </div>
    <SliderStyles />
    {resultDialog ? (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#2e2014]/30 px-4">
        <div className="w-full max-w-lg rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] p-6 shadow-[6px_6px_0_rgba(46,32,20,.25)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold text-[#f4ecdb]"
                style={{
                  borderColor: "#2e2014",
                  backgroundColor:
                    resultDialog.verdict === "correct" ? "#7d9471" : resultDialog.verdict === "close" ? "#e0a32e" : "#9c2f1d",
                  transition: `border-color ${ROUND_FEEDBACK_MS}ms ease, background-color ${ROUND_FEEDBACK_MS}ms ease`,
                }}
              >
                {resultDialog.verdict === "correct" ? "OK" : resultDialog.verdict === "close" ? "PART" : "X"}
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
                  Résultat manche {resultDialog.round} / {total}
                </p>
                <h3 className="font-display text-xl font-semibold text-[#2e2014]">
                  {resultDialog.verdict === "correct"
                    ? "Bonne réponse !"
                    : resultDialog.verdict === "close"
                      ? "Presque ça"
                      : "Mauvaise réponse"}
                </h3>
              </div>
            </div>
            <button
              className="text-sm text-[#8a7558] hover:text-[#2e2014]"
              onClick={() => hideCorrectAnswerPopup(resultDialog.round)}
            >
              ✕
            </button>
          </div>

          <div className="mt-5 flex gap-4 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-4">
            {resultDialog.track.album_cover ? (
              <Image
                src={resultDialog.track.album_cover}
                alt={`${resultDialog.track.title} — ${resultDialog.track.artist}`}
                width={80}
                height={80}
                className="h-20 w-20 shrink-0 rounded-md border-2 border-[#2e2014] object-cover"
                unoptimized
              />
            ) : null}
            <div className="flex flex-col justify-center gap-0.5 min-w-0">
              <div className="font-display text-lg font-semibold text-[#2e2014] truncate">{resultDialog.track.title}</div>
              <div className="text-sm text-[#6b573f] truncate">{resultDialog.track.artist}</div>
              {(resultDialog.track.metadata as Record<string, unknown>)?.album ? (
                <div className="text-xs text-[#8a7558] truncate">
                  Album : {String((resultDialog.track.metadata as Record<string, unknown>).album)}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] p-3 text-sm text-[#6b573f] space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Ta réponse</div>
            {resultDialog.guessTitle || resultDialog.guessArtist ? (
              <>
                <div>
                  <span className="text-[#8a7558]">Titre : </span>
                  <span className="text-[#2e2014]">{resultDialog.guessTitle || "—"}</span>
                </div>
                <div>
                  <span className="text-[#8a7558]">Artiste : </span>
                  <span className="text-[#2e2014]">{resultDialog.guessArtist || "—"}</span>
                </div>
              </>
            ) : (
              <div className="text-[#8a7558] italic">Aucune réponse saisie.</div>
            )}
          </div>
          <div className="mt-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] p-3 text-sm text-[#2e2014] flex flex-col gap-1">
            <div className="font-display text-base font-bold text-[#c65133]">+{resultDialog.points} pts</div>
            <div className="text-[12px] text-[#8a7558]">
              Titre {resultDialog.breakdown.title} · Artiste {resultDialog.breakdown.artist} · Vitesse {resultDialog.breakdown.speed}{resultDialog.breakdown.penalty > 0 ? ` · Pénalité -${resultDialog.breakdown.penalty}` : ""}{resultDialog.breakdown.hint > 0 ? ` · Indices -${resultDialog.breakdown.hint}` : ""}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {(() => {
              const candidateId =
                resultDialog.track.audioSourceId ??
                (UUID_LIKE_REGEX.test(resultDialog.track.track_id) ? resultDialog.track.track_id : null)
              const alreadyLiked = candidateId ? likedTrackIds[String(candidateId)] : false
              return (
            <button
              type="button"
              onClick={() => handleLike(resultDialog.track)}
              disabled={liking || !candidateId || alreadyLiked}
              className="inline-flex items-center gap-2 rounded-md border-2 border-[#2e2014] bg-transparent px-5 py-2.5 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {liking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
              {alreadyLiked ? "Ajouté aux titres likés" : "Ajouter aux titres likés"}
            </button>
              )
            })()}
            <button
              type="button"
              onClick={() => handleNext(true)}
              disabled={isMultiplayer && !isHost}
              className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-6 py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#2e2014]"
            >
              <ArrowRight className="h-4 w-4" />
              {resultDialog.round >= total ? "Terminer" : "Manche suivante"}
            </button>
          </div>
          {likeStatus ? (
            <div
              className="mt-2 text-sm"
              style={{ color: likeStatus.type === "error" ? "#9c2f1d" : "#7d9471" }}
            >
              {likeStatus.message}
            </div>
          ) : null}
          {mode === "multiplayer" && leaderboard && leaderboard.length ? (
            <div className="mt-6 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
                Face B · Classement live
              </div>
              <div className="flex flex-col gap-1 text-sm text-[#2e2014]">
                {leaderboard.map((entry, idx) => (
                  <div
                    key={entry.userId}
                    className="flex items-baseline gap-2 px-1 py-1.5"
                  >
                    <span className="w-6 text-[11px] text-[#8a7558]">A{idx + 1}</span>
                    <span className="font-display font-semibold text-[#2e2014]">{entry.username || `Joueur ${entry.userId}`}</span>
                    <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-[rgba(46,32,20,.45)]" />
                    <span className="text-xs font-bold text-[#2e2014]">
                      {entry.score} pts · {entry.accuracy}%
                    </span>
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

// Global styles for the compact volume slider
const SliderStyles = () => (
  <style jsx global>{`
    .solo-slider {
      --slider-width: 110px;
      --slider-height: 6px;
      --slider-bg: #d8cbb0;
      --slider-border-radius: 999px;
      --level-color: #c65133;
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
      color: #8a7558;
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
