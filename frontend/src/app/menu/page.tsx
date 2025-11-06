"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Disc3,
  Headphones,
  Layers,
  Play,
  Radio,
  Settings,
  Trophy,
  UploadCloud,
  User,
} from "lucide-react"

import { api, type CurrentUserPayload } from "@/lib/api"
import type { UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"

const modeCards = [
  {
    href: "/solo",
    title: "Solo Mode",
    description: "Generate adaptive rounds from your connected libraries and uploaded snippets.",
    icon: Play,
    accent: "from-purple-500/70 to-purple-700/30",
    cta: "Launch solo session",
  },
  {
    href: "/multiplayer",
    title: "Multiplayer Rooms",
    description: "Create a code, sync audio over WebSockets, and battle friends with live streaks.",
    icon: Radio,
    accent: "from-emerald-500/70 to-teal-600/30",
    cta: "Host a room",
    disabled: false,
  },
  {
    href: "/upload",
    title: "Local Uploads",
    description: "Drop short MP3 clips to craft surprise rounds and custom blind tests.",
    icon: UploadCloud,
    accent: "from-sky-500/70 to-indigo-600/30",
    cta: "Add local tracks",
  },
]

const quickLinks = [
  { href: "/profile", label: "Profile & badges", icon: User },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/history", label: "Match history", icon: Layers },
  { href: "/stats", label: "Analytics", icon: Headphones },
]

export default function MenuPage() {
  const router = useRouter()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)

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

  const user: UserSummary | null = userPayload?.user ?? null
  const providerLabel = useMemo(() => {
    if (!user) return ""
    switch (user.provider) {
      case "spotify":
        return "Spotify"
      case "deezer":
        return "Deezer"
      case "apple":
        return "Apple Music"
      case "local":
        return "Local uploads"
      case "guest":
      default:
        return "Guest mode"
    }
  }, [user])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, repeat: Infinity, repeatType: "mirror" }}
          className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm uppercase tracking-[0.5em] text-slate-300"
        >
          Loading menu
        </motion.div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0">
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-40"
          animate={{ backgroundPosition: ["0% 0%", "160% 160%"] }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(168,85,247,0.22), transparent 52%), radial-gradient(circle at 80% 30%, rgba(34,197,94,0.2), transparent 55%), radial-gradient(circle at 50% 100%, rgba(59,130,246,0.2), transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-black/60 p-8 backdrop-blur-2xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="surface flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10">
              <Disc3 className="h-7 w-7 text-neon" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Welcome back</p>
              <h1 className="text-3xl font-bold text-white">
                {user.username || user.provider_id}
              </h1>
              <p className="text-sm text-slate-400">
                Connected via <span className="text-neon">{providerLabel}</span> — ready for new rounds?
              </p>
            </div>
          </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/settings"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <Button
                onClick={async () => {
                  await api.logout()
                  router.replace("/auth/login")
                }}
                className="gap-2"
              >
                Logout
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
        </header>

        <section className="grid gap-9 lg:grid-cols-3">
          {modeCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_25px_60px_rgba(12,12,34,0.45)] ${card.disabled ? "opacity-70" : ""}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-25`} />
              <div className="relative flex h-full flex-col gap-6 p-8">
                <div className="flex items-center gap-4">
                  <div className="surface flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10">
                    <card.icon className="h-6 w-6 text-neon" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">{card.title}</h2>
                </div>
                <p className="text-sm text-slate-300 flex-1">{card.description}</p>
                <Button
                  asChild
                  variant={card.disabled ? "outline" : "default"}
                  className={card.disabled ? "cursor-not-allowed opacity-60" : ""}
                  disabled={card.disabled}
                >
                  <Link href={card.href}>
                    {card.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </motion.div>
          ))}
        </section>

        <section className="surface rounded-3xl border border-white/10 p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Quick navigation</p>
              <h3 className="text-xl font-semibold text-white">Dive deeper</h3>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-medium text-slate-200 transition hover:border-white/25 hover:text-white"
              >
                <link.icon className="h-5 w-5 text-neon transition group-hover:scale-110" />
                <span>{link.label}</span>
                <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition group-hover:text-neon" />
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-12 rounded-3xl border border-white/10 bg-black/50 p-8 backdrop-blur-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-3">
              <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Tip</p>
              <h3 className="text-2xl font-semibold text-white">Sync more providers for richer rounds</h3>
              <p className="text-sm text-slate-300">
                Plug additional accounts to unlock cross-platform rounds instantly. Blindify only pulls metadata —
                playback stays on your devices for zero-latency precision.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/settings/providers"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
              >
                Manage providers
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
