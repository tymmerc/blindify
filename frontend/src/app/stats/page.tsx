"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { GameSessionSummary, UserStats } from "@/lib/types"
import { BottomNav } from "@/components/BottomNav"
import { fetchUserDashboard } from "@/lib/userData"

type StatCard = { label: string; value: string }

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

function formatDurationMs(value: number | null | undefined): string {
  if (!value || Number.isNaN(value)) return "—"
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${Math.round(value)} ms`
}

function ProgressChart({ history }: { history: GameSessionSummary[] }) {
  const days = 14
  const today = new Date()
  const buckets = Array.from({ length: days }).map((_, index) => {
    const d = new Date(today)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (days - 1 - index))
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
    return { key, label, value: 0 }
  })

  const counts = new Map<string, number>()
  history.forEach(session => {
    if (!session.started_at) return
    const dateKey = new Date(session.started_at)
    if (Number.isNaN(dateKey.getTime())) return
    const key = dateKey.toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const series = buckets.map(bucket => ({
    ...bucket,
    value: counts.get(bucket.key) ?? 0,
  }))

  const maxValue = Math.max(...series.map(s => s.value), 1)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 h-40">
        {series.map(point => (
          <div key={point.key} className="flex flex-col items-center gap-2 text-[10px] text-[var(--ma-muted)]">
            <div
              className="w-4 rounded-full bg-[linear-gradient(180deg,rgba(168,85,247,0.9),rgba(236,72,153,0.7))] shadow-[0_8px_18px_rgba(168,85,247,0.25)] transition-all"
              style={{ height: `${(point.value / maxValue) * 100}%` }}
              aria-label={`${point.value} partie(s) le ${point.label}`}
            />
            <span className="whitespace-nowrap">{point.label}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--ma-muted)]">
        Activité des {days} derniers jours (total {history.length} parties).
      </p>
    </div>
  )
}

export default function StatsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
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
        const { stats: fetchedStats, history: fetchedHistory } = await fetchUserDashboard()
        if (!active) return
        setStats(fetchedStats ?? null)
        setHistory(fetchedHistory ?? [])
      } catch (err) {
        if (!active) return
        console.error("stats_page_load_failed", err)
        setError(err instanceof Error ? err.message : "Impossible de charger les statistiques.")
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [router])

  const statCards: StatCard[] = useMemo(() => {
    const totalGames = stats?.totalGames ?? 0
    const accuracy = formatAccuracy(stats?.accuracyRate ?? 0)
    const bestStreak = stats?.bestStreak ?? 0
    const avgTime = formatDurationMs(stats?.averageReactionTime ?? 0)
    return [
      { label: "Parties", value: `${totalGames}` },
      { label: "Précision", value: accuracy },
      { label: "Temps moyen", value: avgTime },
      { label: "Série max", value: `${bestStreak}` },
    ]
  }, [stats])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">
        Chargement…
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="ma-card max-w-xl text-center">
          <p className="text-base font-semibold text-white">Erreur</p>
          <p className="mt-2 text-sm text-[var(--ma-muted)]">{error}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
            >
              ← Retour
            </Link>
            <button
              onClick={() => router.refresh()}
              className="ma-btn-primary text-sm font-semibold"
              type="button"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    )
  }

  const displayName = userPayload?.user?.username || "Profil"

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-28">
      <div className="ma-container pt-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Tableau de bord</p>
            <h1 className="text-3xl font-bold tracking-[-0.03em]">Statistiques</h1>
            <p className="text-sm text-[var(--ma-muted)]">Performances récentes de {displayName}.</p>
          </div>
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            ← Retour
          </Link>
        </div>

        <div className="ma-stat-grid mb-10">
          {statCards.map(stat => (
            <div key={stat.label} className="ma-card text-center">
              <div
                className="text-3xl font-bold"
                style={{ backgroundImage: "var(--ma-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}
              >
                {stat.value}
              </div>
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="ma-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Courbe de progression</h2>
              <span className="text-xs text-[var(--ma-muted)]">Derniers 14 jours</span>
            </div>
            {history.length === 0 ? (
              <div className="rounded-lg border border-[var(--ma-border)] bg-[#0f0f0f] px-4 py-12 text-center text-sm text-[var(--ma-muted)]">
                Aucune donnée pour le moment. Jouez une partie pour voir votre progression.
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--ma-border)] bg-[#0f0f0f] px-3 py-4">
                <ProgressChart history={history} />
              </div>
            )}
          </div>

          <div className="ma-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Activité récente</h2>
              <span className="text-xs text-[var(--ma-muted)]">{history.length} parties</span>
            </div>
            <div className="divide-y divide-[var(--ma-border)]">
              {history.length === 0 ? (
                <div className="py-6 text-center text-sm text-[var(--ma-muted)]">Aucune partie enregistrée pour le moment.</div>
              ) : (
                history.map(session => (
                  <div key={session.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-semibold">{session.source_provider?.toString().toUpperCase()} · {session.mode}</div>
                        <div className="text-sm text-[var(--ma-muted)]">
                          {session.difficulty} · {formatDate(session.started_at)}
                        </div>
                      </div>
                      <span className="rounded-full border border-[var(--ma-border-strong)] px-3 py-1 text-xs text-[var(--ma-muted)]">
                        {stateLabel(session.state)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--ma-muted)]">Manches: {session.total_rounds}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      <BottomNav active="stats" />
    </div>
  )
}
