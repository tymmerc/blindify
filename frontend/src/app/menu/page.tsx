"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { FriendEntry, GameSessionSummary, RoomInvitation, UserSummary } from "@/lib/types"
import { fetchUserDashboard } from "@/lib/userData"
import { BottomNav } from "@/components/BottomNav"
import { Logo } from "@/components/Logo"
import { Bell, Check, Gamepad2, Loader2, Plus, Users, X } from "lucide-react"
import { useFriends } from "@/hooks/useFriends"
import { useInvitations } from "@/hooks/useInvitations"

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
  const {
    friends,
    incoming: incomingFriends,
    outgoing: outgoingFriends,
    loading: friendsLoading,
    error: friendsError,
    requestFriend,
    acceptFriend,
    declineFriend,
    removeFriend,
  } = useFriends()
  const {
    pending: roomInvitations,
    toasts: invitationToasts,
    acceptInvitation,
    declineInvitation,
    consumeToast,
    loading: invitationsLoading,
    sendInvitation,
  } = useInvitations()

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const me = await api.ensureUserSession("Invité")
        if (!active) return
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

  const handleAddFriend = useCallback(
    async (username: string) => {
      const clean = username.trim()
      if (!clean) throw new Error("Pseudo requis")
      await requestFriend(clean)
    },
    [requestFriend]
  )

  const handleAcceptFriend = useCallback(
    async (userId: number) => {
      await acceptFriend(userId)
    },
    [acceptFriend]
  )

  const handleDeclineFriend = useCallback(
    async (userId: number) => {
      await declineFriend(userId)
    },
    [declineFriend]
  )

  const handleRemoveFriend = useCallback(
    async (userId: number) => {
      await removeFriend(userId)
    },
    [removeFriend]
  )

  const handleAcceptRoomInvite = useCallback(
    async (invitationId: number) => {
      const res = await acceptInvitation(invitationId)
      consumeToast(invitationId)
      if (res?.room?.room_code) {
        router.push(`/multiplayer?code=${encodeURIComponent(res.room.room_code)}`)
      }
    },
    [acceptInvitation, consumeToast, router]
  )

  const handleDeclineRoomInvite = useCallback(
    async (invitationId: number) => {
      await declineInvitation(invitationId)
      consumeToast(invitationId)
    },
    [declineInvitation, consumeToast]
  )

  const handleInviteFriend = useCallback(
    async (userId: number) => {
      // Crée une room puis envoie une invitation et redirige l'hôte dedans
      const { room } = await api.createRoom({ questionCount: 10 })
      await sendInvitation(userId, room.room_code)
      router.push(`/multiplayer?code=${encodeURIComponent(room.room_code)}`)
    },
    [router, sendInvitation]
  )

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
        <div className="flex items-center justify-between py-6">
          <Logo withText priority />
        </div>

        <InvitationToasts
          toasts={invitationToasts}
          onAccept={handleAcceptRoomInvite}
          onDecline={handleDeclineRoomInvite}
          onAcknowledge={consumeToast}
        />

        <div className="grid auto-rows-min gap-5 lg:gap-7 md:grid-cols-[240px,minmax(0,1fr),240px] xl:grid-cols-[280px,minmax(0,1fr),280px] items-start">
          <div className="hidden md:block sticky top-4">
            <FriendsPanel
              friends={friends}
              incoming={incomingFriends}
              outgoing={outgoingFriends}
              roomInvitations={roomInvitations}
              loading={friendsLoading}
              error={friendsError}
              onAdd={handleAddFriend}
              onAccept={handleAcceptFriend}
              onDecline={handleDeclineFriend}
              onRemove={handleRemoveFriend}
              onInvite={handleInviteFriend}
              onAcceptInvite={handleAcceptRoomInvite}
              onDeclineInvite={handleDeclineRoomInvite}
              invitationsLoading={invitationsLoading}
            />
          </div>

          <div className="space-y-7 max-w-[1100px] w-full mx-auto">
            <div className="grid gap-4 md:hidden">
              <FriendsPanel
                friends={friends}
                incoming={incomingFriends}
                outgoing={outgoingFriends}
                roomInvitations={roomInvitations}
                loading={friendsLoading}
                error={friendsError}
                onAdd={handleAddFriend}
                onAccept={handleAcceptFriend}
                onDecline={handleDeclineFriend}
                onRemove={handleRemoveFriend}
                onInvite={handleInviteFriend}
                onAcceptInvite={handleAcceptRoomInvite}
                onDeclineInvite={handleDeclineRoomInvite}
                invitationsLoading={invitationsLoading}
              />
              <HistoryPanel items={activityItems.length ? activityItems : fallbackActivity} />
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-[var(--ma-border)] bg-[#0f0f0f] px-6 py-7 shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
              <div className="relative flex flex-col gap-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="relative h-11 w-11 overflow-hidden rounded-full border border-[var(--ma-border)] bg-black/50 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                      {user?.avatar ? (
                        <Image
                          src={user.avatar}
                          alt={user.username ?? "Avatar"}
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-base font-semibold text-white">
                          {initials}
                        </div>
                      )}
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

type FriendsPanelProps = {
  friends: FriendEntry[]
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
  roomInvitations: RoomInvitation[]
  loading?: boolean
  error?: string | null
  invitationsLoading?: boolean
  floating?: boolean
  className?: string
  onAdd: (username: string) => Promise<void>
  onAccept: (userId: number) => Promise<void>
  onDecline: (userId: number) => Promise<void>
  onRemove: (userId: number) => Promise<void>
  onInvite?: (userId: number) => Promise<void>
  onAcceptInvite: (invitationId: number) => Promise<void>
  onDeclineInvite: (invitationId: number) => Promise<void>
}

function FriendsPanel({
  friends,
  incoming,
  outgoing,
  roomInvitations,
  loading = false,
  error = null,
  invitationsLoading = false,
  floating = false,
  className = "",
  onAdd,
  onAccept,
  onDecline,
  onRemove,
  onInvite,
  onAcceptInvite,
  onDeclineInvite,
}: FriendsPanelProps) {
  const [identifier, setIdentifier] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionBusy, setActionBusy] = useState<number | null>(null)
  const [inviteBusy, setInviteBusy] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<"friends" | "invitations">("friends")

  const online = friends.filter(friend => friend.presence?.status && friend.presence.status !== "offline").length
  const playing = friends.filter(friend => friend.presence?.status === "playing").length
  const totalFriends = friends.length
  const palette = ["purple", "pink", "emerald", "blue"]

  const gradientFor = (seed: number) => {
    const accent = palette[Math.abs(seed) % palette.length]
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

  const providerLabel = (provider?: FriendEntry["provider"]) => {
    if (!provider) return "—"
    if (provider === "spotify") return "Spotify"
    if (provider === "deezer") return "Deezer"
    if (provider === "apple") return "Apple Music"
    return provider
  }

  const renderStatusBadge = (friend: FriendEntry) => {
    const status = friend.presence?.status ?? "offline"
    const label = status === "playing" ? "En partie" : status === "online" ? "En ligne" : "Hors ligne"
    const dotColor =
      status === "playing" ? "bg-emerald-400" : status === "online" ? "bg-sky-300" : "bg-white/50"
    const bg =
      status === "playing"
        ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-50"
        : status === "online"
          ? "bg-sky-500/10 border-sky-400/30 text-sky-50"
          : "bg-white/5 border-white/10 text-[var(--ma-muted)]"
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${bg}`}
      >
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        {label}
      </span>
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const value = identifier.trim()
    if (!value) {
      setMessage("Entre le pseudo de ton ami.")
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      await onAdd(value)
      setIdentifier("")
      setMessage("Invitation envoyée ✉️")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible d'ajouter cet ami.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDecline = async (userId: number) => {
    setActionBusy(userId)
    setMessage(null)
    try {
      await onDecline(userId)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible de refuser cette demande.")
    } finally {
      setActionBusy(null)
    }
  }

  const handleAccept = async (userId: number) => {
    setActionBusy(userId)
    setMessage(null)
    try {
      await onAccept(userId)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible d'accepter cette invitation.")
    } finally {
      setActionBusy(null)
    }
  }

  const handleRemove = async (userId: number) => {
    setActionBusy(userId)
    setMessage(null)
    try {
      await onRemove(userId)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible de mettre à jour cette relation.")
    } finally {
      setActionBusy(null)
    }
  }

  const handleInviteFriend = async (userId: number) => {
    if (!onInvite) return
    setActionBusy(userId)
    setMessage(null)
    try {
      await onInvite(userId)
      setMessage("Invitation envoyée")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible d'envoyer l'invitation.")
    } finally {
      setActionBusy(null)
    }
  }

  const handleRoomInviteAccept = async (invitationId: number) => {
    setInviteBusy(invitationId)
    setMessage(null)
    try {
      await onAcceptInvite(invitationId)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible de rejoindre la room.")
    } finally {
      setInviteBusy(null)
    }
  }

  const handleRoomInviteDecline = async (invitationId: number) => {
    setInviteBusy(invitationId)
    setMessage(null)
    try {
      await onDeclineInvite(invitationId)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible de refuser l'invitation.")
    } finally {
      setInviteBusy(null)
    }
  }

  const renderAvatar = (friend: FriendEntry) => {
    const initials = friend.username
      ? friend.username
          .split(" ")
          .map(part => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "??"
    return (
      <div className="relative h-12 w-12 overflow-hidden rounded-lg">
        {friend.avatar ? (
          <Image src={friend.avatar} alt={friend.username ?? "ami"} fill className="object-cover" sizes="48px" />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: gradientFor(friend.userId),
            }}
          />
        )}
        <div className="relative z-10 grid h-full w-full place-items-center text-base font-semibold">
          {initials}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`ma-card relative overflow-hidden bg-[#0d0d11] ${floating ? "sticky top-6 shadow-[0_8px_18px_rgba(0,0,0,0.3)]" : ""} ${className}`}
    >
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Réseau</p>
            <p className="text-sm text-[var(--ma-muted)]">
              {totalFriends} ami{totalFriends > 1 ? "s" : ""} · {online} en ligne · {playing} en partie
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("friends")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeTab === "friends" ? "bg-white/10 text-white" : "border border-white/10 text-[var(--ma-muted)]"
              }`}
              type="button"
            >
              <Users className="mr-1 inline h-4 w-4" />
              Amis
            </button>
            <button
              onClick={() => setActiveTab("invitations")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeTab === "invitations" ? "bg-white/10 text-white" : "border border-white/10 text-[var(--ma-muted)]"
              }`}
              type="button"
            >
              <Bell className="mr-1 inline h-4 w-4" />
              Invitations
              {roomInvitations.length ? (
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
                  {roomInvitations.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {activeTab === "friends" ? (
          <>
            <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--ma-border)] bg-black/30 p-3">
              <label className="mb-2 block text-xs uppercase tracking-[0.25em] text-[var(--ma-muted)]">
                Ajouter un ami
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={identifier}
                  onChange={event => setIdentifier(event.target.value)}
                  placeholder="Pseudo (nom complet ou début)"
                  className="w-full rounded-lg border border-[var(--ma-border)] bg-black/50 px-3 py-2 text-sm outline-none transition focus:border-[rgba(168,85,247,0.4)]"
                  disabled={submitting || loading}
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={submitting || loading}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ajouter
                </button>
              </div>
              {(message || error) && (
                <p className="mt-2 text-xs text-[var(--ma-muted)]">{message ?? error}</p>
              )}
            </form>

            {incoming.length ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--ma-muted)]">Demandes reçues</p>
                  <span className="text-xs text-[var(--ma-muted)]">{incoming.length}</span>
                </div>
                {incoming.map(friend => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--ma-border)] bg-white/5 px-3 py-3"
                  >
                    {renderAvatar(friend)}
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{friend.username ?? "Joueur"}</p>
                      <p className="text-xs text-[var(--ma-muted)]">Souhaite te suivre</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(friend.userId)}
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-500/80 px-2.5 py-2 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(16,185,129,0.4)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionBusy === friend.userId || loading}
                        type="button"
                      >
                        {actionBusy === friend.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                        <span className="ml-1">Accepter</span>
                      </button>
                      <button
                        onClick={() => handleDecline(friend.userId)}
                        className="inline-flex items-center justify-center rounded-lg border border-white/10 px-2.5 py-2 text-xs font-semibold text-white transition hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionBusy === friend.userId || loading}
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--ma-muted)]">Mes amis</p>
              <span className="text-xs text-[var(--ma-muted)]">{totalFriends}</span>
            </div>
              {loading && !friends.length ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 rounded-xl border border-[var(--ma-border)] bg-white/5 px-3 py-3">
                      <div className="h-12 w-12 rounded-lg bg-white/10" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/2 rounded bg-white/10" />
                        <div className="h-3 w-1/3 rounded bg-white/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {!loading && !friends.length ? (
                <p className="text-sm text-[var(--ma-muted)]">Aucun ami pour l'instant. Envoie une invitation pour commencer.</p>
              ) : null}
              {friends.map(friend => (
                <div
                  key={friend.id}
                  className="flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-black/40 px-3.5 py-3 shadow-[0_10px_20px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-center gap-3">
                    {renderAvatar(friend)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{friend.username ?? "Joueur"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {renderStatusBadge(friend)}
                        {friend.presence?.roomCode ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white">
                            <Gamepad2 className="h-3.5 w-3.5" />
                            Room {friend.presence.roomCode}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[var(--ma-muted)]">
                        Connecté via {providerLabel(friend.provider)}
                      </p>
                    </div>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2">
                    {onInvite ? (
                      <button
                        onClick={() => handleInviteFriend(friend.userId)}
                        className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionBusy === friend.userId || loading}
                        type="button"
                      >
                        Inviter
                      </button>
                    ) : (
                      <div />
                    )}
                    <button
                      onClick={() => handleRemove(friend.userId)}
                      className="w-full rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[var(--ma-muted)] transition hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={actionBusy === friend.userId || loading}
                      type="button"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {outgoing.length ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--ma-muted)]">Invitations envoyées</p>
                  <span className="text-xs text-[var(--ma-muted)]">{outgoing.length}</span>
                </div>
                {outgoing.map(friend => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--ma-border)] bg-black/30 px-3 py-3"
                  >
                    {renderAvatar(friend)}
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{friend.username ?? "Joueur"}</p>
                      <p className="text-xs text-[var(--ma-muted)]">En attente d'acceptation</p>
                    </div>
                    <button
                      onClick={() => handleRemove(friend.userId)}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[var(--ma-muted)] transition hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={actionBusy === friend.userId || loading}
                      type="button"
                    >
                      Annuler
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--ma-muted)]">Invitations de rooms</p>
              <span className="text-xs text-[var(--ma-muted)]">
                {roomInvitations.length} en attente
              </span>
            </div>
            {invitationsLoading && !roomInvitations.length ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-xl border border-[var(--ma-border)] bg-white/5 px-3 py-3">
                    <div className="h-10 w-10 rounded-lg bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-white/10" />
                      <div className="h-3 w-1/2 rounded bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {!roomInvitations.length && !invitationsLoading ? (
              <p className="text-sm text-[var(--ma-muted)]">Aucune invitation pour le moment.</p>
            ) : null}
            {roomInvitations.map(invite => {
              const expiresLabel = invite.expiresAt
                ? new Date(invite.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                : "Bientôt"
              return (
                <div
                  key={invite.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--ma-border)] bg-white/5 px-3 py-3 shadow-[0_6px_14px_rgba(0,0,0,0.2)]"
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Room {invite.roomCode}</p>
                    <p className="text-xs text-[var(--ma-muted)]">
                      Par {invite.fromUsername ?? "un ami"} · expiration {expiresLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRoomInviteAccept(invite.id)}
                      className="rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(16,185,129,0.4)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={inviteBusy === invite.id || invitationsLoading}
                      type="button"
                    >
                      {inviteBusy === invite.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rejoindre"}
                    </button>
                    <button
                      onClick={() => handleRoomInviteDecline(invite.id)}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white transition hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={inviteBusy === invite.id || invitationsLoading}
                      type="button"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

function InvitationToasts({
  toasts,
  onAccept,
  onDecline,
  onAcknowledge,
}: {
  toasts: Array<{ id: number; fromUsername?: string | null; roomCode: string; expiresAt?: string; state?: "incoming" | "expired"; message?: string }>
  onAccept: (invitationId: number) => void
  onDecline: (invitationId: number) => void
  onAcknowledge?: (invitationId: number) => void
}) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-30 flex max-w-[360px] flex-col gap-3 sm:right-6">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="rounded-2xl border border-white/10 bg-[#111018]/90 px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.4)] backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {toast.state === "expired" ? "Invitation expirée" : `Invitation pour room ${toast.roomCode}`}
              </p>
              <p className="text-xs text-[var(--ma-muted)]">
                {toast.state === "expired" ? toast.message ?? "Cette invitation n'est plus valide" : `De ${toast.fromUsername ?? "un ami"}`}
              </p>
              {toast.expiresAt ? (
                <p className="text-[11px] text-[var(--ma-muted)]">
                  Expire {new Date(toast.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : null}
            </div>
            {toast.state === "expired" ? (
              <button
                onClick={() => (onAcknowledge ? onAcknowledge(toast.id) : onDecline(toast.id))}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white transition hover:border-white/30"
                type="button"
              >
                OK
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAccept(toast.id)}
                  className="rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(16,185,129,0.4)] transition hover:bg-emerald-500"
                  type="button"
                >
                  Rejoindre
                </button>
                <button
                  onClick={() => onDecline(toast.id)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white transition hover:border-red-400 hover:text-red-200"
                  type="button"
                >
                  X
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
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
