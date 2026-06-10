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

function panelStyle(color: string) {
  return {
    borderColor: `${color}55`,
    boxShadow: `0 0 16px ${color}1a, inset 0 0 8px ${color}0d`,
  }
}

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
      { label: "Precision", value: accuracy, hint: "Progression globale", color: "#00f7ff" },
      { label: "Reaction", value: avgTime, hint: "Reponds sous 1s pour bonus", color: "#ff2ec8" },
      { label: "Serie max", value: `${bestStreak}`, hint: "Enchaine en mode normal", color: "#ffea00" },
      { label: "Parties", value: `${totalGames}`, hint: "Volume total", color: "#a855f7" },
      { label: "Niveau", value: `${level}`, hint: "XP cumulee", color: "#ff2ec8" },
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
        title: "Booster la vitesse",
        description: "Sprint 10 manches en repondant sous 1s pour debloquer le bonus vitesse.",
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
      <div className="grid min-h-screen place-items-center font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff] text-glow-cyan">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="relative max-w-xl rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-8 text-center" style={panelStyle("#ff3868")}>
          <CornerFrame color="#ff3868" />
          <p className="font-display text-base uppercase tracking-[0.04em] text-[#ff3868]" style={{ textShadow: "0 0 10px rgba(255,56,104,0.6)" }}>Error</p>
          <p className="mt-2 text-sm text-[#9b7fb8]">{error}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/modes"
              className="inline-flex items-center gap-2 rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff] transition hover:bg-[#00f7ff]/10"
            >
              Retour
            </Link>
            <button
              onClick={() => router.refresh()}
              className="btn-neon-pink font-display text-sm"
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
    <div className="min-h-screen text-[#f8f0ff] pb-24">
      <div className="mx-auto max-w-5xl px-5 pt-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Logo withText priority className="shrink-0" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">[ Coach Musical ]</p>
              <h1 className="font-display text-3xl uppercase tracking-[0.04em] text-glow-pink">Plan de progression</h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">Profil : {displayName}</p>
            </div>
          </div>
          <Link
            href="/modes"
            className="inline-flex items-center gap-2 rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff] transition hover:bg-[#00f7ff]/10 hover:shadow-glow-cyan"
          >
            Retour
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Skill profile */}
            <div className="relative rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6" style={panelStyle("#ff2ec8")}>
              <CornerFrame color="#ff2ec8" />
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">[ Skill profile ]</p>
                  <h2 className="font-display text-xl uppercase tracking-[0.04em] text-[#f8f0ff]">Niveau actuel</h2>
                </div>
                <Sparkles className="h-5 w-5 text-[#ff2ec8]" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {statCards.map(card => (
                  <div
                    key={card.label}
                    className="relative rounded-lg border bg-[rgba(15,5,30,0.85)] px-4 py-3 transition hover:-translate-y-0.5"
                    style={{
                      borderColor: `${card.color}55`,
                      boxShadow: `0 0 10px ${card.color}1a`,
                    }}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#9b7fb8]">{card.label}</p>
                    <p className="font-display text-2xl" style={{ color: card.color, textShadow: `0 0 10px ${card.color}` }}>{card.value}</p>
                    {card.hint ? <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#9b7fb8]/70">{card.hint}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Solo vs Multi */}
            <div className="relative rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6" style={panelStyle("#00f7ff")}>
              <CornerFrame color="#00f7ff" />
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">[ Solo vs Multi ]</p>
                  <h2 className="font-display text-lg uppercase tracking-[0.04em] text-[#f8f0ff]">Repartition des sessions</h2>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Solo", value: modeSplit.solo, desc: "Travail du rythme.", color: "#ff2ec8" },
                  { label: "Multi", value: modeSplit.multi, desc: "Pression live.", color: "#00f7ff" },
                  {
                    label: "Sources",
                    value: Object.keys(sourceBuckets.buckets).length || 1,
                    desc: `Dom: ${Object.entries(sourceBuckets.buckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-"}`,
                    color: "#a855f7",
                  },
                ].map(item => (
                  <div
                    key={item.label}
                    className="rounded-lg border bg-[rgba(15,5,30,0.85)] p-3"
                    style={{ borderColor: `${item.color}40` }}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#9b7fb8]">{item.label}</p>
                    <p className="font-display text-xl" style={{ color: item.color, textShadow: `0 0 8px ${item.color}` }}>{item.value}</p>
                    <p className="font-mono text-[10px] text-[#9b7fb8]/70">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap */}
            <div className="relative rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6" style={panelStyle("#a855f7")}>
              <CornerFrame color="#a855f7" />
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">[ Heatmap ]</p>
                  <h2 className="font-display text-lg uppercase tracking-[0.04em] text-[#f8f0ff]">Ou tu joues le plus</h2>
                </div>
                <Brain className="h-5 w-5 text-[#a855f7]" />
              </div>
              {Object.keys(sourceBuckets.buckets).length === 0 ? (
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9b7fb8]">Pas encore de donnees.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(sourceBuckets.buckets).map(([src, count]) => {
                    const intensity = Math.max(0.08, count / sourceBuckets.max)
                    return (
                      <div
                        key={src}
                        className="rounded-lg border border-[#a855f7]/30 bg-[rgba(15,5,30,0.85)] p-3 transition hover:-translate-y-0.5"
                        style={{ boxShadow: `0 0 ${24 * intensity}px rgba(168,85,247,${0.25 * intensity})` }}
                      >
                        <p className="font-display text-sm uppercase tracking-[0.04em] text-[#f8f0ff]">{src}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">{count} parties</p>
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
            <div className="relative rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6" style={panelStyle("#ffea00")}>
              <CornerFrame color="#ffea00" />
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">[ Coach ]</p>
                  <h2 className="font-display text-xl uppercase tracking-[0.04em] text-[#f8f0ff]">Actions recommandees</h2>
                </div>
                <Flame className="h-5 w-5 text-[#ffea00]" />
              </div>
              <div className="grid gap-3">
                {coachActions.map(action => (
                  <Link
                    key={action.title}
                    href={action.href}
                    className="flex items-start justify-between rounded-lg border border-[#ffea00]/30 bg-[#ffea00]/[0.04] px-4 py-3 transition hover:border-[#ffea00]/60 hover:bg-[#ffea00]/[0.08] hover:shadow-[0_0_18px_rgba(255,234,0,0.3)]"
                  >
                    <div>
                      <p className="font-display text-sm uppercase tracking-[0.03em] text-[#f8f0ff]">{action.title}</p>
                      <p className="text-xs text-[#9b7fb8]">{action.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#ffea00]" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Best sessions */}
            <div className="relative rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6" style={panelStyle("#00f7ff")}>
              <CornerFrame color="#00f7ff" />
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">[ Highlights ]</p>
                  <h2 className="font-display text-lg uppercase tracking-[0.04em] text-[#f8f0ff]">Meilleures sessions</h2>
                </div>
              </div>
              <div className="divide-y divide-[#00f7ff]/10">
                {highlights.best.length === 0 ? (
                  <div className="py-4 font-mono text-xs uppercase tracking-[0.2em] text-[#9b7fb8]">Aucune partie terminee.</div>
                ) : (
                  highlights.best.map(session => (
                    <SessionRow key={session.id} session={session} />
                  ))
                )}
              </div>
            </div>

            {/* Sessions to redo */}
            <div className="relative rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6" style={panelStyle("#ff3868")}>
              <CornerFrame color="#ff3868" />
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">[ A travailler ]</p>
                  <h2 className="font-display text-lg uppercase tracking-[0.04em] text-[#f8f0ff]">Sessions a reprendre</h2>
                </div>
                <TrendingUp className="h-5 w-5 text-[#ff3868]" />
              </div>
              <div className="divide-y divide-[#ff3868]/10">
                {highlights.warnings.length === 0 ? (
                  <div className="py-4 font-mono text-xs uppercase tracking-[0.2em] text-[#9b7fb8]">Rien a signaler.</div>
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
          <div className="font-display text-sm uppercase tracking-[0.03em] text-[#f8f0ff]">
            {session.source_provider?.toString().toUpperCase()} . {session.mode}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">
            {session.difficulty} . {formatDate(session.started_at)}
          </div>
        </div>
        <span className="rounded-sm border border-[#00f7ff]/30 bg-[#00f7ff]/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff]">
          {stateLabel(session.state)}
        </span>
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">Manches: {session.total_rounds}</div>
    </div>
  )
}
