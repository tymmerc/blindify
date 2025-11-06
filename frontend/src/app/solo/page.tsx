"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Flame, Headphones, Play, Zap } from "lucide-react"

type Difficulty = "easy" | "normal" | "hard"
type SourceKey = "library" | "top" | "recent"

const difficultyOptions: { key: Difficulty; label: string; caption: string; accent: string }[] = [
  { key: "easy", label: "Echo", caption: "30-second snippets, perfect for warm-up", accent: "from-emerald-500/70 to-teal-600/30" },
  { key: "normal", label: "Pulse", caption: "15-second clips with streak multipliers", accent: "from-purple-500/70 to-indigo-600/30" },
  { key: "hard", label: "Glitch", caption: "7-second challenges for elite ears", accent: "from-pink-500/70 to-rose-600/30" },
]

const sourceOptions: { key: SourceKey; label: string; description: string; icon: React.ReactNode }[] = [
  {
    key: "library",
    label: "Personal Library",
    description: "Blend favourites and discoveries pulled from your connected provider.",
    icon: <Headphones className="h-6 w-6 text-neon" />,
  },
  {
    key: "top",
    label: "Top Rotation",
    description: "Focus on your most played tracks — precision mode for bragging rights.",
    icon: <Flame className="h-6 w-6 text-neon" />,
  },
  {
    key: "recent",
    label: "Recent Waves",
    description: "Spin the most recent additions and resurface forgotten gems.",
    icon: <Zap className="h-6 w-6 text-neon" />,
  },
]

export default function SoloPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [difficulty, setDifficulty] = useState<Difficulty>("normal")
  const [source, setSource] = useState<SourceKey>("library")

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
      } finally {
        if (active) setLoading(false)
      }
    }

    guard()

    return () => {
      active = false
    }
  }, [router])

  const handleStart = () => {
    router.push(`/game?difficulty=${difficulty}&source=${source}`)
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, repeat: Infinity, repeatType: "mirror" }}
          className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm uppercase tracking-[0.5em] text-slate-300"
        >
          Preparing solo mode
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 opacity-50">
        <motion.div
          animate={{ backgroundPosition: ["0% 0%", "160% 160%"] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(168,85,247,0.18), transparent 52%), radial-gradient(circle at 85% 30%, rgba(34,197,94,0.2), transparent 55%), radial-gradient(circle at 50% 80%, rgba(59,130,246,0.18), transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-10">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="text-slate-200">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="text-sm uppercase tracking-[0.5em] text-slate-400">Solo arena</div>
        </div>

        <header className="surface rounded-3xl border border-white/10 p-8">
          <div className="flex flex-col gap-4">
            <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Choose your flow</p>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              Customise your next blind test session.
            </h1>
            <p className="max-w-2xl text-sm text-slate-300">
              Blindify sources real tracks from your connected providers. Each round streams locally on your device while
              the server orchestrates reveals, scoring, and leaderboards.
            </p>
          </div>
        </header>

        <section className="grid gap-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {difficultyOptions.map(option => (
              <button
                key={option.key}
                onClick={() => setDifficulty(option.key)}
                className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 text-left transition hover:border-white/25 ${difficulty === option.key ? "ring-2 ring-[#a855f7] ring-offset-2 ring-offset-black" : ""}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${option.accent} opacity-20`} />
                <div className="relative z-10 flex flex-col gap-3">
                  <span className="text-xs uppercase tracking-[0.5em] text-slate-400">Difficulty</span>
                  <h2 className="text-2xl font-semibold text-white">{option.label}</h2>
                  <p className="text-sm text-slate-300">{option.caption}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {sourceOptions.map(option => (
              <button
                key={option.key}
                onClick={() => setSource(option.key)}
                className={`surface flex h-full flex-col gap-4 rounded-3xl border border-white/10 p-6 text-left transition hover:border-white/25 ${source === option.key ? "ring-2 ring-[#22c55e] ring-offset-2 ring-offset-black" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">{option.icon}</div>
                  <h3 className="text-lg font-semibold text-white">{option.label}</h3>
                </div>
                <p className="text-sm text-slate-300">{option.description}</p>
              </button>
            ))}
          </div>
        </section>

        <footer className="mt-auto flex flex-col items-center gap-4 pb-10">
          <Button onClick={handleStart} size="lg" className="px-12 py-5 text-base">
            <Play className="h-5 w-5" />
            Launch solo game
          </Button>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
            Server syncs: timers, answers, leaderboard. Audio plays locally.
          </p>
        </footer>
      </div>
    </div>
  )
}
