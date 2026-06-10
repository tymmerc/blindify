"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { GameSessionSummary, UserSummary, UserStats } from "@/lib/types"
import { BottomNav } from "@/components/BottomNav"

const achievements = [
  { icon: "TROPHY", name: "Premiere victoire", desc: "Gagner votre premiere partie", unlocked: true },
  { icon: "FIRE", name: "En feu", desc: "10 bonnes reponses d'affilee", unlocked: true },
  { icon: "BOLT", name: "Eclair", desc: "Repondre en moins de 3 secondes", unlocked: true },
  { icon: "PERFECT", name: "Perfection", desc: "Score parfait 20/20", unlocked: false },
  { icon: "MUSIC", name: "Melomane", desc: "Jouer 100 parties", unlocked: true },
  { icon: "CROWN", name: "Champion", desc: "Gagner 50 parties en multijoueur", unlocked: false },
]

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
  const displayName = user?.username || "Player 1"
  const providerLabel = user?.provider ? user.provider.toUpperCase() : "BLINDIFY"
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
      { label: "Parties", value: `${totalGames}`, color: "#ff2ec8" },
      { label: "Precision", value: accuracy, color: "#00f7ff" },
      { label: "Temps moyen", value: avgTime ? `${avgTime} ms` : "-", color: "#a855f7" },
      { label: "Serie max", value: `${bestStreak}`, color: "#ffea00" },
    ]
  }, [stats])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff] text-glow-cyan">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#f8f0ff] pb-28">
      <div className="mx-auto max-w-3xl px-5 pt-10">
        {/* Header nav */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/modes"
            className="inline-flex items-center gap-2 rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff] transition hover:bg-[#00f7ff]/10 hover:shadow-glow-cyan"
          >
            Retour
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-sm border border-[#ff2ec8]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#ff2ec8] transition hover:bg-[#ff2ec8]/10 hover:shadow-glow-pink"
          >
            Settings
          </Link>
        </div>

        {/* Avatar + name card */}
        <div
          className="relative mb-6 rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-8 text-center"
          style={{
            borderColor: "rgba(255,46,200,0.4)",
            boxShadow: "0 0 24px rgba(255,46,200,0.18), inset 0 0 14px rgba(255,46,200,0.06)",
          }}
        >
          <CornerFrame color="#ff2ec8" />
          <div
            className="relative mx-auto mb-4 h-28 w-28 overflow-hidden rounded-full border-2"
            style={{
              borderColor: "#ff2ec8",
              boxShadow: "0 0 24px rgba(255,46,200,0.5), inset 0 0 12px rgba(0,247,255,0.2)",
            }}
          >
            {user?.avatar ? (
              <Image
                src={user.avatar}
                alt={displayName}
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#ff2ec8] to-[#a855f7] font-display text-4xl text-white">
                {initials}
              </div>
            )}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff] mb-2">
            [ Player Card ]
          </p>
          <h1 className="font-display text-4xl uppercase tracking-[0.04em] text-glow-pink">{displayName}</h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[#9b7fb8]">Account {providerLabel}</p>
          <div
            className="mt-4 inline-flex items-center gap-2 rounded-sm border px-4 py-2 font-display text-sm uppercase tracking-[0.1em]"
            style={{
              borderColor: "#ffea00",
              background: "rgba(255,234,0,0.08)",
              color: "#ffea00",
              boxShadow: "0 0 12px rgba(255,234,0,0.35), inset 0 0 6px rgba(255,234,0,0.15)",
              textShadow: "0 0 8px rgba(255,234,0,0.7)",
            }}
          >
            Level {Math.max(1, Math.floor((stats?.totalXp ?? 0) / 100) + 1)}
          </div>
        </div>

        {/* Stats grid */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statCards.map(item => (
            <div
              key={item.label}
              className="relative rounded-xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-5 text-center transition-all hover:-translate-y-0.5"
              style={{
                borderColor: `${item.color}55`,
                boxShadow: `0 0 12px ${item.color}1a, inset 0 0 6px ${item.color}0d`,
              }}
            >
              <CornerFrame color={item.color} />
              <div
                className="font-display text-2xl"
                style={{ color: item.color, textShadow: `0 0 10px ${item.color}` }}
              >
                {item.value}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-[#9b7fb8]">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Achievements */}
        <section className="mb-10">
          <h2 className="mb-6 font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">[ Achievements ]</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {achievements.map(achievement => (
              <div
                key={achievement.name}
                className="relative rounded-xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-5 text-center transition-all hover:-translate-y-1"
                style={{
                  borderColor: achievement.unlocked ? "rgba(255,46,200,0.4)" : "rgba(155,127,184,0.15)",
                  boxShadow: achievement.unlocked
                    ? "0 0 16px rgba(255,46,200,0.25), inset 0 0 8px rgba(255,46,200,0.08)"
                    : "none",
                  opacity: achievement.unlocked ? 1 : 0.45,
                }}
              >
                {achievement.unlocked && <CornerFrame color="#ff2ec8" />}
                <div
                  className="mb-3 font-display text-xl uppercase tracking-[0.1em]"
                  style={achievement.unlocked ? { color: "#ffea00", textShadow: "0 0 8px rgba(255,234,0,0.7)" } : { color: "#9b7fb8" }}
                >
                  {achievement.icon}
                </div>
                <div className="font-display text-sm uppercase tracking-[0.05em] text-[#f8f0ff]">{achievement.name}</div>
                <p className="mt-1 text-xs text-[#9b7fb8]">{achievement.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recent games */}
        <section>
          <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">[ Recent runs ]</h2>
          <div
            className="relative rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] divide-y divide-[#ff2ec8]/10"
            style={{
              borderColor: "rgba(0,247,255,0.3)",
              boxShadow: "0 0 14px rgba(0,247,255,0.1), inset 0 0 8px rgba(0,247,255,0.04)",
            }}
          >
            <CornerFrame color="#00f7ff" />
            {history.length === 0 ? (
              <div className="py-6 text-center font-mono text-xs uppercase tracking-[0.2em] text-[#9b7fb8]">No game recorded.</div>
            ) : (
              history.slice(0, 6).map(game => (
                <div key={game.id} className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-[#ff2ec8]/[0.04]">
                  <div>
                    <h4 className="font-display text-base uppercase tracking-[0.04em] text-[#f8f0ff]">
                      {game.mode ? game.mode.charAt(0).toUpperCase() + game.mode.slice(1) : "Partie"} . {game.difficulty ?? "normal"}
                    </h4>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">{formatDate(game.started_at)} . {game.source_provider ?? "-"}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-sm border border-[#00f7ff]/30 bg-[#00f7ff]/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff]">
                      {stateLabel(game.state)}
                    </span>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">{game.total_rounds ?? 0} manches</div>
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
