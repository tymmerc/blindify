"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { GameSessionSummary, UserSummary, UserStats } from "@/lib/types"
import { BottomNav } from "@/components/BottomNav"

const achievements = [
  { icon: "🏆", name: "Première victoire", desc: "Gagner votre première partie", unlocked: true },
  { icon: "🔥", name: "En feu", desc: "10 bonnes réponses d'affilée", unlocked: true },
  { icon: "⚡", name: "Éclair", desc: "Répondre en moins de 3 secondes", unlocked: true },
  { icon: "💯", name: "Perfection", desc: "Score parfait 20/20", unlocked: false },
  { icon: "🎵", name: "Mélomane", desc: "Jouer 100 parties", unlocked: true },
  { icon: "👑", name: "Champion", desc: "Gagner 50 parties en multijoueur", unlocked: false },
]

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function formatAccuracy(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0%"
  return `${Math.round(value)}%`
}

function stateLabel(state: string): string {
  if (state === "finished") return "Terminé"
  if (state === "in_progress") return "En cours"
  return state || "—"
}

export default function ProfilePage() {
  const router = useRouter()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [history, setHistory] = useState<GameSessionSummary[]>([])

  useEffect(() => {
    let active = true
    async function guard() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (!me) {
          router.replace("/auth/login")
          return
        }
        setUserPayload(me)
        const [statsRes, historyRes] = await Promise.all([api.detailedStats(), api.gameHistory()])
        if (!active) return
        setStats(statsRes?.stats ?? null)
        setHistory(historyRes?.sessions ?? [])
      } finally {
        if (active) setLoading(false)
      }
    }
    guard()
    return () => {
      active = false
    }
  }, [router])

  const user: UserSummary | null = userPayload?.user ?? null
  const displayName = user?.username || "Jean Dupont"
  const providerLabel = user?.provider ? user.provider.toUpperCase() : "Blindify"
  const initials = useMemo(() => {
    if (!displayName) return "?"
    return displayName
      .split(" ")
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  }, [displayName])

  const statCards = useMemo(() => {
    const totalGames = stats?.totalGames ?? 0
    const accuracy = formatAccuracy(stats?.accuracyRate ?? 0)
    const bestStreak = stats?.bestStreak ?? 0
    const avgTime = stats?.averageReactionTime ?? 0
    return [
      { label: "Parties", value: `${totalGames}` },
      { label: "Précision", value: accuracy },
      { label: "Temps moyen", value: avgTime ? `${avgTime} ms` : "—" },
      { label: "Série max", value: `${bestStreak}` },
    ]
  }, [stats])

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
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            ← Retour
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            <span>⚙️</span>
            <span>Paramètres</span>
          </Link>
        </div>

        <div className="ma-card mb-6 text-center">
          <div className="relative mx-auto mb-4 h-28 w-28 overflow-hidden rounded-full border border-[var(--ma-border)] bg-black/50 shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
            {user?.avatar ? (
              <Image
                src={user.avatar}
                alt={displayName}
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[var(--ma-gradient)] text-4xl font-bold text-white">
                {initials}
              </div>
            )}
          </div>
          <h1 className="text-4xl font-bold tracking-[-0.04em]">{displayName}</h1>
          <p className="mt-2 text-sm text-[var(--ma-muted)]">Compte {providerLabel}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(168,85,247,0.12)] px-4 py-2 text-sm font-semibold">
            <span>⭐</span>
            <span>Niveau {Math.max(1, Math.floor((stats?.totalXp ?? 0) / 100) + 1)}</span>
          </div>
        </div>

        <div className="ma-stat-grid mb-10">
          {statCards.map(item => (
            <div key={item.label} className="ma-card text-center">
              <div
                className="text-3xl font-bold"
                style={{ backgroundImage: "var(--ma-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}
              >
                {item.value}
              </div>
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">{item.label}</div>
            </div>
          ))}
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold tracking-[-0.02em]">Succès</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {achievements.map(achievement => (
              <div
                key={achievement.name}
                className={`ma-card text-center transition duration-200 hover:-translate-y-1 ${
                  achievement.unlocked ? "border-[rgba(168,85,247,0.3)] bg-[rgba(168,85,247,0.05)]" : ""
                }`}
              >
                <div className={`mb-3 text-4xl ${achievement.unlocked ? "" : "opacity-50 grayscale"}`}>
                  {achievement.icon}
                </div>
                <div className="text-base font-semibold">{achievement.name}</div>
                <p className="text-sm text-[var(--ma-muted)]">{achievement.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em]">Parties récentes</h2>
          <div className="ma-card divide-y divide-[var(--ma-border)]">
            {history.length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--ma-muted)]">Aucune partie enregistrée.</div>
            ) : (
              history.slice(0, 6).map(game => (
                <div key={game.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <h4 className="text-base font-semibold">
                      {game.mode ? game.mode.charAt(0).toUpperCase() + game.mode.slice(1) : "Partie"} · {game.difficulty ?? "normal"}
                    </h4>
                    <p className="text-sm text-[var(--ma-muted)]">{formatDate(game.started_at)} · {game.source_provider ?? "—"}</p>
                  </div>
                  <div className="text-xs text-[var(--ma-muted)]">
                    <span className="rounded-full border border-[var(--ma-border-strong)] px-3 py-1">{stateLabel(game.state)}</span>
                    <div className="mt-1 text-right text-[11px]">{game.total_rounds ?? 0} manches</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <BottomNav active="profile" />
    </div>
  )
}
