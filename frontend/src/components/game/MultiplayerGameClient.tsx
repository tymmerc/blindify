"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { MultiplayerGameState, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Check, Clock, Crown, Lock, Play, Trophy, Users, Volume2, VolumeX } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { audioManager } from "@/lib/audioManager"
import { GAME_MODES, type GameModeConfig, type GameMode } from "@/lib/gameModes"
import { TheaterGameView } from "./TheaterGameView"

const VINYL_GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"

// Platine analogique : sillons sombres, label central couleur d'accent bordé d'encre, trou papier.
function AnalogVinyl({
  size,
  spinning,
  accentColor,
  coverUrl,
  blurred = false,
}: {
  size: number
  spinning: boolean
  accentColor: string
  coverUrl?: string | null
  blurred?: boolean
}) {
  return (
    <div
      className="relative rounded-full border-[3px] border-[#2e2014]"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        maxWidth: "80vw",
        maxHeight: "80vw",
        background: VINYL_GROOVES,
        animation: spinning ? "vinyl-spin 7s linear infinite" : "none",
      }}
    >
      {coverUrl ? (
        <div className="absolute inset-[26%] overflow-hidden rounded-full border-[3px] border-[#2e2014]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt="Pochette d'album"
            className="h-full w-full object-cover transition-[filter] duration-700"
            style={{ filter: blurred ? "blur(4px) saturate(0.8)" : "none" }}
          />
        </div>
      ) : (
        <span
          aria-hidden
          className="absolute inset-[33%] rounded-full border-[3px] border-[#2e2014]"
          style={{ background: accentColor }}
        />
      )}
      <span aria-hidden className="absolute inset-[47%] z-10 rounded-full border-2 border-[#2e2014] bg-[#f4ecdb]" />
    </div>
  )
}


export type ChatMessage = {
  userId: number
  username: string
  message: string
  timestamp: number
}

type Props = {
  user: UserSummary
  state: MultiplayerGameState | null
  serverNow: number
  onAnswer: (guessTitle: string, guessArtist: string, sourceUserId?: number | null) => void
  onReady: () => void
  onRematch?: () => void
  onExit?: () => void
  disabled?: boolean
  autoAdvance?: boolean
  modeConfig?: GameModeConfig
  accentColor?: string
  mode: GameMode
  chatMessages?: ChatMessage[]
  onSendChat?: (message: string) => void
}

type Phase = "guessing" | "locked" | "reveal"

export function MultiplayerGameClient({
  user,
  state,
  serverNow,
  onAnswer,
  onReady,
  onRematch,
  onExit,
  disabled,
  modeConfig,
  accentColor,
  mode,
  chatMessages = [],
  onSendChat,
}: Props) {
  const resolvedConfig = modeConfig ?? GAME_MODES[mode] ?? GAME_MODES.friends
  const accent = accentColor ?? (resolvedConfig as { theme?: { accent?: string } }).theme?.accent ?? "#c65133"
  const gameConfig = resolvedConfig.game
  const leaderboardMode = gameConfig.showLeaderboard
  const isFastPace = gameConfig.pace === "fast"
  const REVEAL_COUNTDOWN = isFastPace ? 4 : 7
  const isHost = user.id === state?.hostUserId
  const isEventPresenter = mode === "event" && isHost
  const isEventParticipant = mode === "event" && !isHost
  // largeUI only applies to the presenter projection — participants get normal sizing
  const isLargeUI = "largeUI" in gameConfig && gameConfig.largeUI === true && !isEventParticipant
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [sourceGuess, setSourceGuess] = useState<number | null>(null)
  const [muted, setMuted] = useState(audioManager.getState().muted)
  const [volume, setVolume] = useState(audioManager.getState().volume)
  const [manualPlayRequired, setManualPlayRequired] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [revealCountdown, setRevealCountdown] = useState(isFastPace ? 4 : 7)
  const [chatInput, setChatInput] = useState("")
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  const remaining = useMemo(() => {
    if (!state?.timing?.revealAt) return 0
    return Math.max(0, Math.ceil((state.timing.revealAt - serverNow) / 1000))
  }, [state?.timing?.revealAt, serverNow])

  const totalSeconds = useMemo(() => {
    if (!state?.timing?.startAt || !state?.timing?.revealAt) return 30
    return Math.max(1, Math.floor((state.timing.revealAt - state.timing.startAt) / 1000))
  }, [state?.timing?.startAt, state?.timing?.revealAt])

  const currentTrack = state?.currentTrack ?? null
  const trackOwnerUsername =
    currentTrack?.metadata &&
    typeof currentTrack.metadata === "object" &&
    typeof (currentTrack.metadata as { owner_username?: unknown }).owner_username === "string"
      ? (currentTrack.metadata as { owner_username?: string }).owner_username ?? null
      : null

  const player = state?.players?.[user.id] ?? null
  const backendPhase = state?.phase

  let uiPhase: Phase
  switch (backendPhase) {
    case "GUESSING":
      uiPhase = player?.hasAnswered || justSubmitted ? "locked" : "guessing"
      break
    case "REVEAL":
    case "FINISHED":
      uiPhase = "reveal"
      break
    default:
      uiPhase = "guessing"
  }

  const hasAnswered = Boolean(player?.hasAnswered)
  const localHasAnswered = hasAnswered || justSubmitted
  const isPlaying = uiPhase === "guessing"
  const isLocked = uiPhase === "locked"
  const isRevealed = uiPhase === "reveal"

  const timerProgress = isPlaying ? Math.max(0, Math.min(100, (remaining / totalSeconds) * 100)) : 100
  const timerColor = isPlaying
    ? remaining > 10
      ? "#2e2014"
      : remaining > 5
        ? "#e0a32e"
        : "#9c2f1d"
    : accent

  const hasInput = guessTitle.trim().length > 0 || guessArtist.trim().length > 0

  const theme = {
    // Thème papier "Club analogique" - transparent pour laisser le papier du body
    "--bg": "transparent",
    "--surface": "#ece1c8",
    "--surface-strong": "#efe5d0",
    "--border": "rgba(46, 32, 20, 0.35)",
    "--ink": "#2e2014",
    "--muted": "#8a7558",
    "--accent": accent,
    "--success": "#7d9471",
    "--warn": "#e0a32e",
    "--error": "#9c2f1d",
  } as CSSProperties

  useEffect(() => {
    return audioManager.subscribe(snapshot => {
      setMuted(snapshot.muted)
      setVolume(snapshot.volume)
    })
  }, [])

  // Audio should play during both guessing and locked phases (music keeps playing
  // after submit while waiting for other players). Use a stable boolean so the effect
  // doesn't re-trigger on guessing↔locked transitions.
  // In event mode, only the presenter plays audio — participants hear it from the projector.
  const isAudioPhase = (uiPhase === "guessing" || uiPhase === "locked") && !isEventParticipant

  // Warmup audio on first user interaction in the game view.
  // This unlocks autoplay for non-host players who didn't click "Lancer".
  const warmedUp = useRef(false)
  useEffect(() => {
    if (warmedUp.current) return
    const handler = () => {
      audioManager.warmup()
      warmedUp.current = true
      document.removeEventListener("click", handler)
      document.removeEventListener("touchstart", handler)
    }
    document.addEventListener("click", handler, { once: true })
    document.addEventListener("touchstart", handler, { once: true })
    return () => {
      document.removeEventListener("click", handler)
      document.removeEventListener("touchstart", handler)
    }
  }, [])

  // Track the current round to force audio restart on new rounds even if
  // isAudioPhase and previewUrl happen to be the same across rounds.
  const currentRound = state?.currentRound ?? 0

  useEffect(() => {
    if (!isAudioPhase || !currentTrack?.previewUrl) {
      audioManager.stop("multiplayer_phase_end", "multiplayer")
      return
    }
    audioManager.setVolume(volume, "multiplayer")
    audioManager.setMuted(muted, "multiplayer")
    // Calculate seek position to sync audio across players
    // timing.startAt is the server timestamp when the round started
    const elapsed = state?.timing?.startAt ? (serverNow - state.timing.startAt) / 1000 : 0
    const seekTo = elapsed > 0.5 ? elapsed : 0 // Only seek if >500ms has passed
    audioManager.play({ src: currentTrack.previewUrl, loop: true, volume, owner: "multiplayer", seekTo })
      .then(() => {
        setManualPlayRequired(false)
      })
      .catch((err) => {
        if ((err as DOMException)?.name === "NotAllowedError") {
          setManualPlayRequired(true)
        } else {
          console.error("multiplayer_audio_play_failed", err)
          setManualPlayRequired(true)
        }
      })
    return () => {
      audioManager.stop("multiplayer_track_cleanup", "multiplayer")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volume changes are applied via setVolume, not by re-triggering play. currentRound forces re-trigger on new rounds.
  }, [isAudioPhase, currentTrack?.previewUrl, muted, currentRound])

  useEffect(() => {
    return () => {
      audioManager.stop("multiplayer_unmount", "multiplayer")
    }
  }, [])


  // Reset justSubmitted as soon as reveal happens, so it's clean for the next round.
  // Without this, justSubmitted stays true through REVEAL→GUESSING transition,
  // causing an immediate LOCK on the new round (deadlock: reset only fires on "guessing"
  // but uiPhase can't become "guessing" while justSubmitted is true).
  useEffect(() => {
    if (uiPhase === "reveal") {
      setJustSubmitted(false)
    }
  }, [uiPhase])

  useEffect(() => {
    if (uiPhase === "guessing") {
      setGuessArtist("")
      setGuessTitle("")
      setSourceGuess(null)
      setJustSubmitted(false)
      setManualPlayRequired(false)
    }
  }, [uiPhase, state?.currentRound])

  // Safety: if stuck in LOCK (justSubmitted but backend says not answered) and timer expired,
  // re-emit the answer to recover from a lost socket event.
  const onAnswerRef = useRef(onAnswer)
  onAnswerRef.current = onAnswer
  const lastResubmitRef = useRef<number>(0)
  useEffect(() => {
    if (!justSubmitted || hasAnswered) return
    if (remaining > 0) return
    if (backendPhase !== "GUESSING") return
    // Timer expired, we submitted but backend doesn't know — re-emit after 2s
    const timer = setTimeout(() => {
      if (Date.now() - lastResubmitRef.current < 5000) return
      lastResubmitRef.current = Date.now()
      onAnswerRef.current(guessTitle.trim(), guessArtist.trim(), sourceGuess)
    }, 2000)
    return () => clearTimeout(timer)
  }, [justSubmitted, hasAnswered, remaining, backendPhase, guessTitle, guessArtist, sourceGuess])

  // Auto-advance countdown during reveal phase
  useEffect(() => {
    if (uiPhase !== "reveal" || disabled || player?.isReady) {
      setRevealCountdown(REVEAL_COUNTDOWN)
      return
    }
    const interval = setInterval(() => {
      setRevealCountdown(prev => {
        if (prev <= 0) return 0
        if (prev === 1) {
          onReadyRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [uiPhase, disabled, player?.isReady, REVEAL_COUNTDOWN])

  // Auto-scroll chat
  useEffect(() => {
    const container = chatScrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [chatMessages])

  const sortedPlayersFixed = useMemo(() => {
    if (!state?.players) return []
    return Object.values(state.players)
      // In event mode, the host is a spectator — exclude from all player lists
      .filter(p => !(mode === "event" && state.hostUserId && p.userId === state.hostUserId))
      .map(p => ({
        userId: p.userId,
        username: p.username,
        score: p.score,
        accuracy: p.accuracy,
        avatar: p.avatar,
        hasAnswered: p.hasAnswered,
        lastGuess: p.lastGuess,
        lastVerdict: p.lastVerdict,
        isReady: p.isReady,
        streak: p.streak ?? 0,
        bestStreak: p.bestStreak ?? 0,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return (b.accuracy ?? 0) - (a.accuracy ?? 0)
      })
  }, [state?.players, mode, state?.hostUserId])

  const answeredCount = useMemo(() => sortedPlayersFixed.filter(p => p.hasAnswered).length, [sortedPlayersFixed])
  const displayAnsweredCount = Math.max(answeredCount, localHasAnswered ? 1 : 0)
  const playerCount = sortedPlayersFixed.length
  const readyCount = sortedPlayersFixed.filter(p => p.isReady).length

  const handleSubmit = () => {
    if (uiPhase !== "guessing" || disabled || localHasAnswered || justSubmitted) return
    setJustSubmitted(true)
    onAnswer(guessTitle.trim(), guessArtist.trim(), sourceGuess)
  }

  const [playLoading, setPlayLoading] = useState(false)

  const handleManualPlay = async () => {
    if (!currentTrack?.previewUrl || playLoading) return
    setPlayLoading(true)
    try {
      await audioManager.play({
        src: currentTrack.previewUrl,
        loop: true,
        volume,
        owner: "multiplayer",
      })
      audioManager.setMuted(muted, "multiplayer")
      setManualPlayRequired(false)
    } catch {
      // Keep manualPlayRequired visible so user can retry
    } finally {
      setPlayLoading(false)
    }
  }

  // Hex directs (pas des var()) : utilisés dans des templates `${color}14` pour les teintes.
  const verdictColor = (verdict: string | null | undefined) => {
    if (verdict === "correct") return "#7d9471"
    if (verdict === "close") return "#e0a32e"
    return "#9c2f1d"
  }

  const verdictLabel = (verdict: string | null | undefined) => {
    if (verdict === "correct") return "Validé"
    if (verdict === "close") return "Partiel"
    return "Raté"
  }

  const panelClassName =
    "rounded-md border-2 border-[#2e2014] bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgba(46,32,20,.18)]"

  // Waveform bars component
  const WaveformBars = ({ active }: { active: boolean }) => (
    <div className="flex items-end gap-[2px] h-4">
      {[0, 1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: accent }}
          animate={active ? {
            height: ["6px", `${12 + Math.sin(i * 1.5) * 4}px`, "6px"],
          } : { height: "4px" }}
          transition={active ? {
            duration: 0.6 + i * 0.1,
            repeat: Infinity,
            ease: "easeInOut",
          } : { duration: 0.2 }}
        />
      ))}
    </div>
  )

  // Theater UI is the new visual for friends/streamer modes.
  // Event mode keeps its dedicated presenter/participant rendering below.
  if (mode !== "event") {
    return (
      <TheaterGameView
        user={user}
        state={state}
        uiPhase={uiPhase}
        isPlaying={isPlaying}
        isLocked={isLocked}
        isRevealed={isRevealed}
        remaining={remaining}
        totalSeconds={totalSeconds}
        sortedPlayers={sortedPlayersFixed}
        answeredCount={answeredCount}
        displayAnsweredCount={displayAnsweredCount}
        playerCount={playerCount}
        readyCount={readyCount}
        guessTitle={guessTitle}
        setGuessTitle={setGuessTitle}
        guessArtist={guessArtist}
        setGuessArtist={setGuessArtist}
        sourceGuess={sourceGuess}
        setSourceGuess={setSourceGuess}
        localHasAnswered={localHasAnswered}
        onSubmit={handleSubmit}
        disabled={disabled}
        muted={muted}
        volume={volume}
        onToggleMute={() => {
          const next = !muted
          audioManager.setMuted(next)
          setMuted(next)
        }}
        onVolumeChange={v => {
          audioManager.setVolume(v, "multiplayer")
          setVolume(v)
          if (v > 0 && muted) { audioManager.setMuted(false); setMuted(false) }
          if (v === 0 && !muted) { audioManager.setMuted(true); setMuted(true) }
        }}
        manualPlayRequired={manualPlayRequired}
        isAudioPhase={isAudioPhase}
        onManualPlay={handleManualPlay}
        currentTrack={currentTrack}
        trackOwnerUsername={trackOwnerUsername}
        player={player}
        revealCountdown={revealCountdown}
        onReady={onReady}
        onRematch={onRematch}
        onExit={onExit}
        chatMessages={chatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendChat={onSendChat}
        chatScrollRef={chatScrollRef}
      />
    )
  }

  return (
    <div
      className="relative min-h-screen"
      style={{ ...theme, background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="relative flex min-h-screen flex-col">
        {/* Header - compact */}
        <header className="shrink-0 border-b-2 border-[#2e2014]">
          <div className="mx-auto flex w-full items-center justify-between gap-4 px-6 py-3 lg:px-12">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[var(--surface)]">
                <Clock className="relative h-4 w-4" style={{ color: timerColor }} />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--muted)]">Blindify</p>
                <h1 className="font-display text-lg font-semibold leading-tight">
                  {mode === "event" ? "Événement" : mode === "streamer" ? "Streamer" : "Amis"}
                </h1>
              </div>
            </div>

            <motion.div
              className="rounded-full border-[1.5px] border-[#2e2014] bg-[var(--surface)] px-4 py-1.5"
              animate={isPlaying && remaining <= 5 && remaining > 0 ? { x: [0, -2, 2, -2, 2, 0], scale: [1, 1.02, 1] } : { x: 0, scale: 1 }}
              transition={isPlaying && remaining <= 5 && remaining > 0 ? { duration: 0.4, repeat: Infinity, repeatDelay: 0.6 } : { duration: 0.2 }}
            >
              <div className="flex items-center gap-3">
                <span className={`${isLargeUI ? "text-2xl" : "text-base"} font-display font-bold`} style={{ color: timerColor }}>
                  {isPlaying ? `${remaining}s` : isLocked ? "LOCK" : "REVEAL"}
                </span>
                <div className={`${isLargeUI ? "h-2 w-40" : "h-1.5 w-28"} rounded-full bg-[rgba(46,32,20,.15)]`}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${timerProgress}%`, background: timerColor }}
                  />
                </div>
                <span className="text-xs font-bold text-[var(--muted)]">
                  {state?.currentRound ?? 0}/{state?.totalRounds ?? 0}
                </span>
              </div>
            </motion.div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 text-xs text-[var(--muted)] md:flex">
                <Users className="h-3.5 w-3.5" />
                <span>{playerCount}</span>
              </div>
              {/* Volume control (hidden for event participants — audio plays on presenter only) */}
              {!isEventParticipant && <div className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] bg-[var(--surface)] px-2 py-1.5">
                <button
                  className="text-[var(--muted)] transition hover:text-[var(--ink)]"
                  onClick={() => {
                    const next = !muted
                    audioManager.setMuted(next)
                    setMuted(next)
                  }}
                  title={muted ? "Activer le son" : "Couper le son"}
                >
                  {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : Math.round(volume * 100)}
                  onChange={e => {
                    const v = Number(e.target.value) / 100
                    audioManager.setVolume(v, "multiplayer")
                    setVolume(v)
                    if (v > 0 && muted) {
                      audioManager.setMuted(false)
                      setMuted(false)
                    }
                    if (v === 0 && !muted) {
                      audioManager.setMuted(true)
                      setMuted(true)
                    }
                  }}
                  className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-[rgba(46,32,20,.25)] accent-[var(--accent)] md:w-20"
                  style={{ accentColor: accent }}
                />
              </div>}
              {onExit && (
                <button
                  className="rounded-full border-[1.5px] border-[#2e2014] bg-[var(--surface)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
                  onClick={onExit}
                >
                  Quitter
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <div className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pb-8 pt-5 lg:flex-row lg:items-stretch lg:px-10">
          <main className="flex flex-1 flex-col gap-5">
            <AnimatePresence mode="wait">
              {/* ===== EVENT PRESENTER VIEW (projection-optimized) ===== */}
              {isEventPresenter ? (
                <motion.section
                  key="presenter"
                  className="flex-1"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className={`${panelClassName} relative overflow-hidden h-full flex flex-col items-center justify-center min-h-[60vh]`}>
                    {state?.phase === "FINISHED" ? (
                      /* --- PRESENTER: FINISHED --- */
                      <div className="relative flex flex-col items-center gap-8 py-6 w-full max-w-2xl">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `${accent}22` }}>
                          <Trophy className="h-8 w-8" style={{ color: accent }} />
                        </div>
                        <h2 className="text-center font-display text-5xl font-semibold">Partie terminée</h2>
                        {/* Podium top 3 */}
                        {sortedPlayersFixed.length >= 3 ? (
                          <div className="flex items-end justify-center gap-4 mt-4">
                            {/* 2nd place */}
                            <div className="flex w-32 flex-col items-center">
                              <div className="mb-2 text-sm font-bold text-[var(--muted)]">2e</div>
                              {sortedPlayersFixed[1].avatar ? (
                                <img src={sortedPlayersFixed[1].avatar} alt={sortedPlayersFixed[1].username ?? "2e joueur"} className="mb-2 h-12 w-12 rounded-full border-2 border-[#2e2014] object-cover" />
                              ) : (
                                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] text-lg font-bold text-[var(--muted)]">
                                  {(sortedPlayersFixed[1].username || "?")[0].toUpperCase()}
                                </div>
                              )}
                              <div className="flex h-24 w-full flex-col items-center justify-center rounded-t-md border-2 border-[#2e2014] bg-[var(--surface-strong)]">
                                <span className="font-display text-lg font-semibold">{sortedPlayersFixed[1].username || "?"}</span>
                                <span className="font-display text-2xl font-bold text-[var(--muted)]">{sortedPlayersFixed[1].score}</span>
                              </div>
                            </div>
                            {/* 1st place */}
                            <div className="flex w-36 flex-col items-center">
                              <Crown className="mb-2 h-8 w-8" style={{ color: accent }} />
                              {sortedPlayersFixed[0].avatar ? (
                                <img src={sortedPlayersFixed[0].avatar} alt={sortedPlayersFixed[0].username ?? "1er joueur"} className="mb-2 h-16 w-16 rounded-full object-cover border-2 border-[#2e2014]" style={{ boxShadow: `0 0 0 3px ${accent}` }} />
                              ) : (
                                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#2e2014] text-xl font-bold text-[#f4ecdb]" style={{ background: accent }}>
                                  {(sortedPlayersFixed[0].username || "?")[0].toUpperCase()}
                                </div>
                              )}
                              <div className="flex h-36 w-full flex-col items-center justify-center rounded-t-md border-2 border-[#2e2014]" style={{ background: `${accent}2b`, boxShadow: "4px 4px 0 rgba(46,32,20,.18)" }}>
                                <span className="font-display text-xl font-bold">{sortedPlayersFixed[0].username || "?"}</span>
                                <span className="font-display text-3xl font-bold" style={{ color: accent }}>{sortedPlayersFixed[0].score}</span>
                                <span className="text-sm text-[var(--muted)]">{Math.round(sortedPlayersFixed[0].accuracy ?? 0)}%</span>
                              </div>
                            </div>
                            {/* 3rd place */}
                            <div className="flex w-32 flex-col items-center">
                              <div className="mb-2 text-sm font-bold text-[var(--muted)]">3e</div>
                              {sortedPlayersFixed[2].avatar ? (
                                <img src={sortedPlayersFixed[2].avatar} alt={sortedPlayersFixed[2].username ?? "3e joueur"} className="mb-2 h-12 w-12 rounded-full border-2 border-[#2e2014] object-cover" />
                              ) : (
                                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] text-lg font-bold text-[var(--muted)]">
                                  {(sortedPlayersFixed[2].username || "?")[0].toUpperCase()}
                                </div>
                              )}
                              <div className="flex h-20 w-full flex-col items-center justify-center rounded-t-md border-2 border-[#2e2014] bg-[var(--surface-strong)]">
                                <span className="font-display text-lg font-semibold">{sortedPlayersFixed[2].username || "?"}</span>
                                <span className="font-display text-2xl font-bold text-[var(--muted)]">{sortedPlayersFixed[2].score}</span>
                              </div>
                            </div>
                          </div>
                        ) : sortedPlayersFixed.length >= 1 ? (
                          <div className="flex items-center justify-center gap-6 mt-4">
                            {sortedPlayersFixed.slice(0, 2).map((p, idx) => (
                              <div key={p.userId} className="flex flex-col items-center gap-2">
                                {idx === 0 && <Crown className="h-6 w-6" style={{ color: accent }} />}
                                <div className="flex h-28 w-28 flex-col items-center justify-center rounded-md border-2 border-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.18)]"
                                  style={{ background: idx === 0 ? `${accent}2b` : "var(--surface-strong)" }}>
                                  <span className="font-display text-lg font-semibold">{p.username || "?"}</span>
                                  <span className="font-display text-2xl font-bold" style={{ color: idx === 0 ? accent : "var(--muted)" }}>{p.score}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {onRematch && (
                          <button
                            onClick={onRematch}
                            className="mt-4 rounded-md border-2 border-[#2e2014] px-8 py-3 text-lg font-bold shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
                            style={{ background: accent, color: "#f4ecdb" }}
                          >
                            Rejouer
                          </button>
                        )}
                      </div>
                    ) : isRevealed && currentTrack ? (
                      /* --- PRESENTER: REVEAL --- */
                      <div className="relative flex flex-col items-center gap-6 py-4 w-full max-w-2xl">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.5 }}
                        >
                          <AnalogVinyl size={200} spinning={false} accentColor={accent} coverUrl={currentTrack.albumCover} blurred={false} />
                        </motion.div>
                        <motion.div
                          className="text-center"
                          initial={{ y: 12, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ duration: 0.4, delay: 0.15 }}
                        >
                          <p className="text-sm font-bold uppercase tracking-[0.32em]" style={{ color: accent }}>La réponse était</p>
                          <h2 className="mt-3 font-display text-5xl font-semibold">{currentTrack.title}</h2>
                          <p className="mt-2 font-display text-2xl italic text-[#6b573f]">{currentTrack.artist}</p>
                          {trackOwnerUsername && (
                            <p className="mt-3 text-base text-[var(--muted)]">Proposé par <span className="font-semibold" style={{ color: accent }}>{trackOwnerUsername}</span></p>
                          )}
                        </motion.div>
                        {/* Mini top 3 */}
                        <motion.div
                          className="flex items-center gap-3 mt-2"
                          initial={{ y: 12, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ duration: 0.4, delay: 0.3 }}
                        >
                          {sortedPlayersFixed.slice(0, 3).map((p, idx) => (
                            <div
                              key={p.userId}
                              className="flex items-center gap-2 rounded-md border-[1.5px] border-[#2e2014] px-3 py-2"
                              style={{
                                background: idx === 0 ? `${accent}2b` : "var(--surface-strong)",
                              }}
                            >
                              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#2e2014] text-[10px] font-bold"
                                style={{ background: idx === 0 ? accent : "#f4ecdb", color: idx === 0 ? "#f4ecdb" : "var(--muted)" }}>
                                {idx + 1}
                              </span>
                              {p.avatar ? (
                                <img src={p.avatar} alt={p.username ?? "Joueur"} className="h-6 w-6 rounded-full border border-[#2e2014] object-cover" />
                              ) : null}
                              <span className="font-display text-sm font-medium">{p.username || "?"}</span>
                              <span className="text-sm font-bold" style={{ color: idx === 0 ? accent : "var(--muted)" }}>{p.score}</span>
                            </div>
                          ))}
                        </motion.div>
                        <div className="text-center text-base text-[var(--muted)]">
                          {readyCount}/{playerCount} prêts · prochain round dans {revealCountdown}s
                        </div>
                      </div>
                    ) : (
                      /* --- PRESENTER: GUESSING / LOCKED --- */
                      <div className="relative flex flex-col items-center gap-8 py-6">
                        <AnalogVinyl size={320} spinning={isPlaying && !manualPlayRequired} accentColor={accent} coverUrl={currentTrack?.albumCover} blurred={!isRevealed} />
                        {manualPlayRequired && isAudioPhase && (
                          <button
                            onClick={handleManualPlay}
                            className="absolute top-[30%] flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] shadow-[3px_3px_0_#2e2014] transition-transform hover:scale-110"
                            title="Lancer la musique"
                          >
                            <Play className="h-10 w-10" style={{ color: accent }} />
                          </button>
                        )}
                        <div className="text-center">
                          <p className="text-base font-bold uppercase tracking-[0.32em] text-[var(--muted)]">
                            {isPlaying ? "Écoute en cours" : "Réponses verrouillées"}
                          </p>
                          <p className="mt-3 font-display text-6xl font-bold" style={{ color: accent }}>
                            {displayAnsweredCount} / {playerCount}
                          </p>
                          <p className="mt-2 text-base text-[var(--muted)]">réponses reçues</p>
                        </div>
                        {/* Player status dots */}
                        <div className="flex flex-wrap justify-center gap-3 max-w-md">
                          {sortedPlayersFixed.map(p => (
                            <div key={p.userId} className="flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-sm"
                              style={{
                                borderColor: p.hasAnswered ? "var(--success)" : "#2e2014",
                                background: p.hasAnswered ? "rgba(125,148,113,0.18)" : "var(--surface-strong)",
                              }}>
                              {p.avatar ? (
                                <img src={p.avatar} alt={p.username ?? "Joueur"} className="h-5 w-5 rounded-full border border-[#2e2014] object-cover" />
                              ) : (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#2e2014] bg-[#f4ecdb] text-[9px] font-bold">
                                  {(p.username || "?")[0].toUpperCase()}
                                </span>
                              )}
                              <span className={p.hasAnswered ? "font-bold text-[#5d7252]" : "text-[var(--muted)]"}>
                                {p.username || `J${p.userId}`}
                              </span>
                              {p.hasAnswered && <Check className="h-3.5 w-3.5 text-[#5d7252]" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.section>
              ) : isRevealed && currentTrack ? (
                /* ===== REVEAL VIEW ===== */
                <motion.section
                  key="reveal"
                  className="flex-1"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45 }}
                >
                  <div className={`${panelClassName} relative overflow-hidden h-full`}>
                    <div className="relative flex flex-col items-center gap-5 py-2">
                      {/* Vinyl with unblurred cover */}
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5 }}
                      >
                        <AnalogVinyl size={160} spinning={false} accentColor={accent} coverUrl={currentTrack.albumCover} blurred={false} />
                      </motion.div>

                      {/* Track info */}
                      <motion.div
                        className="text-center"
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: accent }}>La réponse était</p>
                        <h2 className={`mt-2 ${isLargeUI ? "text-4xl" : "text-3xl"} font-display font-semibold`}>{currentTrack.title}</h2>
                        <p className={`mt-1 ${isLargeUI ? "text-lg" : "text-base"} font-display italic text-[#6b573f]`}>{currentTrack.artist}</p>
                        {trackOwnerUsername && (
                          <p className="mt-1 text-xs text-[var(--muted)]">Proposé par <span style={{ color: accent }}>{trackOwnerUsername}</span></p>
                        )}
                      </motion.div>

                      {/* Verdict card */}
                      <motion.div
                        className="w-full max-w-sm rounded-md border-2 px-4 py-3"
                        style={{ borderColor: verdictColor(player?.lastVerdict), background: `${verdictColor(player?.lastVerdict)}14` }}
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[var(--muted)]">Ta réponse</p>
                            <p className="mt-0.5 text-sm font-medium">{player?.lastGuess || "(pas de réponse)"}</p>
                          </div>
                          <span
                            className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#f4ecdb]"
                            style={{ background: verdictColor(player?.lastVerdict) }}
                          >
                            {verdictLabel(player?.lastVerdict)}
                          </span>
                        </div>
                      </motion.div>

                      {/* Ready button with countdown */}
                      <motion.div
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.45 }}
                      >
                        <Button
                          onClick={onReady}
                          disabled={disabled || player?.isReady}
                          variant="outline"
                          className="rounded-full border-2 bg-[#f4ecdb] px-5 py-2 text-sm font-bold shadow-[3px_3px_0_rgba(46,32,20,.25)]"
                          style={{ borderColor: "#2e2014", color: accent }}
                        >
                          {player?.isReady
                            ? `En attente (${readyCount}/${playerCount})`
                            : `Prêt pour la suite (${revealCountdown}s)`}
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </motion.section>
              ) : (
                /* ===== GUESSING / LOCKED VIEW (form integrated) ===== */
                <motion.section
                  key="guessing"
                  className="flex-1"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className={`${panelClassName} relative overflow-hidden h-full`}>
                    <div className="relative flex flex-col gap-5">
                      {/* Vinyl + status row (friends/streamer) */}
                      {!isEventParticipant && (
                        <div className="relative flex items-center gap-4">
                          <motion.div
                            className="shrink-0"
                            animate={isLocked ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                            transition={isLocked ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
                          >
                            <AnalogVinyl
                              size={isLargeUI ? 140 : 100}
                              spinning={isPlaying && !manualPlayRequired}
                              accentColor={accent}
                              coverUrl={currentTrack?.albumCover}
                              blurred={!isRevealed}
                            />
                          </motion.div>
                          {manualPlayRequired && isAudioPhase && (
                            <button
                              onClick={handleManualPlay}
                              className="absolute left-[50px] top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] shadow-[2px_2px_0_#2e2014] transition-transform hover:scale-110"
                              title="Lancer la musique"
                            >
                              <Play className="h-6 w-6" style={{ color: accent }} />
                            </button>
                          )}
                          <div className="flex flex-1 flex-col gap-2">
                            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                              {isAudioPhase && !manualPlayRequired ? (
                                <>
                                  <WaveformBars active={true} />
                                  <span>Extrait en cours</span>
                                </>
                              ) : manualPlayRequired && isAudioPhase ? (
                                <>
                                  <Play className="h-3 w-3" style={{ color: accent }} />
                                  <span>Cliquer pour lancer</span>
                                </>
                              ) : isLocked ? (
                                <>
                                  <Lock className="h-3 w-3" style={{ color: accent }} />
                                  <span>Reveal dans {remaining}s</span>
                                </>
                              ) : (
                                <>
                                  <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                                  <span>Reveal</span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-[var(--muted)]">
                              {displayAnsweredCount}/{playerCount} réponses reçues
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Compact status bar for event participants (no audio, no vinyl) */}
                      {isEventParticipant && (
                        <div className="flex items-center justify-between rounded-md border-[1.5px] border-[#2e2014] bg-[var(--surface-strong)] px-4 py-3">
                          <div className="flex items-center gap-3">
                            {isPlaying ? (
                              <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: accent }} />
                            ) : isLocked ? (
                              <Lock className="h-3.5 w-3.5" style={{ color: accent }} />
                            ) : (
                              <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                            )}
                            <div className="text-sm">
                              <span className="font-display font-bold" style={{ color: isPlaying && remaining <= 5 ? "var(--error)" : "var(--ink)" }}>
                                {isPlaying ? `${remaining}s` : isLocked ? "LOCK" : "REVEAL"}
                              </span>
                              <span className="ml-2 text-[var(--muted)]">
                                Round {state?.currentRound ?? 0}/{state?.totalRounds ?? 0}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-[var(--muted)]">
                            {displayAnsweredCount}/{playerCount} réponses
                          </span>
                        </div>
                      )}

                      {/* Answer form */}
                      <div className="relative flex flex-col gap-4">

                        {/* Locked overlay */}
                        {isLocked && (
                          <motion.div
                            className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md"
                            style={{ background: "rgba(244,236,219,0.92)" }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <motion.div
                              className="flex flex-col items-center gap-3"
                              initial={{ scale: 0.9 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2e2014]" style={{ background: `${accent}22` }}>
                                <Lock className="h-6 w-6" style={{ color: accent }} />
                              </div>
                              <p className="font-display text-lg font-semibold">Réponse envoyée</p>
                              <p className="text-sm text-[var(--muted)]">Reveal dans {remaining}s</p>
                              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                                {sortedPlayersFixed.filter(p => !p.hasAnswered).length > 0 && (
                                  <p className="text-xs text-[var(--muted)]">
                                    En attente de : {sortedPlayersFixed.filter(p => !p.hasAnswered).map(p => p.username || `Joueur ${p.userId}`).join(", ")}
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          </motion.div>
                        )}

                        {/* Form content */}
                        <form
                          className="flex flex-col gap-4"
                          onSubmit={e => {
                            e.preventDefault()
                            handleSubmit()
                          }}
                        >
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-2 text-xs text-[var(--muted)]">
                              <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Titre</span>
                              <input
                                value={guessTitle}
                                onChange={e => setGuessTitle(e.target.value)}
                                disabled={localHasAnswered || disabled}
                                autoComplete="off"
                                className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-1 py-2 font-display text-lg text-[var(--ink)] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[var(--accent)]"
                                placeholder="Le morceau qui tourne…"
                              />
                            </label>
                            <label className="space-y-2 text-xs text-[var(--muted)]">
                              <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Artiste</span>
                              <input
                                value={guessArtist}
                                onChange={e => setGuessArtist(e.target.value)}
                                disabled={localHasAnswered || disabled}
                                autoComplete="off"
                                className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-1 py-2 font-display text-lg text-[var(--ink)] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[var(--accent)]"
                                placeholder="Qui chante ?"
                              />
                            </label>
                          </div>

                          <div className="space-y-2 text-xs text-[var(--muted)]">
                            <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Qui a ajouté ce titre ?</span>
                            <div className="flex flex-wrap gap-2">
                              {sortedPlayersFixed.map(p => (
                                <button
                                  key={p.userId}
                                  type="button"
                                  disabled={localHasAnswered || disabled}
                                  onClick={() => setSourceGuess(sourceGuess === p.userId ? null : p.userId)}
                                  className="flex items-center gap-2 rounded-full border-2 border-[#2e2014] px-3 py-1.5 text-xs font-bold transition disabled:opacity-60"
                                  style={{
                                    color: sourceGuess === p.userId ? "#f4ecdb" : "var(--ink)",
                                    background: sourceGuess === p.userId ? accent : "#f4ecdb",
                                    boxShadow: sourceGuess === p.userId ? `0 0 0 2px #f4ecdb, 0 0 0 4px ${accent}` : "none",
                                  }}
                                >
                                  {p.avatar ? (
                                    <img
                                      src={p.avatar}
                                      alt={p.username ?? "Joueur"}
                                      className="h-5 w-5 rounded-full border border-[#2e2014] object-cover"
                                    />
                                  ) : (
                                    <span
                                      className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                                      style={{
                                        background: sourceGuess === p.userId ? "#f4ecdb" : "var(--surface)",
                                        color: sourceGuess === p.userId ? accent : "var(--muted)",
                                      }}
                                    >
                                      {(p.username || "?")[0].toUpperCase()}
                                    </span>
                                  )}
                                  {p.username || `Joueur ${p.userId}`}
                                </button>
                              ))}
                            </div>
                          </div>

                          <motion.button
                            type="submit"
                            disabled={localHasAnswered || disabled}
                            className="relative w-full rounded-md py-3 text-base font-bold transition disabled:opacity-60"
                            style={{
                              background: localHasAnswered ? "var(--surface-strong)" : "#2e2014",
                              color: localHasAnswered ? "var(--muted)" : "#f4ecdb",
                              border: "2px solid #2e2014",
                              boxShadow: hasInput && !localHasAnswered ? "4px 4px 0 rgba(46,32,20,.3)" : "none",
                            }}
                            whileTap={!localHasAnswered ? { scale: 0.93 } : undefined}
                            animate={localHasAnswered ? { scale: [1.06, 1], transition: { duration: 0.3 } } : undefined}
                          >
                            {localHasAnswered ? (
                              <span className="flex items-center justify-center gap-2">
                                <Check className="h-4 w-4" style={{ color: accent }} />
                                Envoyée
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-2">
                                <Check className="h-4 w-4" />
                                Valider
                              </span>
                            )}
                          </motion.button>
                        </form>
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Leaderboard in reveal */}
            {isRevealed && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.2 }}
                className={panelClassName}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: accent }}>Face B · Classement</h3>
                  <span className="text-xs text-[var(--muted)]">Manche {state?.currentRound}</span>
                </div>

                <div className="mt-4">
                  {(leaderboardMode === "top3" ? sortedPlayersFixed.slice(0, 3) : sortedPlayersFixed).map((p, idx) => (
                    <div
                      key={p.userId}
                      className={`flex items-baseline gap-2.5 ${isLargeUI ? "py-2.5 text-lg" : "py-1.5 text-base"}`}
                    >
                      <span className="w-7 shrink-0 text-xs text-[var(--muted)]">A{idx + 1}</span>
                      <span
                        className="font-display font-semibold"
                        style={{ color: p.userId === user.id ? accent : "var(--ink)" }}
                      >
                        {p.username || `Joueur ${p.userId}`}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {p.lastVerdict === "correct" ? "Validé" : p.lastVerdict === "close" ? "Partiel" : "Raté"}
                      </span>
                      {p.streak >= 2 && (
                        <span className="text-xs font-bold" style={{ color: "var(--warn)" }}>
                          {p.streak}x
                        </span>
                      )}
                      <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-[rgba(46,32,20,.45)]" />
                      <span className="font-bold">{p.score}</span>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Game over (presenter has its own FINISHED view) */}
            {state?.phase === "FINISHED" && !isEventPresenter && (
              <motion.section
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className={panelClassName}
              >
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2e2014]" style={{ background: `${accent}22` }}>
                    <Trophy className="h-6 w-6" style={{ color: accent }} />
                  </div>
                  <h3 className="font-display text-xl font-semibold">Partie terminée</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {state.totalRounds ?? 10} rounds joués
                  </p>
                </div>

                {/* Podium for 3+ players */}
                {sortedPlayersFixed.length >= 3 && (
                  <div className="mt-5 flex items-end justify-center gap-2">
                    <div className="flex w-20 flex-col items-center">
                      <div className="mb-1 text-[10px] font-bold text-[var(--muted)]">2e</div>
                      <div className="flex h-16 w-full flex-col items-center justify-center rounded-t-md border-2 border-[#2e2014] bg-[var(--surface-strong)]">
                        <span className="font-display text-xs font-semibold">{sortedPlayersFixed[1].username || "?"}</span>
                        <span className="text-[11px] text-[var(--muted)]">{sortedPlayersFixed[1].score}</span>
                      </div>
                    </div>
                    <div className="flex w-24 flex-col items-center">
                      <Crown className="mb-1 h-4 w-4" style={{ color: accent }} />
                      <div
                        className="flex h-24 w-full flex-col items-center justify-center rounded-t-md border-2 border-[#2e2014]"
                        style={{ background: `${accent}2b`, boxShadow: "3px 3px 0 rgba(46,32,20,.18)" }}
                      >
                        <span className="font-display text-sm font-semibold">{sortedPlayersFixed[0].username || "?"}</span>
                        <span className="font-display text-base font-bold" style={{ color: accent }}>{sortedPlayersFixed[0].score}</span>
                        <span className="text-[10px] text-[var(--muted)]">{Math.round(sortedPlayersFixed[0].accuracy ?? 0)}%</span>
                      </div>
                    </div>
                    <div className="flex w-20 flex-col items-center">
                      <div className="mb-1 text-[10px] font-bold text-[var(--muted)]">3e</div>
                      <div className="flex h-14 w-full flex-col items-center justify-center rounded-t-md border-2 border-[#2e2014] bg-[var(--surface-strong)]">
                        <span className="font-display text-xs font-semibold">{sortedPlayersFixed[2].username || "?"}</span>
                        <span className="text-[11px] text-[var(--muted)]">{sortedPlayersFixed[2].score}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Duel layout for 2 players */}
                {sortedPlayersFixed.length === 2 && (
                  <div className="mt-5 flex items-center justify-center gap-4">
                    {sortedPlayersFixed.map((p, idx) => (
                      <div key={p.userId} className="flex flex-col items-center gap-1.5">
                        {idx === 0 && <Crown className="h-4 w-4" style={{ color: accent }} />}
                        {idx === 1 && <div className="h-4" />}
                        <div
                          className="flex h-20 w-24 flex-col items-center justify-center rounded-md border-2 border-[#2e2014]"
                          style={{
                            background: idx === 0 ? `${accent}2b` : "var(--surface-strong)",
                            boxShadow: idx === 0 ? "3px 3px 0 rgba(46,32,20,.18)" : "none",
                          }}
                        >
                          <span className="font-display text-sm font-semibold">{p.username || "?"}</span>
                          <span className="font-display text-base font-bold" style={{ color: idx === 0 ? accent : "var(--muted)" }}>
                            {p.score}
                          </span>
                          <span className="text-[10px] text-[var(--muted)]">{Math.round(p.accuracy ?? 0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Full leaderboard */}
                <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: accent }}>Face B · Classement final</p>
                <div className="mt-2">
                  {sortedPlayersFixed.map((p, idx) => (
                    <div key={p.userId} className="flex items-baseline gap-2.5 py-1.5 text-sm">
                      <span className="w-7 shrink-0 text-xs text-[var(--muted)]">A{idx + 1}</span>
                      <span
                        className="font-display text-base font-semibold"
                        style={{ color: idx === 0 ? accent : "var(--ink)" }}
                      >
                        {p.username || `Joueur ${p.userId}`}
                      </span>
                      {p.bestStreak >= 2 && (
                        <span className="text-xs font-bold" style={{ color: "var(--warn)" }}>{p.bestStreak}x</span>
                      )}
                      <span className="text-[10px] text-[var(--muted)]">{Math.round(p.accuracy ?? 0)}%</span>
                      <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-[rgba(46,32,20,.45)]" />
                      <span className="font-bold">{p.score}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  {onRematch && (
                    <button
                      onClick={onRematch}
                      className="rounded-md border-2 border-[#2e2014] px-5 py-2 text-sm font-bold shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#2e2014]"
                      style={{ background: accent, color: "#f4ecdb" }}
                    >
                      Rejouer
                    </button>
                  )}
                  {onExit && (
                    <button
                      onClick={onExit}
                      className="rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] px-5 py-2 text-sm font-bold text-[var(--ink)] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
                    >
                      Retour au lobby
                    </button>
                  )}
                </div>
              </motion.section>
            )}
          </main>

          {/* Sidebar with scoreboard + activity (hidden for event presenter only) */}
          {!isEventPresenter && (
            <motion.aside
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="flex w-full flex-col overflow-hidden rounded-md border-2 border-[#2e2014] bg-[var(--surface)] shadow-[4px_4px_0_rgba(46,32,20,.18)] lg:sticky lg:top-4 lg:h-[calc(100vh-100px)] lg:w-72"
            >
              {/* Scoreboard */}
              <div className="border-b-2 border-[#2e2014] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: accent }}>Face B · Classement</p>
                <div className="mt-2">
                  {sortedPlayersFixed.map((p, idx) => (
                    <div
                      key={p.userId}
                      className="flex items-baseline gap-2 py-1 text-xs"
                    >
                      <span className="w-5 shrink-0 text-[10px] text-[var(--muted)]">A{idx + 1}</span>
                      <span
                        className="font-display text-sm font-semibold"
                        style={{ color: p.userId === user.id ? accent : "var(--ink)" }}
                      >
                        {p.username || `J${p.userId}`}
                      </span>
                      {/* Status indicator */}
                      {isPlaying && p.hasAnswered && (
                        <span className="h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ background: accent }} />
                      )}
                      {isRevealed && p.isReady && (
                        <Check className="h-3 w-3 shrink-0 self-center" style={{ color: "var(--success)" }} />
                      )}
                      <span className="flex-1 -translate-y-0.5 border-b-2 border-dotted border-[rgba(46,32,20,.45)]" />
                      <span className="font-bold text-[var(--ink)]">
                        {p.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Round status */}
              <div className="border-b-2 border-[#2e2014] px-4 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Round {state?.currentRound ?? 0}/{state?.totalRounds ?? 0}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {isPlaying ? `${answeredCount}/${playerCount} ont répondu` :
                   isLocked ? `${answeredCount}/${playerCount} ont répondu · ${remaining}s` :
                   isRevealed ? `${readyCount}/${playerCount} prêts` : ""}
                </p>
              </div>

              {/* Chat */}
              <div className="flex items-center justify-between border-b-2 border-[#2e2014] px-4 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">Chat</p>
              </div>
              <div ref={chatScrollRef} className="flex-1 space-y-1 overflow-auto px-3 py-2 text-xs">
                {chatMessages.length === 0 && (
                  <div className="px-1 py-1 text-[11px] text-[var(--muted)] italic">
                    Aucun message
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className="px-1 py-0.5 text-[11px]">
                    <span className="font-semibold" style={{ color: msg.userId === user.id ? accent : "var(--muted)" }}>
                      {msg.username}
                    </span>{" "}
                    <span className="text-[var(--ink)]">{msg.message}</span>
                  </div>
                ))}
              </div>
              {onSendChat && (
                <form
                  className="border-t-2 border-[#2e2014] px-3 py-2"
                  onSubmit={e => {
                    e.preventDefault()
                    const text = chatInput.trim()
                    if (!text) return
                    onSendChat(text)
                    setChatInput("")
                  }}
                >
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Message..."
                    maxLength={200}
                    className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs text-[var(--ink)] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#2e2014]"
                  />
                </form>
              )}
            </motion.aside>
          )}
        </div>
      </div>
    </div>
  )
}
