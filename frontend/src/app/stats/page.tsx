"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { GameSessionSummary, UserStats } from "@/lib/types"
import { BottomNav } from "@/components/BottomNav"
import { Logo } from "@/components/Logo"
import { fetchUserDashboard } from "@/lib/userData"
import { ArrowRight, Brain, Flame, Sparkles, TrendingUp } from "lucide-react"

type StatCard = { label: string; value: string; hint?: string; color: string }

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function formatAccuracy(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0%"
  return `${Math.round(value)}%`
}

function stateLabel(state: string): string {
  if (state === "finished") return "Termine"
  if (state === "in_progress") return "En cours"
  return state || "-"
}

function formatDurationMs(value: number | null | undefined): string {
  if (!value || Number.isNaN(value)) return "-"
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
      { label: "Precision", value: accuracy, hint: "Progression globale", color: "#c65133" },
      { label: "Reaction", value: avgTime, hint: "Ton temps de reponse moyen", color: "#e0a32e" },
      { label: "Serie max", value: `${bestStreak}`, hint: "Enchaine en mode normal", color: "#7d9471" },
      { label: "Parties", value: `${totalGames}`, hint: "Volume total", color: "#a8b8c8" },
      { label: "Niveau", value: `${level}`, hint: "XP cumulee", color: "#c65133" },
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
        title: "Gagner en precision",
        description: "Refais 10 titres sur ta source la moins jouee pour +5% vise.",
        href: "/solo?source=library&count=10",
      })
    }
    if ((stats?.averageReactionTime ?? 0) > 1200) {
      actions.push({
        title: "Affuter l oreille",
        description: "Enchaine 10 manches : la vitesse departage les egalites au classement.",
        href: "/solo?source=library&count=10",
      })
    }
    if (modeSplit.multi === 0) {
      actions.push({
        title: "Tester la pression multi",
        description: "Cree une room et termine 10 manches pour calibrer ta vitesse en live.",
        href: "/modes",
      })
    }
    if (!actions.length) {
      actions.push({
        title: "Continuer sur ta lancee",
        description: "Enchaine une session multi pour comparer tes reflexes en groupe.",
        href: "/modes",
      })
    }
    return actions.slice(0, 3)
  }, [stats?.accuracyRate, stats?.averageReactionTime, modeSplit.multi])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
        Chargement...
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-xl rounded-md border-2 border-[#9c2f1d] bg-[#ece1c8] p-8 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <p className="font-display text-base font-semibold text-[#9c2f1d]">Erreur</p>
          <p className="mt-2 text-sm text-[#6b573f]">{error}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/modes"
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            >
              Retour
            </Link>
            <button
              onClick={() => router.refresh()}
              className="btn-neon text-sm"
              type="button"
            >
              Reessayer
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#2e2014] pb-24">
      <div className="mx-auto max-w-5xl px-5 pt-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Logo withText priority className="shrink-0" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Coach · Musical</p>
              <h1 className="font-display text-3xl font-semibold">Plan de <em className="font-medium italic text-[#c65133]">progression</em></h1>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Profil : {displayName}</p>
            </div>
          </div>
          <Link
            href="/modes"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Skill profile */}
            <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Skill profile</p>
                  <h2 className="font-display text-xl font-semibold text-[#2e2014]">Niveau actuel</h2>
                </div>
                <Sparkles className="h-5 w-5 text-[#c65133]" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {statCards.map(card => (
                  <div
                    key={card.label}
                    className="rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 transition hover:-translate-y-0.5"
                    style={{ borderLeft: `4px solid ${card.color}` }}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">{card.label}</p>
                    <p className="font-display text-3xl font-bold text-[#2e2014]">{card.value}</p>
                    {card.hint ? <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">{card.hint}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Solo vs Multi */}
            <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Solo vs Multi</p>
                  <h2 className="font-display text-lg font-semibold text-[#2e2014]">Repartition des sessions</h2>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Solo", value: modeSplit.solo, desc: "Travail du rythme.", color: "#a8b8c8" },
                  { label: "Multi", value: modeSplit.multi, desc: "Pression live.", color: "#c65133" },
                  {
                    label: "Sources",
                    value: Object.keys(sourceBuckets.buckets).length || 1,
                    desc: `Dom: ${Object.entries(sourceBuckets.buckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-"}`,
                    color: "#e0a32e",
                  },
                ].map(item => (
                  <div
                    key={item.label}
                    className="rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] p-3"
                    style={{ borderLeft: `4px solid ${item.color}` }}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">{item.label}</p>
                    <p className="font-display text-2xl font-bold text-[#2e2014]">{item.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a7558]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap */}
            <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Heatmap</p>
                  <h2 className="font-display text-lg font-semibold text-[#2e2014]">Ou tu joues le plus</h2>
                </div>
                <Brain className="h-5 w-5 text-[#c65133]" />
              </div>
              {Object.keys(sourceBuckets.buckets).length === 0 ? (
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#8a7558]">Pas encore de donnees.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(sourceBuckets.buckets).map(([src, count]) => {
                    const ratio = Math.max(0.06, count / sourceBuckets.max)
                    return (
                      <div key={src}>
                        <div className="mb-1 flex items-baseline justify-between">
                          <p className="font-display text-sm font-semibold text-[#2e2014]">{src}</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">{count} parties</p>
                        </div>
                        <div className="h-3 rounded-sm border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0]">
                          <div
                            className="h-full rounded-sm bg-[#c65133]"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Coach actions */}
            <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Coach</p>
                  <h2 className="font-display text-xl font-semibold text-[#2e2014]">Actions recommandees</h2>
                </div>
                <Flame className="h-5 w-5 text-[#e0a32e]" />
              </div>
              <div className="grid gap-3">
                {coachActions.map(action => (
                  <Link
                    key={action.title}
                    href={action.href}
                    className="flex items-start justify-between gap-3 border-l-4 border-[#c65133] bg-[#efe5d0] px-4 py-3 transition hover:translate-x-0.5 hover:bg-[#f4ecdb]"
                  >
                    <div>
                      <p className="font-display text-sm font-semibold text-[#2e2014]">{action.title}</p>
                      <p className="text-xs text-[#6b573f]">{action.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#c65133]" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Best sessions */}
            <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Highlights</p>
                  <h2 className="font-display text-lg font-semibold text-[#2e2014]">Meilleures sessions</h2>
                </div>
              </div>
              <div className="divide-y divide-[rgba(46,32,20,.15)]">
                {highlights.best.length === 0 ? (
                  <div className="py-4 text-xs font-bold uppercase tracking-[0.15em] text-[#8a7558]">Aucune partie terminee.</div>
                ) : (
                  highlights.best.map(session => (
                    <SessionRow key={session.id} session={session} />
                  ))
                )}
              </div>
            </div>

            {/* Sessions to redo */}
            <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">A travailler</p>
                  <h2 className="font-display text-lg font-semibold text-[#2e2014]">Sessions a reprendre</h2>
                </div>
                <TrendingUp className="h-5 w-5 text-[#9c2f1d]" />
              </div>
              <div className="divide-y divide-[rgba(46,32,20,.15)]">
                {highlights.warnings.length === 0 ? (
                  <div className="py-4 text-xs font-bold uppercase tracking-[0.15em] text-[#8a7558]">Rien a signaler.</div>
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
          <div className="font-display text-sm font-semibold text-[#2e2014]">
            {session.source_provider?.toString().toUpperCase()} · {session.mode}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">
            {session.difficulty} · {formatDate(session.started_at)}
          </div>
        </div>
        <span className="rounded-full border-[1.5px] border-[#2e2014] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
          {stateLabel(session.state)}
        </span>
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">Manches : {session.total_rounds}</div>
    </div>
  )
}
