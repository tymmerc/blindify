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
    <div className="min-h-screen px-4 py-10 text-[#2e2014] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">
              Mode · Chrono
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.05]">
              Devine un max de titres avant la fin du <em className="font-medium italic text-[#c65133]">chrono</em>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/modes")}
            className="rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour au menu
          </button>
        </div>

        {/* Main card */}
        <div className="flex flex-col gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-7 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-2xl font-semibold text-[#2e2014]">Colle un lien</h2>
              <span className="rounded-full border-[1.5px] border-[#c65133] bg-[#c65133] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]">
                Contre la montre
              </span>
            </div>
            <p className="text-sm text-[#6b573f]">
              Profil ou playlist Spotify / Deezer.
              Les titres s'enchainent, devine-les avant que le temps ne s'ecoule !
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* URL input */}
            <div className="space-y-1.5">
              <label htmlFor="playlist-url" className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
                Lien de playlist ou profil
              </label>
              <input
                id="playlist-url"
                type="url"
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
                className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-sm text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
              />
            </div>

            {/* Duration selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
                Duree du chrono
              </label>
              <div className="flex gap-2">
                {durationOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDuration(opt.value)}
                    className={`flex-1 rounded-md border-[1.5px] py-2.5 font-display text-sm font-semibold transition ${
                      duration === opt.value
                        ? "border-[#2e2014] bg-[#c65133] text-[#f4ecdb] shadow-[2px_2px_0_#2e2014]"
                        : "border-[rgba(46,32,20,.35)] bg-[#efe5d0] text-[#6b573f] hover:border-[#2e2014]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {quickError && <p className="text-xs font-bold text-[#9c2f1d]">{quickError}</p>}

            <button
              type="submit"
              disabled={!quickUrl.trim()}
              className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Lancer le chrono
            </button>
          </form>

          {/* Supported URLs */}
          <div className="flex flex-wrap gap-2 text-[10px] text-[#8a7558]">
            <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5">spotify.com/user/...</span>
            <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5">spotify.com/playlist/...</span>
            <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5">deezer.com/profile/...</span>
            <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5">deezer.com/playlist/...</span>
          </div>
        </div>

        {/* Info cards */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-6 text-left shadow-[4px_4px_0_rgba(46,32,20,.12)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[#2e2014]">Comment ca marche</h3>
              <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                Rapide
              </span>
            </div>
            <ul className="space-y-2 text-sm text-[#6b573f] leading-relaxed list-disc list-inside">
              <li>Le chrono demarre, les titres s'enchainent automatiquement</li>
              <li>Devine le titre et/ou l'artiste le plus vite possible</li>
              <li>Pas de pause entre les titres -- chaque seconde compte</li>
            </ul>
          </div>

          <div className="flex-1 space-y-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-6 text-left shadow-[4px_4px_0_rgba(46,32,20,.12)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[#2e2014]">Scoring</h3>
              <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                Points
              </span>
            </div>
            <ul className="space-y-2 text-sm text-[#6b573f] leading-relaxed list-disc list-inside">
              <li>Titre correct = 40 pts, Artiste correct = 30 pts</li>
              <li>Bonus vitesse selon ta rapidite</li>
              <li>Enchaine les bonnes reponses pour le streak bonus</li>
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
        <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
          Chargement...
        </div>
      }
    >
      <ChronoPageInner />
    </Suspense>
  )
}
