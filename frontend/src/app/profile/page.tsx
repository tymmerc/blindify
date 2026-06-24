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
      { label: "Parties", value: `${totalGames}`, color: "#c65133" },
      { label: "Precision", value: accuracy, color: "#e0a32e" },
      { label: "Temps moyen", value: avgTime ? `${avgTime} ms` : "-", color: "#7d9471" },
      { label: "Serie max", value: `${bestStreak}`, color: "#a8b8c8" },
    ]
  }, [stats])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
        Chargement...
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#2e2014] pb-28">
      <div className="mx-auto max-w-3xl px-5 pt-10">
        {/* Header nav */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/modes"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#c65133] bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#c65133] transition hover:bg-[#c65133] hover:text-[#f4ecdb]"
          >
            Settings
          </Link>
        </div>

        {/* Avatar + name card */}
        <div className="mb-6 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-8 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <div className="relative mx-auto mb-4 h-28 w-28 overflow-hidden rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] shadow-[3px_3px_0_rgba(46,32,20,.25)]">
            {user?.avatar ? (
              <Image
                src={user.avatar}
                alt={displayName}
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[#c65133] font-display text-4xl font-semibold text-[#f4ecdb]">
                {initials}
              </div>
            )}
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
            Ta pochette
          </p>
          <h1 className="font-display text-4xl font-semibold text-[#2e2014]">{displayName}</h1>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Compte {providerLabel}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#e0a32e] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
            Niveau {Math.max(1, Math.floor((stats?.totalXp ?? 0) / 100) + 1)}
          </div>
        </div>

        {/* Stats grid */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statCards.map(item => (
            <div
              key={item.label}
              className="rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-5 text-center shadow-[4px_4px_0_rgba(46,32,20,.12)] transition-all hover:-translate-y-0.5"
              style={{ borderTop: `4px solid ${item.color}` }}
            >
              <div className="font-display text-2xl font-bold text-[#2e2014]">
                {item.value}
              </div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a7558]">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Achievements */}
        <section className="mb-10">
          <h2 className="mb-6 text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Achievements</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {achievements.map(achievement => (
              <div
                key={achievement.name}
                className={`rounded-md p-5 text-center transition-all hover:-translate-y-1 ${
                  achievement.unlocked
                    ? "border-2 border-[#2e2014] bg-[#ece1c8] shadow-[4px_4px_0_rgba(46,32,20,.18)]"
                    : "border-[1.5px] border-dashed border-[rgba(46,32,20,.3)] bg-transparent opacity-50"
                }`}
              >
                <div
                  className="mb-3 font-display text-xl font-semibold"
                  style={{ color: achievement.unlocked ? "#c65133" : "#8a7558" }}
                >
                  {achievement.icon}
                </div>
                <div className="font-display text-sm font-semibold text-[#2e2014]">{achievement.name}</div>
                <p className="mt-1 text-xs text-[#6b573f]">{achievement.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recent games */}
        <section>
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Recent runs</h2>
          <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] shadow-[4px_4px_0_rgba(46,32,20,.18)] divide-y divide-[rgba(46,32,20,.15)]">
            {history.length === 0 ? (
              <div className="py-6 text-center text-xs font-bold uppercase tracking-[0.15em] text-[#8a7558]">No game recorded.</div>
            ) : (
              history.slice(0, 6).map(game => (
                <div key={game.id} className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-[#efe5d0]">
                  <div>
                    <h4 className="font-display text-base font-semibold text-[#2e2014]">
                      {game.mode ? game.mode.charAt(0).toUpperCase() + game.mode.slice(1) : "Partie"} · {game.difficulty ?? "normal"}
                    </h4>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">{formatDate(game.started_at)} · {game.source_provider ?? "-"}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full border-[1.5px] border-[#2e2014] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                      {stateLabel(game.state)}
                    </span>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558]">{game.total_rounds ?? 0} manche(s)</div>
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
