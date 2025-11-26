"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { api } from "@/lib/api"
import type { SoloTrack, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowRight, Check, Flame, Heart, Play, Sparkles, Timer, Volume2 } from "lucide-react"

type Phase = "countdown" | "listening" | "reveal"
type Verdict = "correct" | "close" | "wrong"
type FinalizeReason = "timeout" | "reveal" | "guess"
type RoundState = "pending" | "current" | Verdict

export interface SoloGameClientProps {
  user: UserSummary
  tracks: SoloTrack[]
  mode?: "solo" | "multiplayer"
  difficulty?: "easy" | "normal" | "hard"
  source?: string
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
}

const LISTENING_DURATION = 45
const COUNTDOWN_DURATION = 3

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
  difficulty = "normal",
  source = "library",
  onRoundComplete,
  onGameComplete,
}: SoloGameClientProps) {
  const [trackList, setTrackList] = useState<SoloTrack[]>(tracks)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("countdown")
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION)
  const [timer, setTimer] = useState(LISTENING_DURATION)
  const [guess, setGuess] = useState("")
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [liking, setLiking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameFinished, setGameFinished] = useState(false)
  const [roundStates, setRoundStates] = useState<RoundState[]>(() =>
    tracks.map((_, i) => (i === 0 ? "current" : "pending"))
  )

  const [stats, setStats] = useState<RoundStats>({
    rounds: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
  })
  const [manualPlayRequired, setManualPlayRequired] = useState(false)

  const statsRef = useRef(stats)
  const guessRef = useRef(guess)
  const verdictRef = useRef<Verdict | null>(verdict)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const listeningRafRef = useRef<number | null>(null)
  const listeningDeadlineRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    setTrackList(tracks)
    setRoundStates(tracks.map((_, i) => (i === 0 ? "current" : "pending")))
    setIndex(0)
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

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  useEffect(() => {
    guessRef.current = guess
  }, [guess])

  useEffect(() => {
    verdictRef.current = verdict
  }, [verdict])

  const cleanupTimers = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    if (listeningRafRef.current !== null) {
      cancelAnimationFrame(listeningRafRef.current)
      listeningRafRef.current = null
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause()
        audioRef.current.src = ""
      } catch {
        // ignore cleanup errors
      }
      audioRef.current = null
    }
  }, [])

  const finalizeRound = useCallback(
    (nextVerdict: Verdict, reason: FinalizeReason, track: SoloTrack, submittedGuess: string) => {
      if (!track) return
      if (phase === "reveal") return

      cleanupTimers()

      const prevStats = statsRef.current
      const correct = nextVerdict === "correct"
      const streak = correct ? prevStats.streak + 1 : 0
      const updatedStats: RoundStats = {
        rounds: prevStats.rounds + 1,
        correct: prevStats.correct + (correct ? 1 : 0),
        streak,
        bestStreak: Math.max(prevStats.bestStreak, streak),
      }

      statsRef.current = updatedStats
      setStats(updatedStats)
      setVerdict(nextVerdict)
      verdictRef.current = nextVerdict
      setPhase("reveal")

      const feedbackMessage =
        nextVerdict === "correct"
          ? reason === "guess"
            ? "Spot on! You nailed it."
            : "Great job — the reveal confirms your ear."
          : nextVerdict === "close"
            ? "So close! Try adding the full title or artist next time."
            : reason === "timeout"
              ? "Time's up. Ready for another shot?"
              : "Not quite. Revealing the answer for the next round."
      setFeedback(feedbackMessage)

      onRoundComplete?.({
        track,
        verdict: nextVerdict,
        guess: submittedGuess,
        round: index + 1,
        stats: updatedStats,
      })
      setRoundStates(prev => {
        const copy = [...prev]
        copy[index] = nextVerdict
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
    [cleanupTimers, phase, index, total, onRoundComplete, onGameComplete]
  )

  useEffect(() => {
    if (!current || gameFinished) return

    cleanupTimers()

    setPhase("countdown")
    setCountdown(COUNTDOWN_DURATION)
    setTimer(LISTENING_DURATION)
    setGuess("")
    setVerdict(null)
    setFeedback(null)
    setError(null)
    setManualPlayRequired(false)
    previewUrlRef.current = null

    let remaining = COUNTDOWN_DURATION
    countdownRef.current = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(countdownRef.current!)
        countdownRef.current = null
        setPhase("listening")
      } else {
        setCountdown(remaining)
      }
    }, 1000)

    return () => {
      cleanupTimers()
    }
  }, [current, cleanupTimers, gameFinished])

  useEffect(() => {
    setRoundStates(prev =>
      trackList.map((_, i) => {
        if (prev[i]) return prev[i]
        return i === 0 ? "current" : "pending"
      })
    )
  }, [trackList])

  useEffect(() => {
    setRoundStates(prev => {
      const copy = [...prev]
      if (copy[index] === "pending") copy[index] = "current"
      return copy
    })
  }, [index])

  useEffect(() => {
    if (!current || gameFinished) return
    if (phase !== "listening") return

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
      if (audioRef.current) {
        try {
          audioRef.current.pause()
        } catch {
          // ignore pause errors
        }
      }

      const audio = new Audio(previewUrl)
      audioRef.current = audio
      audio.loop = false
      await audio.play()
      if (cancelled) return
      setManualPlayRequired(false)
      setFeedback(null)

      listeningDeadlineRef.current = Date.now() + LISTENING_DURATION * 1000

      const tick = () => {
        if (cancelled) return
        const remainingMs = listeningDeadlineRef.current - Date.now()
        const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
        setTimer(prev => (prev === nextSeconds ? prev : nextSeconds))
        if (remainingMs <= 0) {
          const latestGuess = guessRef.current
          const computedVerdict =
            verdictRef.current ?? evaluateGuess(latestGuess, track)
          finalizeRound(computedVerdict, "timeout", track, latestGuess)
        } else {
          listeningRafRef.current = requestAnimationFrame(tick)
        }
      }

      listeningRafRef.current = requestAnimationFrame(tick)
    }

    const startPlayback = async () => {
      const previewUrl = await ensurePreview()
      if (!previewUrl) {
        setFeedback("Aucun extrait audio disponible pour ce titre.")
        const latestGuess = guessRef.current
        finalizeRound("wrong", "timeout", current, latestGuess)
        if (hasMoreRounds) {
          setTimeout(() => {
            setIndex(prev => Math.min(prev + 1, total - 1))
          }, 800)
        }
        return
      }

      previewUrlRef.current = previewUrl

      try {
        await startAudio(previewUrl, current)
      } catch (err) {
        if (cancelled) return
        if ((err as DOMException)?.name === "NotAllowedError") {
          setManualPlayRequired(true)
          setFeedback("Clique sur ▶ pour lancer l'extrait audio.")
          return
        }
        console.error("html_audio_play_failed", err)
        setFeedback("Impossible de lire l'extrait.")
      }
    }

    startPlayback()

    return () => {
      cancelled = true
      if (listeningRafRef.current !== null) {
        cancelAnimationFrame(listeningRafRef.current)
        listeningRafRef.current = null
      }
    }
  }, [
    phase,
    current,
    cleanupTimers,
    finalizeRound,
    gameFinished,
    hasMoreRounds,
    total,
    setIndex,
  ])

  const handleManualPlay = useCallback(async () => {
    if (!current) return
    const previewUrl = previewUrlRef.current
    if (!previewUrl) {
      setFeedback("Aucun extrait audio disponible pour ce titre.")
      return
    }
    try {
      const audio = new Audio(previewUrl)
      if (audioRef.current) {
        try {
          audioRef.current.pause()
        } catch {
          // ignore pause errors
        }
      }
      audioRef.current = audio
      audio.loop = false
      await audio.play()
      setManualPlayRequired(false)

      listeningDeadlineRef.current = Date.now() + LISTENING_DURATION * 1000
      const tick = () => {
        const remainingMs = listeningDeadlineRef.current - Date.now()
        const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
        setTimer(prev => (prev === nextSeconds ? prev : nextSeconds))
        if (remainingMs <= 0) {
          const latestGuess = guessRef.current
          const computedVerdict =
            verdictRef.current ?? evaluateGuess(latestGuess, current)
          finalizeRound(computedVerdict, "timeout", current, latestGuess)
        } else {
          listeningRafRef.current = requestAnimationFrame(tick)
        }
      }
      listeningRafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      console.error("manual_play_failed", err)
      setFeedback("Impossible de lancer l'extrait.")
    }
  }, [current, finalizeRound])

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
      if (!current || phase === "reveal") return
      const currentVerdict = evaluateGuess(guess, current)
      setVerdict(currentVerdict)

      if (currentVerdict === "correct") {
        finalizeRound(currentVerdict, "guess", current, guess)
      } else {
        setFeedback(
          currentVerdict === "close"
            ? "Close! Try adding more detail or double-check the spelling."
            : "Not quite. Keep listening or reveal the track."
        )
      }
    },
    [current, guess, phase, finalizeRound]
  )

  const handleReveal = useCallback(() => {
    if (!current) return
    const finalVerdict = verdict ?? evaluateGuess(guess, current)
    finalizeRound(finalVerdict, "reveal", current, guess)
  }, [current, verdict, guess, finalizeRound])

  const handleNext = useCallback(() => {
    if (!hasMoreRounds) {
      setGameFinished(true)
      return
    }
    setGameFinished(false)
    setIndex(prev => Math.min(prev + 1, total - 1))
  }, [hasMoreRounds, total])

  const handleSkipQuestion = useCallback(() => {
    if (!current || phase === "reveal") return
    const submittedGuess = guessRef.current ?? guess
    const finalVerdict = verdictRef.current ?? "wrong"
    finalizeRound(finalVerdict, "reveal", current, submittedGuess)
    if (hasMoreRounds) {
      setTimeout(() => setIndex(prev => Math.min(prev + 1, total - 1)), 150)
    }
  }, [current, phase, finalizeRound, hasMoreRounds, total, guess])

  const handleLike = useCallback(async () => {
    if (!current || liking) return
    try {
      setLiking(true)
      await api.addLike(user.id, current.audioSourceId)
      setError(null)
      setFeedback("Added to favourites for later ✨")
    } catch (err) {
      console.error("like_failed", err)
      setError("Unable to save this track right now.")
    } finally {
      setLiking(false)
    }
  }, [current, liking, user.id])

  if (!current) {
    return (
      <div className="surface flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 p-10 text-center">
        <Sparkles className="h-10 w-10 text-neon" />
        <p className="text-sm text-slate-300">No tracks available — try syncing another provider.</p>
        <Button variant="outline" onClick={() => (window.location.href = "/menu")}>
          Return to menu
        </Button>
      </div>
    )
  }

  if (gameFinished) {
    return (
      <div className="surface flex flex-col items-center gap-6 rounded-3xl border border-white/10 p-10 text-center">
        <Sparkles className="h-12 w-12 text-neon" />
        <h2 className="text-3xl font-semibold text-white">Session complete!</h2>
        <p className="text-sm text-slate-300">
          {stats.correct} / {stats.rounds} correct · Best streak: {stats.bestStreak} · Accuracy {accuracy}%.
        </p>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <a href="/menu">Return to menu</a>
          </Button>
          <Button asChild>
            <a href="/solo">Play again</a>
          </Button>
        </div>
      </div>
    )
  }

  const positionLabel = `${index + 1} / ${total}`
  const percent = Math.round(((index) / Math.max(1, total)) * 100)

  return (
    <div className="min-h-screen bg-black text-white grid lg:grid-cols-[1fr_320px]">
      <div className="px-6 pb-10 pt-6">
        <div className="flex items-center justify-between mb-6">
          <button
            className="rounded-md border border-[#1b1b1b] bg-transparent px-4 py-2 text-sm text-white hover:bg-[#151515]"
            onClick={() => (window.location.href = "/menu")}
          >
            ← Quitter
          </button>
          <div className="rounded-lg border border-[#4c2c56] bg-[#2a1c2f] px-4 py-2 text-sm font-semibold text-[#f7e8ff] shadow">
            Score: {stats.correct}/{total}
          </div>
        </div>

        <div className="rounded-xl border border-[#1b1b1b] bg-[#0f0f0f] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <div className="mb-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-[#8a8a8a]">
              <span>Question {index + 1} sur {total}</span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#161616]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#b155f0] to-[#f24f90]" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="mx-auto mb-6 grid h-[200px] w-[200px] place-items-center rounded-xl bg-gradient-to-br from-[#b155f0] to-[#f24f90] shadow-[0_25px_60px_rgba(204,90,196,0.35)]">
            <span className="text-5xl opacity-90">🎵</span>
          </div>

          <div className="text-center text-5xl font-bold mb-2">
            {phase === "countdown" ? countdown.toString().padStart(2, "0") : timer.toString().padStart(2, "0")}
          </div>
          <div className="mb-6 text-center text-sm text-[#8a8a8a]">secondes restantes</div>

          <form className="flex flex-col gap-3" onSubmit={handleGuessSubmit}>
            <input
              value={guess}
              onChange={event => setGuess(event.target.value)}
              disabled={phase === "reveal"}
              placeholder="Titre du morceau"
              className="w-full rounded-md border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-3 text-sm text-white outline-none focus:border-[#343434]"
            />
            <div className="flex gap-3">
              <input
                value={guess}
                onChange={event => setGuess(event.target.value)}
                disabled={phase === "reveal"}
                placeholder="Artiste"
                className="w-full rounded-md border border-[#1f1f1f] bg-[#0f0f0f] px-3 py-3 text-sm text-white outline-none focus:border-[#343434]"
              />
              <button
                type="submit"
                disabled={phase === "reveal"}
                className="min-w-[110px] rounded-lg bg-gradient-to-r from-[#b155f0] to-[#f24f90] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(178,82,217,0.35)] disabled:opacity-60"
              >
                Valider
              </button>
            </div>
          </form>

          <div className="mt-5 flex justify-center gap-3">
            <button className="circle-btn" onClick={() => setPhase("listening")}>⟳</button>
            <button className="circle-btn play" onClick={handleManualPlay}>{manualPlayRequired ? "▶" : "▶"}</button>
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
                transition: transform .2s ease, box-shadow .2s ease;
              }
              .circle-btn.play {
                width: 64px;
                height: 64px;
                background: linear-gradient(135deg, #b155f0 0%, #f24f90 100%);
                border: none;
                box-shadow: 0 10px 30px rgba(200,90,200,0.35);
                font-size: 20px;
              }
              .circle-btn:hover { transform: translateY(-1px); }
            `}</style>
            <button className="circle-btn" onClick={() => alert("Volume")}>🔊</button>
          </div>
          <div className="mt-3 text-center text-sm text-[#8a8a8a]">
            <button onClick={handleSkipQuestion}>Passer cette question →</button>
          </div>
        </div>
      </div>

      <aside className="hidden h-full border-l border-[#1b1b1b] bg-black px-4 py-5 lg:block">
        <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[#9b9b9b]">Historique</div>
        <div className="flex flex-col gap-2">
          {history.map(item => (
            <div
              key={item.round}
              className={`rounded-lg border px-3 py-3 ${
                item.state === "correct"
                  ? "border-[#246b38] bg-[rgba(46,204,112,0.1)]"
                  : item.state === "wrong"
                    ? "border-[#813131] bg-[rgba(195,66,66,0.14)]"
                    : item.state === "current"
                      ? "border-[#2f2f2f] bg-[#161616]"
                      : "border-[#1f1f1f] bg-[#0f0f0f]"
              }`}
            >
              <div className="mb-1 flex items-center justify-between text-[12px] text-[#9b9b9b]">
                <span>Manche {item.round}</span>
                {item.state === "correct" ? (
                  <span className="rounded-full border border-[#2e8d55] bg-[rgba(46,204,112,0.14)] px-2 py-[2px] text-[11px] text-[#67e08f]">✔ Correct</span>
                ) : item.state === "wrong" ? (
                  <span className="rounded-full border border-[#7f3030] bg-[rgba(195,66,66,0.12)] px-2 py-[2px] text-[11px] text-[#f19595]">✕ Incorrect</span>
                ) : item.state === "current" ? (
                  <span className="rounded-full border border-[#2a2a2a] bg-[#1d1d1d] px-2 py-[2px] text-[11px] text-[#c9c9c9]">En cours…</span>
                ) : (
                  <span className="rounded-full border border-[#2a2a2a] bg-[#1d1d1d] px-2 py-[2px] text-[11px] text-[#c9c9c9]">À venir</span>
                )}
              </div>
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="text-xs text-[#b5b5b5]">{item.artist}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

function evaluateGuess(guess: string, track: SoloTrack): Verdict {
  const normalizedGuess = normalize(guess)
  if (!normalizedGuess) return "wrong"

  const guessWords = normalizedGuess.split(" ").filter(Boolean)
  if (guessWords.length === 0) return "wrong"

  const titleWords = new Set(normalize(track.title).split(" ").filter(Boolean))
  const artistWords = new Set(normalize(track.artist).split(" ").filter(Boolean))

  let matches = 0
  for (const word of guessWords) {
    if (titleWords.has(word) || artistWords.has(word)) {
      matches += 1
    }
  }

  if (matches === guessWords.length && matches > 0) {
    return "correct"
  }
  if (matches >= Math.max(1, Math.ceil(guessWords.length / 2))) {
    return "close"
  }
  return "wrong"
}
