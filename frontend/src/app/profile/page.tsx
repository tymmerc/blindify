"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { UserSummary } from "@/lib/types"

const stats = [
  { label: "Parties", value: "147" },
  { label: "Précision", value: "87%" },
  { label: "Points", value: "2 840" },
  { label: "Série max", value: "18" },
]

const achievements = [
  { icon: "🏆", name: "Première victoire", desc: "Gagner votre première partie", unlocked: true },
  { icon: "🔥", name: "En feu", desc: "10 bonnes réponses d'affilée", unlocked: true },
  { icon: "⚡", name: "Éclair", desc: "Répondre en moins de 3 secondes", unlocked: true },
  { icon: "💯", name: "Perfection", desc: "Score parfait 20/20", unlocked: false },
  { icon: "🎵", name: "Mélomane", desc: "Jouer 100 parties", unlocked: true },
  { icon: "👑", name: "Champion", desc: "Gagner 50 parties en multijoueur", unlocked: false },
]

const games = [
  { title: "Top 2024", meta: "Aujourd'hui à 14:32 · Solo", score: "18/20" },
  { title: "Workout Mix", meta: "Hier à 19:15 · Solo", score: "15/20" },
  { title: "Chill Vibes", meta: "Il y a 2 jours · Multijoueur", score: "20/20" },
  { title: "Road Trip", meta: "Il y a 3 jours · Solo", score: "16/20" },
  { title: "Titres likés", meta: "Il y a 4 jours · Solo", score: "19/20" },
]

export default function ProfilePage() {
  const router = useRouter()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)

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
  const initials = useMemo(() => {
    if (!displayName) return "?"
    return displayName
      .split(" ")
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  }, [displayName])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">
        Chargement
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-16">
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
          <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-[var(--ma-gradient)] text-4xl font-bold shadow-[0_12px_32px_rgba(168,85,247,0.3)]">
            {initials}
          </div>
          <h1 className="text-4xl font-bold tracking-[-0.04em]">{displayName}</h1>
          <p className="mt-2 text-sm text-[var(--ma-muted)]">Membre depuis mars 2024</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(168,85,247,0.12)] px-4 py-2 text-sm font-semibold">
            <span>⭐</span>
            <span>Niveau 12 · Expert</span>
          </div>
        </div>

        <div className="ma-stat-grid mb-10">
          {stats.map(item => (
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
            {games.map(game => (
              <div key={game.title} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <h4 className="text-base font-semibold">{game.title}</h4>
                  <p className="text-sm text-[var(--ma-muted)]">{game.meta}</p>
                </div>
                <div
                  className="text-2xl font-bold"
                  style={{ backgroundImage: "var(--ma-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}
                >
                  {game.score}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
