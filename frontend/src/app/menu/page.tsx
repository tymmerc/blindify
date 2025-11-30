"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { GameSessionSummary, UserSummary } from "@/lib/types"
import { fetchUserDashboard } from "@/lib/userData"
import { BottomNav } from "@/components/BottomNav"
import { Play, Users } from "lucide-react"

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

const friends = [
  { name: "Lina M.", status: "En ligne", nowPlaying: "Solo — Road Trip", accent: "purple" },
  { name: "Ethan", status: "En ligne", nowPlaying: "Multijoueur — Top 2024", accent: "pink" },
  { name: "Nora", status: "Hors ligne", nowPlaying: "Dernière partie: Chill Vibes", accent: "emerald" },
  { name: "Malik", status: "En ligne", nowPlaying: "Solo — Focus Mix", accent: "blue" },
]

type ActivityItem = {
  title: string
  time: string
  meta: string
  rounds: number
  state: string
}

const fallbackActivity = [
  { title: "Partie rapide", time: "Aujourd'hui", meta: "Solo · normal", rounds: 10, state: "Terminé" },
  { title: "Top 2024", time: "Hier", meta: "Multijoueur · hard", rounds: 12, state: "Terminé" },
]

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function stateLabel(state: string | null | undefined): string {
  if (state === "finished") return "Terminé"
  if (state === "in_progress") return "En cours"
  return state || "—"
}

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
  const [history, setHistory] = useState<GameSessionSummary[]>([])

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
    if (!userPayload) return
    let cancelled = false
    async function loadDashboard() {
      try {
        const { stats: fetchedStats, history: fetchedHistory } = await fetchUserDashboard()
        if (cancelled) return
        const level = Math.max(1, Math.floor((fetchedStats?.totalXp ?? 0) / 100) + 1)
        setStats([
          { label: "Parties", value: String(fetchedStats?.totalGames ?? 0) },
          { label: "Précision", value: `${Math.round(fetchedStats?.accuracyRate ?? 0)}%` },
          { label: "Points", value: String(fetchedStats?.totalXp ?? 0) },
          { label: "Niveau", value: String(level) },
        ])
        setHistory(fetchedHistory ?? [])
      } catch (err) {
        console.error("load_dashboard_failed", err)
      }
    }
    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [userPayload])

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
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    return hour >= 18 || hour < 6 ? "Bonsoir" : "Bonjour"
  }, [])

  const activityItems =
    history.length > 0
      ? history.slice(0, 6).map(item => ({
          title: item.mode ? item.mode.charAt(0).toUpperCase() + item.mode.slice(1) : "Partie",
          time: formatDate(item.started_at),
          meta: `${item.difficulty ?? "normal"} · ${item.source_provider ?? "—"}`,
          rounds: item.total_rounds ?? 0,
          state: stateLabel(item.state),
        }))
      : []

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">
        Chargement
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-40">
      <div className="w-full px-3 sm:px-4 lg:px-6 mx-auto max-w-none">
        <div className="grid auto-rows-min gap-5 lg:gap-7 md:grid-cols-[240px,minmax(0,1fr),240px] xl:grid-cols-[280px,minmax(0,1fr),280px] items-start">
          <div className="hidden md:block sticky top-4">
            <FriendsPanel />
          </div>

          <div className="space-y-7 max-w-[1100px] w-full mx-auto">
            <div className="grid gap-4 md:hidden">
              <FriendsPanel />
              <HistoryPanel items={activityItems.length ? activityItems : fallbackActivity} />
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-[var(--ma-border)] bg-[#0f0f0f] px-6 py-7 shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
              <div className="relative flex flex-col gap-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ma-gradient)] text-base font-semibold shadow-[0_10px_24px_rgba(168,85,247,0.35)]">
                      {initials}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Bienvenue</p>
                      <h1 className="text-xl font-semibold tracking-[-0.02em]">{greeting}, {user?.username ?? "Joueur"}</h1>
                      <p className="text-sm text-[var(--ma-muted)]">Prêt pour une nouvelle session ?</p>
                    </div>
                  </div>
                  <Link
                    href="/modes"
                    className="rounded-lg border border-[var(--ma-border)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5"
                  >
                    Choisir un mode
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  {stats.map(item => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-[var(--ma-border)] bg-[#121212] px-4 py-3 text-center shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
                    >
                      <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--ma-muted)]">{item.label}</div>
                      <div className="text-xl font-semibold">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[18px] border border-[var(--ma-border)] bg-[#0f0f0f] px-5 py-8 shadow-[0_10px_24px_rgba(0,0,0,0.25)] lg:px-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#8a8a8a]">Mode express</p>
                  <h2 className="text-3xl font-bold leading-tight">Partie rapide</h2>
                  <p className="text-[#cfcfcf]">20 morceaux aléatoires de votre bibliothèque</p>
                </div>
                <Link
                  href="/solo?source=liked&count=10"
                  className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-none transition hover:bg-white/15"
                >
                  Jouer maintenant
                </Link>
              </div>
            </div>

            <section id="modes" className="ma-section p-0 mb-8">
              <h2 className="mb-6 text-xl font-semibold">Choisir un mode</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {[
                  {
                    title: "Solo",
                    icon: "🎧",
                    description: "Jouez à votre rythme et améliorez votre score personnel.",
                    features: ["Pas de limite de temps", "Historique des manches", "Statistiques détaillées"],
                    href: "/solo",
                    cta: "Jouer en solo",
                  },
                  {
                    title: "Multijoueur",
                    icon: "👥",
                    description: "Défiez vos amis en temps réel et montez au classement.",
                    features: ["Chat en direct", "Classement en temps réel", "Jusqu'à 10 joueurs"],
                    href: "/multiplayer",
                    cta: "Jouer en multijoueur",
                  },
                ].map(mode => (
                  <div
                    key={mode.title}
                    className="relative overflow-hidden rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-6 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
                  >
                  <div className="relative z-10 flex flex-col gap-3">
                      <div className="text-4xl">{mode.icon}</div>
                      <h3 className="text-2xl font-bold">{mode.title}</h3>
                      <p className="text-sm text-[var(--ma-muted)]">{mode.description}</p>
                      <div className="mt-1 flex flex-col gap-2 text-[var(--ma-muted)]">
                        {mode.features.map(f => (
                          <div key={f} className="flex items-center gap-2 text-sm">
                            <span className="text-[#a855f7]">✓</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                      <Link href={mode.href} className="ma-btn-primary mt-2 w-full justify-center">
                        {mode.cta}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ma-section p-0">
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
                  className="ma-btn-primary px-4 py-3 text-sm font-semibold shadow-[0_12px_32px_rgba(168,85,247,0.25)]"
                >
                  Se connecter à Spotify
                </Link>
              </div>
            ) : null}
              <PlaylistGrid playlists={playlists} loading={loadingPlaylists} />
            </section>

            {/* Activité récente retirée pour alléger la page */}
          </div>

          <div className="hidden md:block sticky top-4">
            <HistoryPanel items={activityItems.length ? activityItems : fallbackActivity} />
          </div>
        </div>
      </div>

      <nav className="ma-nav-bottom">
        <BottomNav active="menu" />
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
          className="ma-card relative overflow-hidden border-[rgba(255,255,255,0.08)] bg-[#0f0f0f] transition-colors duration-150 hover:border-[rgba(168,85,247,0.3)]"
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
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href={`/solo?source=playlist&playlistId=${encodeURIComponent(item.id)}`}
              className="flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Solo
            </Link>
            <Link
              href={`/multiplayer?source=playlist&playlistId=${encodeURIComponent(item.id)}`}
              className="flex items-center justify-center rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/20"
            >
              Room
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

function FriendsPanel({ floating = false, className = "" }: { floating?: boolean; className?: string }) {
  const online = friends.filter(friend => friend.status === "En ligne").length

  const gradientFor = (accent: string) => {
    switch (accent) {
      case "pink":
        return "linear-gradient(135deg, rgba(236,72,153,0.6), rgba(126,34,206,0.4))"
      case "emerald":
        return "linear-gradient(135deg, rgba(16,185,129,0.6), rgba(59,130,246,0.35))"
      case "blue":
        return "linear-gradient(135deg, rgba(59,130,246,0.6), rgba(168,85,247,0.45))"
      default:
        return "linear-gradient(135deg, rgba(168,85,247,0.6), rgba(109,40,217,0.35))"
    }
  }

  return (
    <div
      className={`ma-card relative overflow-hidden bg-[#0d0d11] ${floating ? "sticky top-6 shadow-[0_8px_18px_rgba(0,0,0,0.3)]" : ""} ${className}`}
    >
      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Amis</p>
          <span className="text-xs text-[var(--ma-muted)]">{online} en ligne</span>
        </div>
        <div className="space-y-4">
          {friends.map(friend => {
            const initials = friend.name
              .split(" ")
              .map(part => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
            return (
              <div
                key={friend.name}
                className="flex items-center gap-4 rounded-xl border border-[var(--ma-border)] bg-white/5 px-4 py-4 shadow-[0_6px_14px_rgba(0,0,0,0.2)]"
              >
                <div className="relative h-12 w-12 overflow-hidden rounded-lg">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: gradientFor(friend.accent),
                    }}
                  />
                  <div className="relative z-10 grid h-full w-full place-items-center text-base font-semibold">
                    {initials}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold">{friend.name}</p>
                  <p className="text-sm text-[var(--ma-muted)]">{friend.nowPlaying}</p>
                </div>
                <div
                  className={`h-2 w-2 rounded-full ${friend.status === "En ligne" ? "bg-emerald-400" : "bg-gray-500"}`}
                  title={friend.status}
                />
              </div>
            )
          })}
        </div>
        <Link href="/multiplayer" className="ma-btn-primary w-full justify-center">
          Inviter des amis
        </Link>
      </div>
    </div>
  )
}

function HistoryPanel({ floating = false, className = "", items = fallbackActivity }: { floating?: boolean; className?: string; items?: ActivityItem[] }) {
  return (
    <div
      className={`ma-card relative overflow-hidden bg-[#0d0d11] ${floating ? "sticky top-6 shadow-[0_16px_40px_rgba(0,0,0,0.4)]" : ""} ${className}`}
    >
      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Historique</p>
          <Link href="/stats" className="text-xs text-white/80 underline-offset-4 hover:underline">
            Voir +
          </Link>
        </div>
        <div className="space-y-4">
          {items.map(item => (
            <div
              key={item.title}
              className="rounded-xl border border-[var(--ma-border)] bg-white/5 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold">{item.title}</p>
                <span className="text-xs text-[var(--ma-muted)]">{item.time}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-[var(--ma-muted)]">{item.meta}</p>
                <span className="rounded-full border border-[var(--ma-border)] px-2 py-1 text-[11px] text-[var(--ma-muted)]">
                  {item.rounds} manches
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
