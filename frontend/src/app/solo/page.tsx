"use client"

import Link from "next/link"
import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import GameClient from "../game/GameClient"

export const dynamic = "force-dynamic"

const ACCENT = "#a855f7"

const roundOptions = [5, 10, 15, 20]

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
    <div className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.35em]" style={{ color: ACCENT }}>
              MODE SOLO
            </p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.04em]">
              Lance un blind test avec n'importe quelle playlist
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push("/modes")}
            className="rounded-full border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            Retour au menu
          </Button>
        </div>

        {/* Main card */}
        <SurfaceCard className="flex flex-col gap-5 rounded-2xl border-white/10 bg-[#0c0c0c] p-7">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-white">Colle un lien</h2>
              <span
                className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.28em]"
                style={{ color: ACCENT, borderColor: ACCENT }}
              >
                Aucun compte requis
              </span>
            </div>
            <p className="text-sm text-white/70">
              Profil ou playlist Spotify / Deezer.
              On pioche des titres au hasard — devine le titre et l'artiste !
            </p>
          </div>

          <form onSubmit={handleQuickPlay} className="space-y-4">
            {/* URL input */}
            <div className="space-y-1.5">
              <label htmlFor="playlist-url" className="text-xs uppercase tracking-[0.25em] text-white/60">
                Lien de playlist ou profil
              </label>
              <input
                id="playlist-url"
                type="url"
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
                className="w-full rounded-xl border border-white/15 bg-[#0c0c0c] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
              />
            </div>

            {/* Round count */}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-[0.25em] text-white/60">
                Nombre de titres
              </label>
              <div className="flex gap-2">
                {roundOptions.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRoundCount(n)}
                    className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition ${
                      roundCount === n
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/10 bg-[#0f0f0f] text-white/40 hover:border-white/20 hover:text-white/60"
                    }`}
                  >
                    {n}
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
              Lancer le blind test
            </Button>
          </form>

          {/* Supported URLs */}
          <div className="flex flex-wrap gap-2 text-[10px] text-white/30">
            <span className="rounded-full border border-white/8 px-2.5 py-0.5">spotify.com/user/...</span>
            <span className="rounded-full border border-white/8 px-2.5 py-0.5">spotify.com/playlist/...</span>
            <span className="rounded-full border border-white/8 px-2.5 py-0.5">deezer.com/profile/...</span>
            <span className="rounded-full border border-white/8 px-2.5 py-0.5">deezer.com/playlist/...</span>
          </div>
        </SurfaceCard>

        {/* Info + How it works side by side */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <SurfaceCard className="flex-1 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Comment ça marche</h3>
              <span
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]"
                style={{ color: ACCENT, borderColor: ACCENT }}
              >
                3 étapes
              </span>
            </div>
            <ul className="space-y-2 text-sm text-white/80 leading-relaxed list-disc list-inside">
              <li>Choisis un profil ou une playlist publique (Spotify ou Deezer)</li>
              <li>Copie le lien depuis l'app ou le navigateur</li>
              <li>Écoute les extraits, tape le titre et/ou l'artiste pour marquer des points</li>
            </ul>
          </SurfaceCard>

          <SurfaceCard className="flex-1 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Bon à savoir</h3>
              <span className="text-sm">💡</span>
            </div>
            <ul className="space-y-2 text-sm text-white/80 leading-relaxed list-disc list-inside">
              <li>Les playlists doivent être <strong>publiques</strong> pour être trouvées</li>
              <li>Profils et playlists Spotify et Deezer sont tous supportés</li>
              <li>Les extraits audio viennent de Deezer (30 secondes par titre)</li>
            </ul>
          </SurfaceCard>
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

  return <GameClient />
}

export default function SoloPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#050505] text-sm text-white/50">
          Chargement…
        </div>
      }
    >
      <SoloPageInner />
    </Suspense>
  )
}
