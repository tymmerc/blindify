"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { api } from "@/lib/api"
import type { SoloTrack, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowRight, Heart, ShieldCheck } from "lucide-react"

interface SoloGameClientProps {
  user: UserSummary
  tracks: SoloTrack[]
}

export function SoloGameClient({ user, tracks }: SoloGameClientProps) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [liking, setLiking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hintVisible, setHintVisible] = useState(false)
  const current = tracks[index]
  const isSpotifyTrack = current?.type === "spotify"

  const {
    play: playSpotify,
    pause: pauseSpotify,
    ready: spotifyReady,
    error: spotifyError,
  } = useSpotifyPlayback(isSpotifyTrack)

  const total = tracks.length
  const positionLabel = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`

  const albumName = useMemo(() => {
    if (!current?.metadata) return null
    const album = (current.metadata.album as string | undefined) ?? null
    return album
  }, [current])

  const releaseYear = useMemo(() => {
    if (!current?.metadata) return null
    const release = current.metadata.release_date as string | undefined
    if (!release) return null
    return release.slice(0, 4)
  }, [current])

  useEffect(() => {
    if (!current) return
    if (current.type === "spotify" && current.track_id) {
      playSpotify(current.track_id).catch(err => {
        console.error("spotify_play_failed", err)
      })
    } else {
      pauseSpotify().catch(() => undefined)
    }
    return () => {
      pauseSpotify().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.audioSourceId])

  async function handleLike() {
    if (!current || liking) return
    try {
      setLiking(true)
      await api.addLike(user.id, current.audioSourceId)
      setError(null)
    } catch (err) {
      console.error("like_failed", err)
      setError("Unable to save this track right now.")
    } finally {
      setLiking(false)
    }
  }

  function handleReveal() {
    setRevealed(true)
  }

  async function handleNext() {
    if (current?.type === "spotify") {
      await pauseSpotify()
    }
    if (index + 1 >= total) {
      window.location.href = "/menu"
      return
    }
    setIndex(prev => prev + 1)
    setRevealed(false)
    setHintVisible(false)
    setError(null)
  }

  if (!current) {
    return (
      <div className="surface flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 p-10 text-center">
        <ShieldCheck className="h-10 w-10 text-neon" />
        <p className="text-sm text-slate-300">No tracks available — try syncing another provider.</p>
        <Button variant="outline" onClick={() => (window.location.href = "/menu")}>
          Return to menu
        </Button>
      </div>
    )
  }

  return (
    <div className="surface relative flex flex-col gap-6 rounded-3xl border border-white/10 p-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Round {positionLabel}</p>
        <h2 className="text-2xl font-semibold text-white">Guess the track</h2>
        <p className="text-xs text-slate-400">
          Logged in as <span className="text-neon">{user.username || user.provider_id}</span>
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          {current.album_cover ? (
            <Image
              src={current.album_cover}
              alt={`${current.title} cover`}
              fill
              sizes="320px"
              className={`object-cover transition duration-500 ${revealed ? "opacity-100" : "opacity-60 blur-sm"}`}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <ShieldCheck className="h-10 w-10" />
              <span className="text-xs uppercase tracking-[0.4em]">No artwork</span>
            </div>
          )}
          <div className="absolute bottom-4 left-4 rounded-full border border-white/10 bg-black/60 px-4 py-1 text-xs uppercase tracking-[0.4em] text-slate-300">
            {current.type.toUpperCase()}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            {!revealed ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-300">
                  Listen on your device and enter your guess. When you&apos;re ready, reveal the answer below.
                </p>
                {isSpotifyTrack ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-slate-300">
                    {spotifyError ? (
                      <p className="text-red-400">{spotifyError}</p>
                    ) : spotifyReady ? (
                      <p>Spotify player ready. Ensure “Blindify Web Player” is selected as your active device.</p>
                    ) : (
                      <p>
                        Connecting to Spotify… Make sure you have a premium account and allow the browser to control
                        playback.
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-slate-300">
                  <p>Hints</p>
                  <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                    <li>• {current.artist.split(",")[0] ? `Artist initial: ${current.artist.split(",")[0]?.charAt(0)}…` : "Artist hidden"}</li>
                    {hintVisible ? (
                      <>
                        {albumName ? <li>• Album: {albumName}</li> : null}
                        {releaseYear ? <li>• Release: {releaseYear}</li> : null}
                      </>
                    ) : (
                      <li>
                        <button
                          type="button"
                          onClick={() => setHintVisible(true)}
                          className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.4em] text-slate-200 hover:border-white/25"
                        >
                          Reveal more hints
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.5em] text-neon">Reveal</p>
                <h3 className="text-2xl font-semibold text-white">{current.title}</h3>
                <p className="text-sm text-slate-300">{current.artist}</p>
                {albumName ? <p className="text-xs text-slate-500">Album · {albumName}</p> : null}
              </div>
            )}
          </div>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            {!revealed ? (
              <Button
                onClick={handleReveal}
                className="flex-1 justify-center gap-2"
              >
                Reveal answer
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleLike}
                  disabled={liking}
                  variant="outline"
                  className="flex-1 justify-center gap-2 text-slate-200 hover:text-white disabled:cursor-not-allowed"
                >
                  <Heart className="h-4 w-4" />
                  {liking ? "Saving..." : "Save to favourites"}
                </Button>
                <Button onClick={handleNext} className="flex-1 justify-center gap-2">
                  Next round
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
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
      setPlaybackError("Unable to refresh Spotify token. Try reconnecting your account.")
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
        setPlaybackError("Spotify authentication failed. Please reconnect your account.")
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

      await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers,
        body: JSON.stringify({ device_ids: [deviceIdRef.current], play: false }),
      }).catch(err => {
        console.error("spotify_transfer_failed", err)
      })

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
              ? "Spotify refused playback. Premium account is required."
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
