"use client"

import Link from "next/link"
import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import GameClient from "../game/GameClient"

export const dynamic = "force-dynamic"

const roundOptions = [
  { label: "5 titres", value: 5 },
  { label: "10 titres", value: 10 },
  { label: "15 titres", value: 15 },
  { label: "20 titres", value: 20 },
]

const tutorialSteps = [
  {
    step: "1",
    title: "Ouvre Spotify ou Deezer",
    desc: "Va sur ton profil ou une playlist publique.",
  },
  {
    step: "2",
    title: "Copie le lien",
    desc: "Partager → Copier le lien (ou copie l’URL du navigateur).",
  },
  {
    step: "3",
    title: "Colle ici et joue !",
    desc: "On pioche des titres au hasard dans les playlists publiques.",
  },
]

function SoloSelector() {
  const router = useRouter()
  const [quickUrl, setQuickUrl] = useState("")
  const [quickError, setQuickError] = useState<string | null>(null)
  const [roundCount, setRoundCount] = useState(10)

  const handleQuickPlay = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = quickUrl.trim()
    if (!trimmed) return
    setQuickError(null)
    const encoded = encodeURIComponent(trimmed)
    router.push(`/solo?source=quickplay&quickUrl=${encoded}&count=${roundCount}`)
  }

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-16">
      <div className="mx-auto max-w-2xl px-6 pt-10 space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Solo</p>
            <h1 className="text-3xl font-bold tracking-[-0.03em]">Lancer un blindtest</h1>
            <p className="text-sm text-[var(--ma-muted)]">Colle un lien de profil ou playlist pour jouer.</p>
          </div>
          <Link
            href="/modes"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--ma-border-strong)] bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
          >
            ← Retour
          </Link>
        </div>

        {/* Quick Play — paste URL */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-pink-500/5 p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Lien Spotify ou Deezer</h2>
              <span className="rounded-full bg-purple-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-400">
                Sans compte
              </span>
            </div>
            <p className="text-sm text-white/60">
              Colle un lien de profil ou de playlist publique. On pioche des titres au hasard pour ton blindtest.
            </p>
            <form onSubmit={handleQuickPlay} className="space-y-3">
              <input
                type="url"
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
                className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-purple-500/50"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  {roundOptions.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRoundCount(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        roundCount === opt.value
                          ? "border-purple-500/50 bg-purple-500/20 text-purple-300"
                          : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Button
                  type="submit"
                  disabled={!quickUrl.trim()}
                  className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(168,85,247,0.25)] hover:brightness-110 disabled:opacity-50"
                >
                  Jouer
                </Button>
              </div>
            </form>
            {quickError && <p className="text-xs text-red-400">{quickError}</p>}
            <div className="flex flex-wrap gap-2 text-[11px] text-white/30">
              <span className="rounded-full border border-white/10 px-2.5 py-0.5">open.spotify.com/user/...</span>
              <span className="rounded-full border border-white/10 px-2.5 py-0.5">deezer.com/profile/...</span>
              <span className="rounded-full border border-white/10 px-2.5 py-0.5">...playlist/...</span>
            </div>
          </div>
        </div>

        {/* Mini tutorial */}
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-white/40 text-center">Comment ça marche</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {tutorialSteps.map(s => (
              <div key={s.step} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-400">
                  {s.step}
                </span>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-white/50">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SoloPageInner() {
  const searchParams = useSearchParams()
  const hasConfig = Boolean(searchParams.get("source") || searchParams.get("playlistId"))

  if (!hasConfig) {
    return <SoloSelector />
  }

  return (
    <GameClient />
  )
}

export default function SoloPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">
          Chargement…
        </div>
      }
    >
      <SoloPageInner />
    </Suspense>
  )
}
