"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import type { SoloTrack } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { VinylDisc } from "./VinylDisc"
import { audioManager } from "@/lib/audioManager"
import { computeScore } from "@/lib/roundFlow"
import { evaluateGuessSeparate, type Verdict } from "@/lib/matching"
import { playCorrectSound, playPartialSound, playWrongSound } from "@/lib/audioManager"
import { Flame, Timer, SkipForward, Check } from "lucide-react"

const ACCENT = "#c65133"
const AUDIO_OWNER = "chrono"
const VINYL_GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"
const COUNTDOWN_STEPS = [3, 2, 1]
const FLASH_DURATION_MS = 400
const LISTENING_DURATION_MS = 30_000

export type ChronoStats = {
  attempted: number
  correct: number
  points: number
  bestStreak: number
  timeMs: number
}

interface ChronoGameClientProps {
  tracks: SoloTrack[]
  durationSeconds: number
  onGameComplete?: (stats: ChronoStats) => void
}

type GamePhase = "countdown" | "playing" | "finished"
type FlashColor = "green" | "yellow" | "red" | null

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function ChronoGameClient({ tracks, durationSeconds, onGameComplete }: ChronoGameClientProps) {
  const router = useRouter()

  // Game state
  const [phase, setPhase] = useState<GamePhase>("countdown")
  const [countdownValue, setCountdownValue] = useState(3)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(durationSeconds)
  const [points, setPoints] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [attempted, setAttempted] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [flash, setFlash] = useState<FlashColor>(null)

  // Inputs
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")

  // Refs
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const trackStartRef = useRef<number>(0)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const finishedRef = useRef(false)

  const currentTrack = tracks[currentIndex] ?? null

  // --- Cleanup audio on unmount ---
  useEffect(() => {
    return () => {
      audioManager.stop("unmount", AUDIO_OWNER)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // --- Countdown phase ---
  useEffect(() => {
    if (phase !== "countdown") return

    let step = 0
    const interval = setInterval(() => {
      step += 1
      if (step >= COUNTDOWN_STEPS.length) {
        clearInterval(interval)
        setPhase("playing")
        return
      }
      setCountdownValue(COUNTDOWN_STEPS[step])
    }, 1000)

    return () => clearInterval(interval)
  }, [phase])

  // --- Start global timer when playing begins ---
  useEffect(() => {
    if (phase !== "playing") return

    startTimeRef.current = Date.now()
    trackStartRef.current = Date.now()
    setTimeLeft(durationSeconds)

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const remaining = Math.max(0, durationSeconds - elapsed)
      setTimeLeft(remaining)

      if (remaining <= 0) {
        finishGame()
      }
    }, 250)

    // Play first track
    playCurrentTrack(0)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const playCurrentTrack = useCallback((index: number) => {
    const track = tracks[index]
    if (!track?.audio_url) return

    trackStartRef.current = Date.now()
    audioManager.play({
      src: track.audio_url,
      owner: AUDIO_OWNER,
      volume: 0.35,
    }).catch(err => {
      console.error("chrono_audio_play_failed", err)
    })
  }, [tracks])

  const finishGame = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true

    audioManager.stop("game_over", AUDIO_OWNER)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setPhase("finished")
  }, [])

  const advanceToNext = useCallback(() => {
    setGuessTitle("")
    setGuessArtist("")
    setFlash(null)

    const nextIndex = currentIndex + 1
    if (nextIndex >= tracks.length) {
      finishGame()
      return
    }

    setCurrentIndex(nextIndex)
    playCurrentTrack(nextIndex)
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }, [currentIndex, tracks.length, finishGame, playCurrentTrack])

  const showFlash = useCallback((color: FlashColor) => {
    setFlash(color)
    setTimeout(() => {
      setFlash(null)
      advanceToNext()
    }, FLASH_DURATION_MS)
  }, [advanceToNext])

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault()
    if (phase !== "playing" || !currentTrack) return

    const result = evaluateGuessSeparate(guessTitle, guessArtist, {
      title: currentTrack.title,
      artist: currentTrack.artist,
    })

    if (result.verdict === "wrong") {
      playWrongSound()
      setFlash("red")
      setTimeout(() => setFlash(null), FLASH_DURATION_MS)
      // Stay on same track, don't advance
      return
    }

    const reactionMs = Date.now() - trackStartRef.current
    const scoreResult = computeScore({
      matchedTitle: result.matchedTitle,
      matchedArtist: result.matchedArtist,
      guessProvided: result.guessProvided,
      reactionMs,
      maxDurationMs: LISTENING_DURATION_MS,
      streak,
    })

    setAttempted(prev => prev + 1)
    setPoints(prev => prev + scoreResult.gained)

    if (result.verdict === "correct") {
      playCorrectSound()
      const newStreak = streak + 1
      setStreak(newStreak)
      setBestStreak(prev => Math.max(prev, newStreak))
      setCorrect(prev => prev + 1)
      showFlash("green")
    } else {
      // close — partial match
      playPartialSound()
      setStreak(0)
      setCorrect(prev => prev + (result.matchedTitle ? 1 : 0))
      showFlash("yellow")
    }
  }, [phase, currentTrack, guessTitle, guessArtist, streak, showFlash])

  const handleSkip = useCallback(() => {
    if (phase !== "playing") return
    setAttempted(prev => prev + 1)
    setStreak(0)
    advanceToNext()
  }, [phase, advanceToNext])

  // --- Build final stats ---
  const finalStats: ChronoStats = {
    attempted,
    correct,
    points,
    bestStreak,
    timeMs: durationSeconds * 1000,
  }

  // Notify parent on game complete
  useEffect(() => {
    if (phase === "finished" && onGameComplete) {
      onGameComplete(finalStats)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // --- Countdown screen ---
  if (phase === "countdown") {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#8a7558]">Prepare-toi</p>
          <div
            className="font-display text-8xl font-bold tabular-nums"
            style={{ color: ACCENT }}
          >
            {countdownValue}
          </div>
          <p className="text-sm text-[#6b573f]">
            {formatTime(durationSeconds)} a jouer
          </p>
        </div>
      </div>
    )
  }

  // --- Finished screen ---
  if (phase === "finished") {
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0

    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-md space-y-6 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-8 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <div className="text-center space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: ACCENT }}>
              Chrono termine
            </p>
            <h2 className="font-display text-3xl font-bold text-[#2e2014]">{points} pts</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Corrects" value={`${correct} / ${attempted}`} />
            <StatCard label="Precision" value={`${accuracy}%`} />
            <StatCard label="Meilleur streak" value={String(bestStreak)} />
            <StatCard label="Duree" value={formatTime(durationSeconds)} />
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push("/chrono")}
              className="w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
            >
              Rejouer
            </button>
            <button
              type="button"
              onClick={() => router.push("/modes")}
              className="w-full rounded-md border-2 border-[#2e2014] bg-transparent py-3 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            >
              Retour au menu
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Playing screen ---
  const flashBorder =
    flash === "green"
      ? "border-[#7d9471]"
      : flash === "yellow"
        ? "border-[#e0a32e]"
        : flash === "red"
          ? "border-[#9c2f1d]"
          : "border-[#2e2014]"

  const flashBg =
    flash === "green"
      ? "bg-[#7d9471]/15"
      : flash === "yellow"
        ? "bg-[#e0a32e]/15"
        : flash === "red"
          ? "bg-[#9c2f1d]/10"
          : "bg-[#ece1c8]"

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b-2 border-[#2e2014] px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Timer className="h-4 w-4" style={{ color: timeLeft <= 10 ? "#9c2f1d" : ACCENT }} />
            <span
              className={`font-display text-xl font-bold tabular-nums ${timeLeft <= 10 ? "text-[#9c2f1d] animate-pulse" : "text-[#2e2014]"}`}
            >
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-[#7d9471]" />
            <span className="text-[#2e2014] tabular-nums">{correct}</span>
          </div>
          {streak > 1 && (
            <div className="flex items-center gap-1">
              <Flame className="h-4 w-4 text-[#c65133]" />
              <span className="text-[#c65133] font-semibold tabular-nums">{streak}</span>
            </div>
          )}
          <span className="text-[#8a7558] text-xs">
            {points} pts
          </span>
        </div>
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-6">
        {/* Vinyl disc (compact) */}
        <div className="relative">
          <VinylDisc
            size={160}
            spinning={true}
            accentColor={ACCENT}
            coverUrl={currentTrack?.album_cover}
            blurred={true}
          />
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] px-3 py-0.5 text-[11px] font-bold text-[#6b573f] tabular-nums">
            {currentIndex + 1} / {tracks.length}
          </div>
        </div>

        {/* Input card */}
        <div
          className={`w-full max-w-md rounded-2xl border p-5 transition-colors duration-200 ${flashBorder} ${flashBg}`}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              ref={titleInputRef}
              type="text"
              value={guessTitle}
              onChange={e => setGuessTitle(e.target.value)}
              placeholder="Titre..."
              autoComplete="off"
              autoFocus
              className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-2.5 text-sm text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
            <input
              type="text"
              value={guessArtist}
              onChange={e => setGuessArtist(e.target.value)}
              placeholder="Artiste..."
              autoComplete="off"
              className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-2.5 text-sm text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="outline"
                disabled={!guessTitle.trim() && !guessArtist.trim()}
                className="flex-1 justify-center rounded-xl border-2 py-2.5 text-sm font-semibold transition disabled:opacity-40"
                style={{ borderColor: ACCENT, color: ACCENT }}
              >
                Valider
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSkip}
                className="rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] px-4 py-2.5 text-sm font-semibold text-[#8a7558] hover:text-[#2e2014] transition"
              >
                <SkipForward className="h-4 w-4 mr-1" />
                Passer
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] p-3 text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a7558]">{label}</div>
      <div className="mt-1 font-display text-lg font-bold text-[#2e2014]">{value}</div>
    </div>
  )
}
