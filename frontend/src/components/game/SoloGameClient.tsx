"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { api } from "@/lib/api"
import type { SoloTrack, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/apiClient"
import { ArrowRight, Check, Flame, Heart, Sparkles, Timer, Volume2 } from "lucide-react"

type Phase = "countdown" | "listening" | "reveal"
type Verdict = "correct" | "close" | "wrong"
type FinalizeReason = "timeout" | "reveal" | "guess"

export interface SoloGameClientProps {
  user: UserSummary
  tracks: SoloTrack[]
  mode?: "solo" | "multiplayer"
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

export function SoloGameClient({
  user,
  tracks,
  mode = "solo",
  onRoundComplete,
  onGameComplete,
}: SoloGameClientProps) {
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

  const [stats, setStats] = useState<RoundStats>({
    rounds: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
  })

  const statsRef = useRef(stats)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const listeningRafRef = useRef<number | null>(null)
  const listeningDeadlineRef = useRef<number>(0)

  const current = tracks[index]
  const total = tracks.length
  const hasMoreRounds = index < total - 1
  const accuracy = stats.rounds > 0 ? Math.round((stats.correct / stats.rounds) * 100) : 0
  const isSpotifyTrack = current?.type === "spotify"

  const {
    play: playSpotify,
    pause: pauseSpotify,
    ready: spotifyReady,
    error: spotifyError,
  } = useSpotifyPlayback(isSpotifyTrack)

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  const cleanupTimers = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    if (listeningRafRef.current !== null) {
      cancelAnimationFrame(listeningRafRef.current)
      listeningRafRef.current = null
    }
  }, [])

  const finalizeRound = useCallback(
    (nextVerdict: Verdict, reason: FinalizeReason, track: SoloTrack, submittedGuess: string) => {
      if (!track) return
      if (phase === "reveal") return

      cleanupTimers()
      pauseSpotify().catch(() => undefined)

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

      if (index >= total - 1) {
        setGameFinished(true)
        onGameComplete?.(updatedStats)
      }
    },
    [cleanupTimers, pauseSpotify, phase, index, total, onRoundComplete, onGameComplete]
  )

  useEffect(() => {
    if (!current || gameFinished) return

    cleanupTimers()
    pauseSpotify().catch(() => undefined)

    setPhase("countdown")
    setCountdown(COUNTDOWN_DURATION)
    setTimer(LISTENING_DURATION)
    setGuess("")
    setVerdict(null)
    setFeedback(null)
    setError(null)

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
      pauseSpotify().catch(() => undefined)
    }
  }, [current?.audioSourceId, cleanupTimers, pauseSpotify, gameFinished])

  useEffect(() => {
    if (!current || gameFinished) return
    if (phase !== "listening") return

    cleanupTimers()
    setTimer(LISTENING_DURATION)

    let cancelled = false

    const startPlayback = async () => {
      if (current.type === "spotify") {
        if (!spotifyReady) {
          setFeedback("Waiting for Spotify player… Select the Blindify Web Player in Spotify.")
          return
        }
        try {
          await playSpotify(current.track_id)
          if (!cancelled) setFeedback(null)
        } catch (err) {
          console.error("spotify_play_failed", err)
          if (!cancelled) {
            const message =
              err instanceof Error && err.message
                ? err.message
                : "Spotify playback failed. Ensure Spotify is open and the device is set to Blindify Web Player."
            setFeedback(message)
            setError(message)
            finalizeRound("wrong", "timeout", current, guess)
            return
          }
        }
      }
      listeningDeadlineRef.current = Date.now() + LISTENING_DURATION * 1000

      const tick = () => {
        if (cancelled) return
        const remainingMs = listeningDeadlineRef.current - Date.now()
        const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
        setTimer(prev => (prev === nextSeconds ? prev : nextSeconds))
        if (remainingMs <= 0) {
          const autoVerdict = verdict ?? evaluateGuess(guess, current)
          finalizeRound(autoVerdict, "timeout", current, guess)
        } else {
          listeningRafRef.current = requestAnimationFrame(tick)
        }
      }

      listeningRafRef.current = requestAnimationFrame(tick)
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
    spotifyReady,
    playSpotify,
    cleanupTimers,
    finalizeRound,
    guess,
    verdict,
    gameFinished,
  ]);

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

  const positionLabel = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs uppercase tracking-[0.4em] text-slate-400">
          <span>{mode === "solo" ? "Solo blind test" : "Multiplayer blind test"}</span>
          <span>Round {positionLabel}</span>
          <span>
            Accuracy {accuracy}% • Streak {stats.streak} (best {stats.bestStreak})
          </span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-sm text-slate-300">
          {feedback ? feedback : "Listen carefully, type your guess, and reveal when ready."}
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="relative min-h-[280px] overflow-hidden rounded-3xl border border-white/10 bg-black/60 p-6">
          <ListeningSurface active={phase === "listening"} />
          {current.album_cover ? (
            <Image
              src={current.album_cover}
              alt={`${current.title} cover`}
              fill
              className={`object-cover transition duration-500 ${
                phase === "reveal" ? "opacity-100" : "opacity-60 blur"
              }`}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Volume2 className="h-10 w-10" />
              <span className="text-xs uppercase tracking-[0.4em]">No artwork</span>
            </div>
          )}

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {phase === "countdown" ? (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-black/60 text-4xl font-semibold text-white shadow-[0_0_35px_rgba(168,85,247,0.4)]">
                {countdown}
              </div>
            ) : phase === "listening" ? (
              <div className="flex flex-col items-center gap-3 text-white">
                <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-4 py-2 text-xs uppercase tracking-[0.4em]">
                  <Timer className="h-4 w-4 text-neon" />
                  {timer}s
                </div>
                <AudioBars />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-black/70 px-6 py-4 text-center text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.5em] text-neon">Reveal</p>
                <p className="text-lg font-semibold text-white">{current.title}</p>
                <p className="text-sm text-slate-300">{current.artist}</p>
                {albumName ? <p className="text-xs text-slate-500">Album · {albumName}</p> : null}
                {releaseYear ? <p className="text-xs text-slate-500">Released · {releaseYear}</p> : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-black/60 p-6">
          <form onSubmit={handleGuessSubmit} className="space-y-4">
            <label className="flex flex-col gap-2 text-left">
              <span className="text-xs uppercase tracking-[0.5em] text-slate-400">Your guess</span>
              <input
                value={guess}
                onChange={event => setGuess(event.target.value)}
                disabled={phase === "reveal"}
                placeholder="Artist – Track title"
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-neon focus:ring-2 focus:ring-neon/40 disabled:cursor-not-allowed"
                autoFocus
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={phase === "reveal"} className="gap-2">
                <Check className="h-4 w-4" />
                Submit guess
              </Button>
              <Button type="button" variant="outline" onClick={handleReveal} disabled={phase === "reveal"}>
                Reveal now
              </Button>
              {phase === "reveal" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLike}
                  disabled={liking}
                  className="gap-2"
                >
                  <Heart className="h-4 w-4" />
                  {liking ? "Saving…" : "Add to favourites"}
                </Button>
              ) : null}
            </div>
          </form>

          {spotifyError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {spotifyError}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          ) : null}

          {phase === "reveal" ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs text-slate-300">
              <p>
                Verdict:{" "}
                <span
                  className={
                    verdict === "correct"
                      ? "text-emerald-300"
                      : verdict === "close"
                        ? "text-amber-300"
                        : "text-red-300"
                  }
                >
                  {verdict}
                </span>
              </p>
              <p className="mt-1">Your guess: {guess || "—"}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-white/5 px-5 py-4 text-xs text-slate-300">
              Tip: include either the artist or the full track name for a perfect score.
            </div>
          )}

          <div className="mt-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-slate-400">
              <Flame className="h-4 w-4 text-neon" />
              Streak {stats.streak}
            </div>
            {phase === "reveal" && (
              <Button onClick={handleNext} className="gap-2">
                {hasMoreRounds ? "Next track" : "See results"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
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

type SpotifyPlaybackControls = {
  ready: boolean
  error: string | null
  play: (trackId: string) => Promise<void>
  pause: () => Promise<void>
}

function useSpotifyPlayback(enabled: boolean): SpotifyPlaybackControls {
  const [ready, setReady] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const activatedRef = useRef(false)

  const getLatestToken = useCallback(async () => {
    try {
      const { accessToken } = await api.getSpotifyToken()
      if (!accessToken) {
        setPlaybackError("Spotify token unavailable. Reconnect your account.")
        throw new Error("spotify_token_missing")
      }
      setPlaybackError(null)
      return accessToken
    } catch (err) {
      console.error("spotify_token_fetch_failed", err)
      if (err instanceof ApiError) {
        const message =
          err.message ||
          "Spotify authorisation failed. Please reconnect your Spotify account in settings."
        setPlaybackError(message)
      } else {
        setPlaybackError("Unable to refresh Spotify token. Try reconnecting your account.")
      }
      throw err
    }
  }, [])

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    if (!document.getElementById("spotify-web-playback")) {
      const script = document.createElement("script")
      script.id = "spotify-web-playback"
      script.src = "https://sdk.scdn.co/spotify-player.js"
      script.async = true
      document.body.appendChild(script)
    }

    const initializePlayer = () => {
      if (playerRef.current || !window.Spotify) return

      const player = new window.Spotify.Player({
        name: "Blindify Web Player",
        getOAuthToken: async cb => {
          try {
            const token = await getLatestToken()
            cb(token)
          } catch {
            cb("")
          }
        },
        volume: 0.6,
      })

      player.addListener("ready", ({ device_id }) => {
        deviceIdRef.current = device_id
        setReady(true)
        setPlaybackError(null)
      })

      player.addListener("not_ready", () => {
        deviceIdRef.current = null
        setReady(false)
      })

      player.addListener("initialization_error", ({ message }) => {
        console.error("spotify_initialization_error", message)
        setPlaybackError(message)
      })
      player.addListener("authentication_error", ({ message }) => {
        console.error("spotify_authentication_error", message)
        setPlaybackError("Spotify authentication failed. Please reconnect your Spotify account.")
      })
      player.addListener("account_error", ({ message }) => {
        console.error("spotify_account_error", message)
        setPlaybackError("Spotify account not eligible. Premium is required.")
      })
      player.addListener("playback_error", ({ message }) => {
        console.error("spotify_playback_error", message)
        setPlaybackError("Playback failed on Spotify. Check your active device.")
      })

      playerRef.current = player
      player.connect().catch(err => {
        console.error("spotify_connect_failed", err)
        setPlaybackError("Spotify player connection failed.")
      })
    }

    if (window.Spotify) {
      initializePlayer()
    } else {
      window.onSpotifyWebPlaybackSDKReady = initializePlayer
    }

    return () => {
      window.onSpotifyWebPlaybackSDKReady = undefined
      if (playerRef.current) {
        try {
          playerRef.current.disconnect()
        } catch (err) {
          console.error("spotify_disconnect_failed", err)
        }
        playerRef.current = null
      }
      deviceIdRef.current = null
      setReady(false)
    }
  }, [enabled, getLatestToken])

  const play = useCallback(
    async (trackId: string) => {
      if (!enabled || !trackId) return
      if (!deviceIdRef.current) {
        setPlaybackError("Spotify player not ready. Open Spotify and select the Blindify Web Player.")
        throw new Error("spotify_device_unavailable")
      }

      const token = await getLatestToken()
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }

      if (!activatedRef.current && playerRef.current?.activateElement) {
        try {
          await playerRef.current.activateElement()
          activatedRef.current = true
        } catch (err) {
          console.warn("spotify_activate_element_failed", err)
        }
      }

      await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceIdRef.current}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined)

      await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers,
        body: JSON.stringify({ device_ids: [deviceIdRef.current], play: false }),
      }).catch(err => {
        console.error("spotify_transfer_failed", err)
      })

      await new Promise(resolve => setTimeout(resolve, 150))

      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: 0 }),
        }
      )

      if (!response.ok && response.status !== 204) {
        const fallback =
          response.status === 404
            ? "Activate the Blindify Web Player in Spotify (devices list) and keep Spotify open."
            : response.status === 403
              ? "Spotify refused playback. A Premium account is required."
              : "Spotify playback failed. Try again."
        setPlaybackError(fallback)
        throw new Error(fallback)
      }
      setPlaybackError(null)
    },
    [enabled, getLatestToken]
  )

  const pause = useCallback(async () => {
    if (!enabled || !deviceIdRef.current) return
    try {
      const token = await getLatestToken()
      await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceIdRef.current}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (err) {
      console.error("spotify_pause_failed", err)
    }
  }, [enabled, getLatestToken])

  return {
    ready,
    error: playbackError,
    play,
    pause,
  }
}

function ListeningSurface({ active }: { active: boolean }) {
  return (
    <div
      className={`absolute inset-0 bg-gradient-to-br from-purple-600/25 via-black to-emerald-500/25 transition ${
        active ? "animate-pulse" : ""
      }`}
    />
  )
}

function AudioBars() {
  return (
    <div className="flex items-end gap-1">
      {Array.from({ length: 12 }).map((_, index) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="h-3 w-1.5 rounded-full bg-gradient-to-t from-emerald-400 via-purple-400 to-fuchsia-500"
          style={{
            animation: `equalize 1.4s ease-in-out ${index * 0.08}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes equalize {
          0%,
          100% {
            transform: scaleY(0.3);
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
