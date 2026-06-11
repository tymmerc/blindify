"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { GameHistoryEntry } from "@/lib/types"
import { BottomNav } from "@/components/BottomNav"

function formatDateFr(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function modeBadgeLabel(mode: string): string {
  if (mode === "solo") return "Solo"
  return "Multi"
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-28 rounded bg-[rgba(46,32,20,.12)]" />
        <div className="h-5 w-14 rounded-full bg-[rgba(46,32,20,.12)]" />
      </div>
      <div className="flex gap-4 mb-3">
        <div className="h-4 w-16 rounded bg-[rgba(46,32,20,.12)]" />
        <div className="h-4 w-20 rounded bg-[rgba(46,32,20,.12)]" />
        <div className="h-4 w-24 rounded bg-[rgba(46,32,20,.12)]" />
      </div>
      <div className="flex gap-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-8 rounded-md border-2 border-[#ece1c8] bg-[rgba(46,32,20,.12)]"
            style={{ marginLeft: i > 0 ? "-8px" : 0 }}
          />
        ))}
      </div>
    </div>
  )
}

function TrackThumbnails({ tracks }: { tracks: GameHistoryEntry["tracks"] }) {
  const maxVisible = 5
  const visible = tracks.slice(0, maxVisible)
  const remaining = tracks.length - maxVisible

  if (visible.length === 0) return null

  return (
    <div className="flex items-center">
      {visible.map((track, i) => (
        <div
          key={`${track.title}-${track.artist}-${i}`}
          className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border-2 border-[#2e2014]"
          style={{ marginLeft: i > 0 ? "-8px" : 0, zIndex: maxVisible - i }}
        >
          {track.album_cover ? (
            <Image
              src={track.album_cover}
              alt={track.title}
              fill
              sizes="32px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#efe5d0] text-[10px] text-[#8a7558]">
              ?
            </div>
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-[#2e2014] bg-[#e0a32e] text-[10px] font-bold text-[#2e2014]"
          style={{ marginLeft: "-8px", zIndex: 0 }}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}

function TrackList({ tracks }: { tracks: GameHistoryEntry["tracks"] }) {
  if (tracks.length === 0) {
    return <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">Aucun titre enregistre.</p>
  }

  return (
    <div className="mt-3 space-y-1.5 border-t-2 border-dotted border-[rgba(46,32,20,.45)] pt-3">
      {tracks.map((track, i) => (
        <div key={`${track.title}-${track.artist}-${i}`} className="flex items-center gap-2.5">
          <span className="w-6 shrink-0 text-[10px] font-bold text-[#8a7558]">A{i + 1}</span>
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border-[1.5px] border-[rgba(46,32,20,.35)]">
            {track.album_cover ? (
              <Image
                src={track.album_cover}
                alt={track.title}
                fill
                sizes="32px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#efe5d0] text-[10px] text-[#8a7558]">
                ?
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold text-[#2e2014]">{track.title}</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a7558]">{track.artist}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function GameCard({ game }: { game: GameHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)
  const accent = game.mode === "solo" ? "#a8b8c8" : "#c65133"

  return (
    <button
      type="button"
      onClick={() => setExpanded(prev => !prev)}
      className="w-full rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 text-left shadow-[4px_4px_0_rgba(46,32,20,.18)] transition-all hover:-translate-y-0.5"
      style={{ borderLeft: `6px solid ${accent}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a7558]">{formatDateFr(game.createdAt)}</p>
        <span
          className="rounded-full border-[1.5px] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{
            background: accent,
            borderColor: "#2e2014",
            color: game.mode === "solo" ? "#2e2014" : "#f4ecdb",
          }}
        >
          {modeBadgeLabel(game.mode)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-3 text-sm">
        <span className="font-display text-2xl font-bold text-[#2e2014]">
          {game.score} <span className="font-sans text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">pts</span>
        </span>
        <span className="text-sm font-semibold text-[#6b573f]">
          {game.correct}/{game.totalRounds} <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">correct</span>
        </span>
        {game.bestStreak > 0 && (
          <span className="text-sm font-semibold text-[#6b573f]">
            {game.bestStreak} <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">serie max</span>
          </span>
        )}
      </div>

      <TrackThumbnails tracks={game.tracks} />

      {expanded && <TrackList tracks={game.tracks} />}

      <p className="mt-2 text-center font-display text-xs italic text-[#8a7558]">
        {expanded ? "— replier la pochette" : "— sortir le disque"}
      </p>
    </button>
  )
}

export default function HistoryPage() {
  const router = useRouter()
  const [games, setGames] = useState<GameHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const me = await api.checkAuth()
      if (!me) {
        router.replace("/auth/login")
        return
      }
      const result = await api.gameHistoryDetailed()
      setGames(result?.games ?? [])
    } catch (err) {
      console.error("history_load_failed", err)
      setError(err instanceof Error ? err.message : "Impossible de charger l'historique.")
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  if (loading) {
    return (
      <div className="min-h-screen text-[#2e2014] pb-24">
        <div className="mx-auto max-w-3xl px-5 pt-10">
          <div className="mb-6 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Face B · Archives</p>
            <h1 className="font-display text-3xl font-semibold">Historique</h1>
          </div>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
        <BottomNav active="history" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen text-[#2e2014] pb-24">
        <div className="mx-auto max-w-3xl px-5 pt-10">
          <h1 className="mb-6 font-display text-3xl font-semibold">Historique</h1>
          <div className="rounded-md border-2 border-[#9c2f1d] bg-[#ece1c8] p-6 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            <p className="mb-2 font-display text-base font-semibold text-[#9c2f1d]">Erreur</p>
            <p className="mb-4 text-sm text-[#6b573f]">{error}</p>
            <button
              type="button"
              onClick={loadHistory}
              className="btn-neon text-sm"
            >
              Reessayer
            </button>
          </div>
        </div>
        <BottomNav active="history" />
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="min-h-screen text-[#2e2014] pb-24">
        <div className="grid min-h-[70vh] place-items-center">
          <div className="text-center space-y-4 px-6">
            <div
              className="relative mx-auto h-16 w-16 rounded-full border-2 border-[#2e2014]"
              style={{ background: "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2px, #38291a 2px 4px)" }}
            >
              <span className="absolute inset-[32%] grid place-items-center rounded-full border-2 border-[#2e2014] bg-[#c65133] font-display text-xs font-bold text-[#f4ecdb]">
                0
              </span>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Etagere vide</p>
            <h1 className="font-display text-2xl font-semibold text-[#2e2014]">Aucune partie jouee</h1>
            <p className="max-w-sm text-sm text-[#6b573f]">
              Lance ta premiere partie pour voir ton historique ici.
            </p>
            <Link
              href="/solo"
              className="btn-neon inline-flex text-sm"
            >
              Jouer en solo
            </Link>
          </div>
        </div>
        <BottomNav active="history" />
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#2e2014] pb-24">
      <div className="mx-auto max-w-3xl px-5 pt-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Face B · Archives</p>
            <h1 className="font-display text-3xl font-semibold">
              Histo<em className="font-medium italic text-[#c65133]">rique</em>
            </h1>
          </div>
          <Link
            href="/modes"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour
          </Link>
        </div>

        <div className="space-y-4">
          {games.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </div>
      <BottomNav active="history" />
    </div>
  )
}
