"use client"

import { useMemo, useState } from "react"
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

  function handleNext() {
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
