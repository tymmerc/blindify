"use client"

import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { clientApi } from "@/lib/apiClient"
import type { SoloTrack, UserSummary } from "@/lib/types"

interface SoloGameClientProps {
  user: UserSummary
  tracks: SoloTrack[]
}

export function SoloGameClient({ user, tracks }: SoloGameClientProps) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [liking, setLiking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const current = useMemo(() => tracks[index], [tracks, index])
  const total = tracks.length
  const positionLabel = `${index + 1} / ${total}`

  useEffect(() => {
    if (!current) return

    if (!current.preview_url) {
      audioRef.current?.pause()
      audioRef.current = null
      return
    }

    const audio = new Audio(current.preview_url)
    audioRef.current?.pause()
    audioRef.current = audio
    audio.play().catch(() => undefined)

    return () => {
      audio.pause()
    }
  }, [current])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const handleReveal = () => {
    setRevealed(true)
    setError(null)
  }

  const handleNext = () => {
    audioRef.current?.pause()
    audioRef.current = null

    if (index + 1 >= total) {
      router.replace("/menu")
      router.refresh()
      return
    }

    setIndex(prev => prev + 1)
    setRevealed(false)
    setError(null)
  }

  const handleLike = async () => {
    if (!current) return

    try {
      setLiking(true)
      await clientApi.addLike(current.spotify_track_id)
      setError(null)
    } catch (err) {
      console.error("like_failed", err)
      setError("Impossible d'ajouter ce titre pour le moment.")
    } finally {
      setLiking(false)
    }
  }

  if (!current) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg font-medium">Aucun titre disponible.</p>
        <button
          type="button"
          onClick={() => router.replace("/menu")}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Retour au menu
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>Connecté en tant que {user.username || user.spotify_id}</span>
        <span>Progrès : {positionLabel}</span>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {current.album_cover ? (
          <div className="relative h-72 w-full">
            <Image
              src={current.album_cover}
              alt={`${current.title} cover`}
              fill
              sizes="512px"
              className={`object-cover transition duration-300 ${revealed ? "opacity-100" : "opacity-40"}`}
            />
          </div>
        ) : (
          <div className="flex h-72 items-center justify-center bg-muted text-muted-foreground">
            Aucun visuel disponible
          </div>
        )}

        <div className="space-y-3 p-6">
          {revealed ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold">{current.title}</p>
              <p className="text-sm text-muted-foreground">{current.artist}</p>
            </div>
          ) : (
            <p className="text-base text-muted-foreground">
              Écoute l'extrait et devine le titre…
            </p>
          )}

          {current.preview_url ? (
            <p className="text-xs text-muted-foreground">Extrait de 30 secondes fourni par Spotify.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Pas d'extrait audio pour ce morceau.</p>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!revealed ? (
          <button
            type="button"
            onClick={handleReveal}
            className="flex-1 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Révéler le morceau
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleLike}
              disabled={liking}
              className="flex-1 rounded-md border border-border px-4 py-2 font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
            >
              {liking ? "Ajout…" : "Like"}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Suivant
            </button>
          </>
        )}
      </div>
    </div>
  )
}
