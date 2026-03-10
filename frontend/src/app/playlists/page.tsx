"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"

type Playlist = {
  id: string
  title: string
  count: string
  emoji: string
  cover?: string | null
  owner?: string | null
}

export default function PlaylistSelectionPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasSpotify, setHasSpotify] = useState<boolean | null>(null)
  const normalizedQuery = query.trim().toLowerCase()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const token = await api.getSpotifyToken()
        if (cancelled) return
        setHasSpotify(true)
        const resp = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        })
        if (!resp.ok) {
          throw new Error(`Spotify API error ${resp.status}`)
        }
        const data = (await resp.json()) as {
          items?: Array<{
            id?: string
            name?: string
            tracks?: { total?: number }
            images?: { url?: string }[]
            owner?: { display_name?: string }
          }>
        }
        if (cancelled) return
        const mapped =
          data.items
            ?.filter(pl => pl.id && pl.name)
            .map(pl => ({
              id: pl.id as string,
              title: pl.name as string,
              count: `${pl.tracks?.total ?? 0} morceaux`,
              emoji: "🎵",
              cover: pl.images?.[0]?.url ?? null,
              owner: pl.owner?.display_name ?? null,
            })) ?? []
        setSpotifyPlaylists(mapped)
      } catch (err) {
        console.error("load_spotify_playlists_failed", err)
        if (!cancelled) {
          setHasSpotify(false)
          setError(null)
          setSpotifyPlaylists([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (hasSpotify === false) {
      router.replace("/import")
    }
  }, [hasSpotify, router])

  const quickOptions = [
    { title: "Titres likés", description: "Vos favoris", icon: "❤️", href: "/solo?source=liked&count=10" },
    { title: "Mix aléatoire", description: "Bibliothèque complète", icon: "🎲", href: "/solo?source=library&count=10" },
    { title: "Top semaine", description: "20 plus écoutés (7j)", icon: "📈", href: "/solo?source=top_week&count=20" },
    { title: "Top mois", description: "20 plus écoutés (30j)", icon: "📊", href: "/solo?source=top_month&count=20" },
  ]

  const filteredPlaylists = useMemo(() => {
    if (!normalizedQuery) return spotifyPlaylists
    return spotifyPlaylists.filter(playlist => playlist.title.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery, spotifyPlaylists])

  if (hasSpotify === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--ma-bg)] text-sm text-white/70">
        Redirection...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white">
      <div className="ma-container pb-16 pt-10">
        <div className="flex flex-col gap-6 border-b border-[var(--ma-border)] pb-10 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <Link
              href="/modes"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
            >
              &larr; Retour
            </Link>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Choisir une playlist</h1>
              <p className="text-[15px] text-[var(--ma-muted)]">Sélectionnez une playlist pour commencer</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/import"
              className="rounded-lg border border-purple-500/30 px-4 py-2 text-sm font-medium text-purple-400 transition hover:bg-purple-500/10"
            >
              Importer via lien
            </Link>
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
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {quickOptions.map(option => (
            <Link
              key={option.title}
              href={option.href}
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
            </Link>
          ))}
        </div>

        <section className="ma-section">
          <h2 className="mb-6 text-2xl font-semibold tracking-[-0.02em]">Vos playlists Spotify</h2>
          {error ? <p className="text-sm text-red-400 mb-2">{error}</p> : null}
          {loading ? <p className="text-sm text-[var(--ma-muted)]">Chargement...</p> : null}
          <PlaylistGrid playlists={filteredPlaylists} emptyLabel="Aucune playlist ne correspond à votre recherche" />
        </section>
      </div>
    </div>
  )
}

function PlaylistGrid({ playlists, emptyLabel }: { playlists: { id: string; title: string; count: string; emoji: string; cover?: string | null }[]; emptyLabel: string }) {
  if (playlists.length === 0) {
    return <p className="text-sm text-[var(--ma-muted)]">{emptyLabel}</p>
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {playlists.map(playlist => (
        <Link
          key={playlist.id}
          href={`/solo?source=playlist&playlistId=${encodeURIComponent(playlist.id)}`}
          className="group relative block cursor-pointer overflow-hidden rounded-xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-4 transition duration-200 hover:-translate-y-1 hover:border-[rgba(168,85,247,0.3)] hover:shadow-[0_12px_32px_rgba(168,85,247,0.15)]"
          aria-label={`Lancer un blindtest sur ${playlist.title}`}
        >
          <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-lg bg-[var(--ma-gradient)] text-5xl">
            {playlist.cover ? (
              <div
                className="pointer-events-none absolute inset-0 scale-105 blur-sm"
                style={{ backgroundImage: `url(${playlist.cover})`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            ) : null}
            <div className="relative grid h-full w-full place-items-center">{playlist.emoji}</div>
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100">
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
        </Link>
      ))}
    </div>
  )
}
