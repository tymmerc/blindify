"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Apple, ChevronRight, Disc3, LogIn, Music3, Radio, Users } from "lucide-react"

const providerButtons = [
  {
    id: "spotify",
    label: "Continue with Spotify",
    href: "/auth/spotify/login",
    description: "Access liked tracks, playlists, and top artists instantly.",
    icon: <Music3 className="h-5 w-5" />,
  },
  {
    id: "deezer",
    label: "Connect Deezer",
    href: "/auth/deezer/login",
    description: "Bring Flow favourites and curated selections.",
    icon: <Radio className="h-5 w-5" />,
  },
  {
    id: "apple",
    label: "Link Apple Music",
    href: "/auth/apple/login",
    description: "Use your personal catalogue via MusicKit.",
    icon: <Apple className="h-5 w-5" />,
  },
]

export default function AuthLoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [guestLoading, setGuestLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function verify() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (me) {
          router.replace("/menu")
          return
        }
      } finally {
        if (active) setChecking(false)
      }
    }

    verify()

    return () => {
      active = false
    }
  }, [router])

  async function handleGuestMode() {
    try {
      setGuestLoading(true)
      setError(null)
      await api.startGuestSession()
      router.replace("/menu")
    } catch (err) {
      console.error(err)
      setError("Unable to create a guest session. Please try again.")
    } finally {
      setGuestLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, repeat: Infinity, repeatType: "mirror" }}
          className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm uppercase tracking-[0.5em] text-slate-300"
        >
          Checking session
        </motion.div>
      </div>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0">
        <motion.div
          className="absolute inset-0 opacity-50"
          animate={{ backgroundPosition: ["0% 0%", "160% 160%"] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(168,85,247,0.22), transparent 55%), radial-gradient(circle at 80% 20%, rgba(34,197,94,0.2), transparent 55%), radial-gradient(circle at 40% 85%, rgba(59,130,246,0.18), transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-16 px-6 py-16 lg:flex-row lg:items-center">
        <section className="flex-1 space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.5em] text-slate-300">
            <Disc3 className="h-4 w-4 text-neon" />
            Blindify
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white sm:text-5xl">Blindify — Play your music differently.</h1>
            <p className="text-sm text-slate-300">
              Sync your favourite providers, upload local snippets, and compete in a glassy, neon-soaked blind test
              arena. The server handles metadata and scoring while playback stays on-device.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="surface rounded-2xl border border-white/10 p-5">
              <p className="text-sm font-semibold text-white">Universal libraries</p>
              <p className="mt-2 text-xs text-slate-300">Spotify, Deezer, Apple Music, local uploads &mdash; one game.</p>
            </div>
            <div className="surface rounded-2xl border border-white/10 p-5">
              <p className="text-sm font-semibold text-white">Secure by design</p>
              <p className="mt-2 text-xs text-slate-300">Tokens stored in encrypted sessions; audio never streams from our servers.</p>
            </div>
          </div>
        </section>

        <section className="flex-1">
          <div className="surface rounded-3xl border border-white/15 p-8">
            <div className="mb-6 space-y-2 text-center">
              <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Connect a provider</p>
              <h2 className="text-2xl font-semibold text-white">Pick your starting point</h2>
            </div>
            <div className="space-y-4">
              {providerButtons.map(provider => (
                <a
                  key={provider.id}
                  href={provider.href}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 transition hover:border-white/25"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/40">
                    {provider.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{provider.label}</p>
                    <p className="text-xs text-slate-300">{provider.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </a>
              ))}
            </div>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.5em] text-slate-400">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <Button
              onClick={handleGuestMode}
              disabled={guestLoading}
              variant="outline"
              className="w-full justify-center gap-3 text-slate-200 hover:text-white"
            >
              <Users className="h-4 w-4" />
              {guestLoading ? "Creating guest session..." : "Continue as guest"}
            </Button>

            {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

            <p className="mt-6 text-center text-xs text-slate-400">
              Having trouble?{" "}
              <button
                type="button"
                className="text-neon underline-offset-4 hover:underline"
                onClick={() => router.push("/")}
              >
                Return to landing page
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
