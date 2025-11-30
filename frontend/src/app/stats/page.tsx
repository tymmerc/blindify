"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { GameSessionSummary, UserStats } from "@/lib/types"
import { BottomNav } from "@/components/BottomNav"
import { fetchUserDashboard } from "@/lib/userData"
import { ArrowRight, Brain, Flame, Sparkles, TrendingUp } from "lucide-react"

type StatCard = { label: string; value: string; hint?: string }

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
    const level = Math.max(1, Math.floor((stats?.totalXp ?? 0) / 100) + 1)
    return [
      { label: "Précision", value: accuracy, hint: "Progression globale" },
      { label: "Réaction", value: avgTime, hint: "Réponds sous 1s pour bonus" },
      { label: "Série max", value: `${bestStreak}`, hint: "Enchaîne en mode normal" },
      { label: "Parties", value: `${totalGames}`, hint: "Volume total" },
      { label: "Niveau", value: `${level}`, hint: "XP cumulée" },
    ]
  }, [stats])

  const modeSplit = useMemo(() => {
    const solo = history.filter(h => h.mode === "solo").length
    const multi = history.filter(h => h.mode === "multiplayer").length
    return { solo, multi }
  }, [history])

  const sourceBuckets = useMemo(() => {
    const buckets = history.reduce<Record<string, number>>((acc, session) => {
      const key = session.source_provider || "library"
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const max = Math.max(...Object.values(buckets), 1)
    return { buckets, max }
  }, [history])

  const displayName = userPayload?.user?.username || "Profil"

  const highlights = useMemo(() => {
    const sorted = [...history].sort((a, b) => (new Date(b.started_at || 0).getTime()) - (new Date(a.started_at || 0).getTime()))
    const best = sorted.filter(s => s.state === "finished").slice(0, 3)
    const warnings = sorted.filter(s => s.state !== "finished").slice(0, 3)
    return { best, warnings }
  }, [history])

  const coachActions = useMemo(() => {
    const actions: { title: string; description: string; href: string }[] = []
    if ((stats?.accuracyRate ?? 0) < 80) {
      actions.push({
        title: "Gagner en précision",
        description: "Refais 10 titres sur ta source la moins jouée pour +5% visé.",
        href: "/solo?source=library&count=10",
      })
    }
    if ((stats?.averageReactionTime ?? 0) > 1200) {
      actions.push({
        title: "Booster la vitesse",
        description: "Sprint 10 manches en répondant sous 1s pour débloquer le bonus vitesse.",
        href: "/solo?source=library&count=10",
      })
    }
    if (modeSplit.multi === 0) {
      actions.push({
        title: "Tester la pression multi",
        description: "Crée une room et termine 10 manches pour calibrer ta vitesse en live.",
        href: "/multiplayer",
      })
    }
    if (!actions.length) {
      actions.push({
        title: "Continuer sur ta lancée",
        description: "Enchaîne une session multi pour comparer tes réflexes en groupe.",
        href: "/multiplayer",
      })
    }
    return actions.slice(0, 3)
  }, [stats?.accuracyRate, stats?.averageReactionTime, modeSplit.multi])

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

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-24">
      <div className="ma-container pt-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Coach musical</p>
            <h1 className="text-3xl font-bold tracking-[-0.03em]">Plan de progression</h1>
            <p className="text-sm text-[var(--ma-muted)]">Profil : {displayName}</p>
          </div>
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            ← Retour
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="ma-card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Skill profile</p>
                  <h2 className="text-xl font-semibold">Niveau actuel</h2>
                </div>
                <Sparkles className="h-5 w-5 text-neon" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {statCards.map((card, idx) => {
                  const accents = [
                    "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.18))",
                    "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(147,51,234,0.18))",
                    "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(34,197,94,0.18))",
                    "linear-gradient(135deg, rgba(236,72,153,0.18), rgba(244,114,182,0.18))",
                    "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(248,113,113,0.18))",
                  ]
                  const bg = accents[idx % accents.length]
                  return (
                    <div
                      key={card.label}
                      className="rounded-xl border border-[var(--ma-border)] px-4 py-3"
                      style={{ background: bg }}
                    >
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--ma-muted)]">{card.label}</p>
                      <p className="text-2xl font-semibold text-white">{card.value}</p>
                      {card.hint ? <p className="text-[11px] text-[var(--ma-muted)]">{card.hint}</p> : null}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="ma-card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Solo vs Multi</p>
                  <h2 className="text-lg font-semibold">Répartition des sessions</h2>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 text-sm text-[var(--ma-muted)]">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em]">Solo</p>
                  <p className="text-xl font-semibold text-white">{modeSplit.solo}</p>
                  <p className="text-[11px]">Travail du rythme.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em]">Multi</p>
                  <p className="text-xl font-semibold text-white">{modeSplit.multi}</p>
                  <p className="text-[11px]">Pression live.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em]">Sources</p>
                  <p className="text-xl font-semibold text-white">{Object.keys(sourceBuckets.buckets).length || 1}</p>
                  <p className="text-[11px]">Dominante: {Object.entries(sourceBuckets.buckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"}</p>
                </div>
              </div>
            </div>

            <div className="ma-card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Heatmap</p>
                  <h2 className="text-lg font-semibold">Où tu joues le plus</h2>
                </div>
                <Brain className="h-5 w-5 text-[var(--ma-muted)]" />
              </div>
              {Object.keys(sourceBuckets.buckets).length === 0 ? (
                <p className="text-sm text-[var(--ma-muted)]">Pas encore de données.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(sourceBuckets.buckets).map(([src, count]) => {
                    const intensity = Math.max(0.08, count / sourceBuckets.max)
                    return (
                      <div
                        key={src}
                        className="rounded-lg border border-[var(--ma-border)] p-3"
                        style={{ background: `linear-gradient(135deg, rgba(168,85,247,${0.12 * intensity}), rgba(236,72,153,${0.1 * intensity}))` }}
                      >
                        <p className="text-sm font-semibold text-white">{src}</p>
                        <p className="text-[11px] text-[var(--ma-muted)]">{count} parties</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="ma-card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Coach</p>
                  <h2 className="text-xl font-semibold">Actions recommandées</h2>
                </div>
                <Flame className="h-5 w-5 text-neon" />
              </div>
              <div className="grid gap-3">
                {coachActions.map((action, idx) => {
                  const accents = [
                    "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(147,51,234,0.14))",
                    "linear-gradient(135deg, rgba(236,72,153,0.14), rgba(251,113,133,0.14))",
                    "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(34,197,94,0.14))",
                  ]
                  const bg = accents[idx % accents.length]
                  return (
                    <Link
                      key={action.title}
                      href={action.href}
                      className="flex items-start justify-between rounded-xl border border-white/10 px-4 py-3 transition hover:border-white/20"
                      style={{ background: bg }}
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{action.title}</p>
                        <p className="text-xs text-[var(--ma-muted)]">{action.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-[var(--ma-muted)]" />
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="ma-card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Highlights</p>
                  <h2 className="text-lg font-semibold">Meilleures sessions</h2>
                </div>
              </div>
              <div className="divide-y divide-[var(--ma-border)]">
                {highlights.best.length === 0 ? (
                  <div className="py-4 text-sm text-[var(--ma-muted)]">Aucune partie terminée.</div>
                ) : (
                  highlights.best.map(session => (
                    <SessionRow key={session.id} session={session} />
                  ))
                )}
              </div>
            </div>

            <div className="ma-card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">A travailler</p>
                  <h2 className="text-lg font-semibold">Sessions à reprendre</h2>
                </div>
                <TrendingUp className="h-5 w-5 text-[var(--ma-muted)]" />
              </div>
              <div className="divide-y divide-[var(--ma-border)]">
                {highlights.warnings.length === 0 ? (
                  <div className="py-4 text-sm text-[var(--ma-muted)]">Rien à signaler.</div>
                ) : (
                  highlights.warnings.map(session => (
                    <SessionRow key={session.id} session={session} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <BottomNav active="stats" />
    </div>
  )
}

function SessionRow({ session }: { session: GameSessionSummary }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">
            {session.source_provider?.toString().toUpperCase()} · {session.mode}
          </div>
          <div className="text-xs text-[var(--ma-muted)]">
            {session.difficulty} · {formatDate(session.started_at)}
          </div>
        </div>
        <span className="rounded-full border border-[var(--ma-border-strong)] px-3 py-1 text-[11px] text-[var(--ma-muted)]">
          {stateLabel(session.state)}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-[var(--ma-muted)]">Manches: {session.total_rounds}</div>
    </div>
  )
}
