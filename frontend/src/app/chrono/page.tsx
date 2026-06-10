"use client"

import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import ChronoGameLoader from "./ChronoGameLoader"

export const dynamic = "force-dynamic"

const ACCENT = "#a855f7"

const durationOptions = [
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
]

function ChronoSelector() {
  const router = useRouter()
  const [quickUrl, setQuickUrl] = useState("")
  const [quickError, setQuickError] = useState<string | null>(null)
  const [duration, setDuration] = useState(180)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = quickUrl.trim()
    if (!trimmed) return
    setQuickError(null)
    const encoded = encodeURIComponent(trimmed)
    router.push(`/chrono?source=quickplay&quickUrl=${encoded}&duration=${duration}`)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] px-4 py-10 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.35em]" style={{ color: ACCENT }}>
              MODE CHRONO
            </p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.04em]">
              Devine un max de titres avant la fin du chrono
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push("/modes")}
            className="rounded-full border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            Retour au menu
          </Button>
        </div>

        {/* Main card */}
        <SurfaceCard className="flex flex-col gap-5 rounded-2xl border-[var(--border-subtle)] bg-[var(--bg-surface)] p-7">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Colle un lien</h2>
              <span
                className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.28em]"
                style={{ color: ACCENT, borderColor: ACCENT }}
              >
                Contre la montre
              </span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Profil ou playlist Spotify / Deezer.
              Les titres s'enchainent, devine-les avant que le temps ne s'ecoule !
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* URL input */}
            <div className="space-y-1.5">
              <label htmlFor="playlist-url" className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">
                Lien de playlist ou profil
              </label>
              <input
                id="playlist-url"
                type="url"
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-focus)]"
              />
            </div>

            {/* Duration selector */}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">
                Duree du chrono
              </label>
              <div className="flex gap-2">
                {durationOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDuration(opt.value)}
                    className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition ${
                      duration === opt.value
                        ? "border-[var(--border-focus)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-faint)] hover:border-[var(--border-input)] hover:text-[var(--text-muted)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {quickError && <p className="text-xs text-red-300">{quickError}</p>}

            <Button
              type="submit"
              variant="outline"
              disabled={!quickUrl.trim()}
              className="w-full justify-center rounded-xl border-2 px-5 py-3 text-sm font-semibold transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              style={{ borderColor: ACCENT, color: ACCENT, backgroundColor: "transparent" }}
            >
              Lancer le chrono
            </Button>
          </form>

          {/* Supported URLs */}
          <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-faint)]">
            <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5">spotify.com/user/...</span>
            <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5">spotify.com/playlist/...</span>
            <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5">deezer.com/profile/...</span>
            <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5">deezer.com/playlist/...</span>
          </div>
        </SurfaceCard>

        {/* Info cards */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <SurfaceCard className="flex-1 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Comment ca marche</h3>
              <span
                className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.28em]"
                style={{ color: ACCENT, borderColor: ACCENT }}
              >
                Rapide
              </span>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)] leading-relaxed list-disc list-inside">
              <li>Le chrono demarre, les titres s'enchainent automatiquement</li>
              <li>Devine le titre et/ou l'artiste le plus vite possible</li>
              <li>Pas de pause entre les titres -- chaque seconde compte</li>
            </ul>
          </SurfaceCard>

          <SurfaceCard className="flex-1 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Scoring</h3>
              <span
                className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.28em]"
                style={{ color: ACCENT, borderColor: ACCENT }}
              >
                Points
              </span>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)] leading-relaxed list-disc list-inside">
              <li>Titre correct = 40 pts, Artiste correct = 30 pts</li>
              <li>Bonus vitesse selon ta rapidite</li>
              <li>Enchaine les bonnes reponses pour le streak bonus</li>
            </ul>
          </SurfaceCard>
        </div>

      </div>
    </div>
  )
}

function ChronoPageInner() {
  const searchParams = useSearchParams()
  const hasConfig = Boolean(searchParams.get("source") && searchParams.get("quickUrl"))

  if (!hasConfig) {
    return <ChronoSelector />
  }

  return <ChronoGameLoader />
}

export default function ChronoPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] text-sm text-[var(--text-muted)]">
          Chargement...
        </div>
      }
    >
      <ChronoPageInner />
    </Suspense>
  )
}
