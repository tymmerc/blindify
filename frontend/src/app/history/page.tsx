"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { GameHistoryEntry } from "@/lib/types"
import { BottomNav } from "@/components/BottomNav"

function CornerFrame({ color }: { color: string }) {
  return (
    <>
      <span aria-hidden className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2" style={{ borderColor: color }} />
    </>
  )
}

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
    <div className="rounded-2xl border border-[#ff2ec8]/15 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-28 rounded bg-[#ff2ec8]/10" />
        <div className="h-5 w-14 rounded-full bg-[#00f7ff]/10" />
      </div>
      <div className="flex gap-4 mb-3">
        <div className="h-4 w-16 rounded bg-[#ff2ec8]/10" />
        <div className="h-4 w-20 rounded bg-[#ff2ec8]/10" />
        <div className="h-4 w-24 rounded bg-[#ff2ec8]/10" />
      </div>
      <div className="flex gap-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-8 rounded-md bg-[#ff2ec8]/10 border-2 border-[#0a0014]"
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
          className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border-2 border-[#0a0014]"
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
            <div className="flex h-full w-full items-center justify-center bg-[#ff2ec8]/10 text-[10px] text-[#9b7fb8]">
              ?
            </div>
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-[#0a0014] bg-[#00f7ff]/10 font-mono text-[10px] font-semibold text-[#00f7ff]"
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
    return <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]/60">Aucun titre enregistre.</p>
  }

  return (
    <div className="mt-3 space-y-1.5 border-t border-[#ff2ec8]/10 pt-3">
      {tracks.map((track, i) => (
        <div key={`${track.title}-${track.artist}-${i}`} className="flex items-center gap-2.5">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md">
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
              <div className="flex h-full w-full items-center justify-center bg-[#ff2ec8]/10 text-[10px] text-[#9b7fb8]">
                ?
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#f8f0ff]">{track.title}</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[#9b7fb8]">{track.artist}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function GameCard({ game }: { game: GameHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)
  const accent = game.mode === "solo" ? "#ff2ec8" : "#00f7ff"

  return (
    <button
      type="button"
      onClick={() => setExpanded(prev => !prev)}
      className="relative w-full rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-5 text-left transition-all hover:-translate-y-0.5"
      style={{
        borderColor: `${accent}55`,
        boxShadow: `0 0 14px ${accent}1a, inset 0 0 8px ${accent}0a`,
      }}
    >
      <CornerFrame color={accent} />
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#9b7fb8]">{formatDateFr(game.createdAt)}</p>
        <span
          className="rounded-sm border px-2.5 py-0.5 font-display text-[10px] uppercase tracking-[0.15em]"
          style={{
            background: `${accent}14`,
            borderColor: `${accent}66`,
            color: accent,
            textShadow: `0 0 6px ${accent}99`,
          }}
        >
          {modeBadgeLabel(game.mode)}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-sm">
        <span className="font-display text-lg" style={{ color: "#ffea00", textShadow: "0 0 8px rgba(255,234,0,0.6)" }}>
          {game.score} <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">pts</span>
        </span>
        <span className="font-mono text-sm text-[#f8f0ff]/80">
          {game.correct}/{game.totalRounds} <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">correct</span>
        </span>
        {game.bestStreak > 0 && (
          <span className="font-mono text-sm text-[#f8f0ff]/80">
            {game.bestStreak} <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">serie max</span>
          </span>
        )}
      </div>

      <TrackThumbnails tracks={game.tracks} />

      {expanded && <TrackList tracks={game.tracks} />}

      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[#9b7fb8]/50 text-center">
        {expanded ? "Click to collapse" : "Click to expand"}
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
      <div className="min-h-screen text-[#f8f0ff] pb-24">
        <div className="mx-auto max-w-3xl px-5 pt-10">
          <div className="mb-6 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">[ Replay log ]</p>
            <h1 className="font-display text-3xl uppercase tracking-[0.04em] text-glow-pink">Historique</h1>
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
      <div className="min-h-screen text-[#f8f0ff] pb-24">
        <div className="mx-auto max-w-3xl px-5 pt-10">
          <h1 className="mb-6 font-display text-3xl uppercase tracking-[0.04em] text-glow-pink">Historique</h1>
          <div className="relative rounded-2xl border border-[#ff3868]/40 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6 text-center" style={{ boxShadow: "0 0 16px rgba(255,56,104,0.18)" }}>
            <CornerFrame color="#ff3868" />
            <p className="font-display text-base uppercase tracking-[0.04em] text-[#ff3868] mb-2" style={{ textShadow: "0 0 10px rgba(255,56,104,0.6)" }}>Error</p>
            <p className="text-sm text-[#9b7fb8] mb-4">{error}</p>
            <button
              type="button"
              onClick={loadHistory}
              className="btn-neon-pink font-display text-sm"
            >
              Retry
            </button>
          </div>
        </div>
        <BottomNav active="history" />
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="min-h-screen text-[#f8f0ff] pb-24">
        <div className="grid min-h-[70vh] place-items-center">
          <div className="text-center space-y-4 px-6">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#ff2ec8]/40 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px]" style={{ boxShadow: "0 0 18px rgba(255,46,200,0.3)" }}>
              <span className="font-display text-xl text-[#ff2ec8]" style={{ textShadow: "0 0 10px rgba(255,46,200,0.7)" }}>0</span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff]">[ No data ]</p>
            <h1 className="font-display text-2xl uppercase tracking-[0.04em] text-[#f8f0ff]">Aucune partie jouee</h1>
            <p className="text-sm text-[#9b7fb8] max-w-sm">
              Lance ta premiere partie pour voir ton historique ici.
            </p>
            <Link
              href="/solo"
              className="btn-neon-pink font-display text-sm inline-flex"
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
    <div className="min-h-screen text-[#f8f0ff] pb-24">
      <div className="mx-auto max-w-3xl px-5 pt-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">[ Replay log ]</p>
            <h1 className="font-display text-3xl uppercase tracking-[0.04em] text-glow-pink">Historique</h1>
          </div>
          <Link
            href="/modes"
            className="inline-flex items-center gap-2 rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff] transition hover:bg-[#00f7ff]/10 hover:shadow-glow-cyan"
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
