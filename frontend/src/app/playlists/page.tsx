"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

type Playlist = {
  title: string
  count: string
  emoji: string
}

const quickOptions = [
  { title: "Titres likés", description: "387 morceaux · Tous vos favoris", icon: "❤️" },
  { title: "Mix aléatoire", description: "20 morceaux · De toute votre bibliothèque", icon: "🎲" },
]

const recommended: Playlist[] = [
  { title: "Discover Weekly", count: "30 morceaux", emoji: "🎵" },
  { title: "Release Radar", count: "45 morceaux", emoji: "⚡" },
  { title: "Daily Mix 1", count: "50 morceaux", emoji: "🌟" },
  { title: "Repeat Rewind", count: "100 morceaux", emoji: "🔁" },
]

const userPlaylists: Playlist[] = [
  { title: "Top 2024", count: "142 morceaux", emoji: "🎸" },
  { title: "Workout Mix", count: "87 morceaux", emoji: "💪" },
  { title: "Chill Vibes", count: "234 morceaux", emoji: "🌙" },
  { title: "Road Trip", count: "156 morceaux", emoji: "🚗" },
  { title: "Summer Hits", count: "203 morceaux", emoji: "☀️" },
  { title: "Party Time", count: "178 morceaux", emoji: "🎉" },
  { title: "Focus Flow", count: "95 morceaux", emoji: "🎧" },
  { title: "Throwback Classics", count: "267 morceaux", emoji: "📻" },
]

export default function PlaylistSelectionPage() {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()

  const filteredRecommended = useMemo(() => {
    if (!normalizedQuery) return recommended
    return recommended.filter(playlist => playlist.title.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery])

  const filteredUserPlaylists = useMemo(() => {
    if (!normalizedQuery) return userPlaylists
    return userPlaylists.filter(playlist => playlist.title.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery])

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white">
      <div className="ma-container pb-16 pt-10">
        <div className="flex flex-col gap-6 border-b border-[var(--ma-border)] pb-10 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <Link
              href="/modes"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
            >
              ← Retour
            </Link>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Choisir une playlist</h1>
              <p className="text-[15px] text-[var(--ma-muted)]">Sélectionnez une playlist pour commencer</p>
            </div>
          </div>
          <div className="w-full max-w-md">
            <label className="sr-only" htmlFor="playlist-search">
              Rechercher une playlist
            </label>
            <input
              id="playlist-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Rechercher une playlist..."
              className="w-full rounded-lg border border-[var(--ma-border-strong)] bg-[#0f0f0f] px-4 py-3 text-sm text-white placeholder:text-[#606060] outline-none transition focus:border-[rgba(168,85,247,0.5)]"
            />
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {quickOptions.map(option => (
            <div
              key={option.title}
              className="group relative overflow-hidden rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(168,85,247,0.25)]"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(168,85,247,0.12),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(236,72,153,0.12),transparent_45%)] opacity-80" />
              <div className="relative z-10 flex items-center gap-5">
                <div className="text-5xl">{option.icon}</div>
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold">{option.title}</h3>
                  <p className="text-sm text-[var(--ma-muted)]">{option.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <section className="ma-section">
          <div className="mb-6 flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Recommandés pour vous</h2>
            <span className="rounded-full bg-[rgba(168,85,247,0.16)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.4px] text-[#a855f7]">
              Nouveauté
            </span>
          </div>
          <PlaylistGrid playlists={filteredRecommended} emptyLabel="Aucune recommandation trouvée" />
        </section>

        <section className="ma-section">
          <h2 className="mb-6 text-2xl font-semibold tracking-[-0.02em]">Vos playlists</h2>
          <PlaylistGrid playlists={filteredUserPlaylists} emptyLabel="Aucune playlist ne correspond à votre recherche" />
        </section>
      </div>
    </div>
  )
}

function PlaylistGrid({ playlists, emptyLabel }: { playlists: Playlist[]; emptyLabel: string }) {
  if (playlists.length === 0) {
    return <p className="text-sm text-[var(--ma-muted)]">{emptyLabel}</p>
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {playlists.map(playlist => (
        <div
          key={playlist.title}
          className="group relative cursor-pointer overflow-hidden rounded-xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-4 transition duration-200 hover:-translate-y-1 hover:border-[rgba(168,85,247,0.3)] hover:shadow-[0_12px_32px_rgba(168,85,247,0.15)]"
        >
          <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-lg bg-[var(--ma-gradient)] text-5xl">
            <div className="grid h-full w-full place-items-center">{playlist.emoji}</div>
            <div className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-semibold text-[var(--ma-bg)] shadow-lg">
                ▶
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{playlist.title}</h3>
            <div className="flex items-center gap-2 text-xs text-[var(--ma-muted)]">
              <span>🎵</span>
              <span>{playlist.count}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
