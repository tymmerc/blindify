"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { UserSummary } from "@/lib/types"

type Playlist = {
  id: string
  title: string
  count: number
  emoji?: string
  cover?: string | null
  owner?: string | null
}

const fallbackPlaylists: Playlist[] = [
  { title: "Top 2024", count: 142, emoji: "🎸", id: "top-2024" },
  { title: "Workout Mix", count: 87, emoji: "💪", id: "workout-mix" },
  { title: "Chill Vibes", count: 234, emoji: "🌙", id: "chill-vibes" },
  { title: "Road Trip", count: 156, emoji: "🚗", id: "road-trip" },
]

const activity = [
  { title: "Top 2024", time: "Aujourd'hui à 14:32", score: "18/20" },
  { title: "Workout Mix", time: "Hier à 19:15", score: "15/20" },
  { title: "Chill Vibes", time: "Il y a 2 jours", score: "20/20" },
]

export default function MenuPage() {
  const router = useRouter()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [stats, setStats] = useState([
    { label: "Parties", value: "—" },
    { label: "Précision", value: "—" },
    { label: "Points", value: "—" },
    { label: "Niveau", value: "—" },
  ])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (!me) {
          router.replace("/auth/login")
          return
        }
        setUserPayload(me)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [router])

  useEffect(() => {
    if (!userPayload?.user) return
    if (userPayload.user.provider !== "spotify") {
      setPlaylists(fallbackPlaylists)
      return
    }

    let cancelled = false
    async function loadPlaylists() {
      setLoadingPlaylists(true)
      setPlaylistError(null)
      try {
        const token = await api.getSpotifyToken()
        const response = await fetch("https://api.spotify.com/v1/me/playlists?limit=12", {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        })
        if (!response.ok) {
          throw new Error(`Spotify API error ${response.status}`)
        }
        const payload = (await response.json()) as {
          items: Array<{
            id: string
            name: string
            tracks: { total: number }
            images?: Array<{ url: string }>
            owner?: { display_name?: string }
          }>
        }
        if (cancelled) return
        const mapped: Playlist[] =
          payload.items?.map(item => ({
            id: item.id,
            title: item.name,
            count: item.tracks?.total ?? 0,
            cover: item.images?.[0]?.url ?? null,
            owner: item.owner?.display_name ?? null,
          })) ?? []
        setPlaylists(mapped.length > 0 ? mapped : fallbackPlaylists)
      } catch (err) {
        console.error("spotify_playlists_failed", err)
        if (!cancelled) {
          setPlaylistError("Impossible de récupérer vos playlists Spotify.")
          setPlaylists(fallbackPlaylists)
        }
      } finally {
        if (!cancelled) setLoadingPlaylists(false)
      }
    }

    loadPlaylists()
    return () => {
      cancelled = true
    }
  }, [userPayload])

  useEffect(() => {
    let cancelled = false
    async function loadStats() {
      try {
        const res = await api.detailedStats()
        if (cancelled) return
        const level = Math.max(1, Math.floor((res.stats.totalXp ?? 0) / 100) + 1)
        setStats([
          { label: "Parties", value: String(res.stats.totalGames ?? 0) },
          { label: "Précision", value: `${Math.round(res.stats.accuracyRate ?? 0)}%` },
          { label: "Points", value: String(res.stats.totalXp ?? 0) },
          { label: "Niveau", value: String(level) },
        ])
      } catch (err) {
        console.error("load_stats_failed", err)
      }
    }
    loadStats()
    return () => {
      cancelled = true
    }
  }, [])

  const user: UserSummary | null = userPayload?.user ?? null
  const isSpotifyUser = user?.provider === "spotify"
  const initials = useMemo(() => {
    if (!user?.username) return "?"
    return user.username
      .split(" ")
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  }, [user])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">
        Chargement
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-28">
      <div className="ma-container">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--ma-border)] bg-[#0b0b0f] px-6 py-8 shadow-[0_25px_70px_rgba(0,0,0,0.4)]">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[rgba(168,85,247,0.15)] blur-3xl" />
          <div className="absolute -right-10 top-0 h-48 w-48 rounded-full bg-[rgba(34,197,94,0.12)] blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ma-gradient)] text-lg font-semibold shadow-[0_10px_30px_rgba(168,85,247,0.35)]">
                {initials}
              </div>
              <div className="greeting">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Bienvenue</p>
                <h1 className="text-2xl font-semibold tracking-[-0.02em]">Bonjour, {user?.username ?? "Joueur"}</h1>
                <p className="text-sm text-[var(--ma-muted)]">Prêt pour une nouvelle session ?</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">
              <Link
                href="/modes"
                className="rounded-xl border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/5"
              >
                Choisir un mode
              </Link>
            </div>
          </div>

          <div className="ma-stat-grid mt-8">
            {stats.map(item => (
              <div key={item.label} className="ma-stat-card shadow-[0_10px_30px_rgba(0,0,0,0.35)] text-center">
                <div className="ma-stat-label">{item.label}</div>
                <div className="ma-stat-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="my-10 overflow-hidden rounded-3xl bg-[var(--ma-gradient)] px-6 py-10 shadow-[0_30px_80px_rgba(168,85,247,0.3)] lg:px-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-white/80">Mode express</p>
              <h2 className="text-3xl font-bold leading-tight">Partie rapide</h2>
              <p className="text-white/85">20 morceaux aléatoires de votre bibliothèque</p>
            </div>
            <Link
              href="/solo?source=liked&count=10"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/95 px-6 py-3 text-sm font-semibold text-[#a855f7] shadow-[0_12px_32px_rgba(0,0,0,0.25)] transition hover:scale-[1.02]"
            >
              Jouer maintenant
            </Link>
          </div>
        </div>

        <section className="ma-section">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Vos playlists</h2>
              <p className="text-sm text-[var(--ma-muted)]">
                {isSpotifyUser
                  ? playlistError ?? "Synchronisées depuis votre bibliothèque Spotify"
                  : "Connectez Spotify pour charger vos playlists"}
              </p>
            </div>
            <Link href="/playlists" className="text-sm font-semibold text-white underline-offset-4 hover:underline">
              Voir tout
            </Link>
          </div>
          {!isSpotifyUser ? (
            <div className="ma-card flex flex-col items-start gap-3 border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.08)] md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-base font-semibold">Connectez votre compte Spotify</p>
                <p className="text-sm text-[var(--ma-muted)]">
                  Récupérez vos playlists et lancez des parties personnalisées.
                </p>
              </div>
              <Link
                href="/auth/login"
                className="ma-btn-primary px-4 py-3 text-sm font-semibold shadow-[0_12px_32px_rgba(168,85,247,0.3)]"
              >
                Se connecter à Spotify
              </Link>
            </div>
          ) : null}
          <PlaylistGrid playlists={playlists} loading={loadingPlaylists} />
        </section>

        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">Activité récente</h2>
          <div className="ma-card px-0">
            {activity.map((item, index) => (
              <div
                key={item.title}
                className={`activity-item flex items-center justify-between px-6 py-5 ${
                  index < activity.length - 1 ? "border-b border-[var(--ma-border)]" : ""
                }`}
              >
                <div className="activity-info">
                  <h4 className="text-base font-semibold">{item.title}</h4>
                  <p className="text-sm text-[var(--ma-muted)]">{item.time}</p>
                </div>
                <div className="activity-score text-2xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: "var(--ma-gradient)" }}>
                  {item.score}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <nav className="ma-nav-bottom">
        <div className="ma-nav-inner">
          <Link href="/menu" className="ma-nav-item active">
            <span className="text-lg">○</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.4px]">Accueil</span>
          </Link>
          <Link href="/modes" className="ma-nav-item">
            <span className="text-lg">▶</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.4px]">Jouer</span>
          </Link>
          <Link href="/stats" className="ma-nav-item">
            <span className="text-lg">◆</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.4px]">Stats</span>
          </Link>
          <Link href="/profile" className="ma-nav-item">
            <span className="text-lg">◉</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.4px]">Profil</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}

function PlaylistGrid({ playlists, loading }: { playlists: Playlist[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="ma-card h-full animate-pulse border-[rgba(255,255,255,0.08)] bg-[#0f0f0f]"
          >
            <div className="mb-4 aspect-square w-full rounded-lg bg-white/5" />
            <div className="h-4 w-1/2 rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/3 rounded bg-white/5" />
          </div>
        ))}
      </div>
    )
  }

  if (!playlists.length) {
    return <p className="text-sm text-[var(--ma-muted)]">Aucune playlist disponible.</p>
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {playlists.map(item => (
        <div
          key={item.id}
          className="ma-card relative overflow-hidden cursor-pointer border-[rgba(255,255,255,0.08)] bg-[#0f0f0f] transition duration-200 hover:-translate-y-1 hover:border-[rgba(168,85,247,0.3)] hover:shadow-[0_12px_32px_rgba(168,85,247,0.15)]"
        >
          <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-lg bg-[var(--ma-gradient)]">
            {item.cover ? (
              <Image src={item.cover} alt={item.title} fill className="object-cover" sizes="260px" />
            ) : (
              <div className="grid h-full w-full place-items-center text-4xl">{item.emoji ?? "🎵"}</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[rgba(0,0,0,0.25)]" />
          </div>
          <div className="playlist-info space-y-1">
            <h3 className="text-base font-semibold leading-tight">{item.title}</h3>
            <p className="text-sm text-[var(--ma-muted)]">{item.count} morceaux</p>
            {item.owner ? <p className="text-xs text-[var(--ma-muted)]">Par {item.owner}</p> : null}
          </div>
        </div>
      ))}
    </div>
  )
}
