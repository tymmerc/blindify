"use client"

import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import ChronoGameLoader from "./ChronoGameLoader"

export const dynamic = "force-dynamic"

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
    <div className="min-h-screen px-4 py-10 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-terra-txt">
              Mode · Chrono
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.05]">
              Devine un max de titres avant la fin du <em className="font-medium italic text-terra-txt">chrono</em>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/modes")}
            className="rounded-full border-[1.5px] border-line bg-paper-deep px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-ink-block hover:text-on-ink"
          >
            Retour au menu
          </button>
        </div>

        {/* Main card */}
        <div className="flex flex-col gap-5 rounded-md border-2 border-line bg-paper-deep p-7 shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-2xl font-semibold text-ink">Colle un lien</h2>
              <span className="rounded-full border-[1.5px] border-terra bg-terra px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-ink">
                Contre la montre
              </span>
            </div>
            <p className="text-sm text-ink-2">
              Profil ou playlist Spotify / Deezer.
              Les titres s'enchaînent, devine-les avant que le temps ne s'écoule !
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* URL input */}
            <div className="space-y-1.5">
              <label htmlFor="playlist-url" className="text-[11px] font-bold uppercase tracking-[0.22em] text-sourd">
                Lien de playlist ou profil
              </label>
              <input
                id="playlist-url"
                type="url"
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
                className="w-full rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-well px-4 py-3 text-sm text-ink outline-none transition placeholder:italic placeholder:text-pale focus:border-terra"
              />
            </div>

            {/* Duration selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-sourd">
                Durée du chrono
              </label>
              <div className="flex gap-2">
                {durationOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDuration(opt.value)}
                    className={`flex-1 rounded-md border-[1.5px] py-2.5 font-display text-sm font-semibold transition ${
                      duration === opt.value
                        ? "border-line bg-terra text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))]"
                        : "border-[rgb(var(--c-line)/.35)] bg-well text-ink-2 hover:border-line"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {quickError && <p className="text-xs font-bold text-rouge-txt">{quickError}</p>}

            <button
              type="submit"
              disabled={!quickUrl.trim()}
              className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Lancer le chrono
            </button>
          </form>

          {/* Supported URLs */}
          <div className="flex flex-wrap gap-2 text-[10px] text-sourd">
            <span className="rounded-full border-[1.5px] border-[rgb(var(--c-line)/.22)] px-2.5 py-0.5">spotify.com/user/...</span>
            <span className="rounded-full border-[1.5px] border-[rgb(var(--c-line)/.22)] px-2.5 py-0.5">spotify.com/playlist/...</span>
            <span className="rounded-full border-[1.5px] border-[rgb(var(--c-line)/.22)] px-2.5 py-0.5">deezer.com/profile/...</span>
            <span className="rounded-full border-[1.5px] border-[rgb(var(--c-line)/.22)] px-2.5 py-0.5">deezer.com/playlist/...</span>
          </div>
        </div>

        {/* Info cards */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-3 rounded-md border-[1.5px] border-[rgb(var(--c-line)/.22)] bg-paper-deep p-6 text-left shadow-[4px_4px_0_rgb(var(--c-shadow)/.12)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">Comment ça marche</h3>
              <span className="rounded-full border-[1.5px] border-line px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
                Rapide
              </span>
            </div>
            <ul className="space-y-2 text-sm text-ink-2 leading-relaxed list-disc list-inside">
              <li>Le chrono démarre, les titres s'enchaînent automatiquement</li>
              <li>Devine le titre et/ou l'artiste le plus vite possible</li>
              <li>Pas de pause entre les titres -- chaque seconde compte</li>
            </ul>
          </div>

          <div className="flex-1 space-y-3 rounded-md border-[1.5px] border-[rgb(var(--c-line)/.22)] bg-paper-deep p-6 text-left shadow-[4px_4px_0_rgb(var(--c-shadow)/.12)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">Scoring</h3>
              <span className="rounded-full border-[1.5px] border-line px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
                Points
              </span>
            </div>
            <ul className="space-y-2 text-sm text-ink-2 leading-relaxed list-disc list-inside">
              <li>Titre correct = 1 pt, Artiste correct = 1 pt</li>
              <li>Pas de bonus : le score = tes bonnes réponses</li>
              <li>Enchaîne les bonnes réponses pour la série (pour le style)</li>
            </ul>
          </div>
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
        <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-sourd">
          Chargement...
        </div>
      }
    >
      <ChronoPageInner />
    </Suspense>
  )
}
