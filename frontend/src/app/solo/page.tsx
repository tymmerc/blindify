"use client"

import Link from "next/link"
import { Suspense, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import GameClient from "../game/GameClient"

export const dynamic = "force-dynamic"

type SoloOption = { title: string; description: string; badge?: string; href: string }

const soloOptions: SoloOption[] = [
  { title: "Titres likés", description: "Vos favoris Spotify", badge: "Top 20", href: "/solo?source=liked&count=20" },
  { title: "Bibliothèque", description: "Toute votre musique", badge: "10 au hasard", href: "/solo?source=library&count=10" },
  { title: "Top semaine", description: "Plus écoutés 7 derniers jours", badge: "20 titres", href: "/solo?source=top_week&count=20" },
  { title: "Top mois", description: "Plus écoutés 30 derniers jours", badge: "20 titres", href: "/solo?source=top_month&count=20" },
  { title: "Top toujours", description: "Vos best-of all time", badge: "20 titres", href: "/solo?source=top_all&count=20" },
  { title: "Playlist", description: "Choisir une playlist précise", badge: "Spotify", href: "/playlists" },
  { title: "Mix aléatoire", description: "Morceaux variés", badge: "10 titres", href: "/solo?source=library&count=10" },
]

function SoloSelector() {
  const rows = useMemo(() => {
    const groups: SoloOption[][] = []
    for (let i = 0; i < soloOptions.length; i += 3) {
      groups.push(soloOptions.slice(i, i + 3))
    }
    return groups
  }, [])

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-14">
      <div className="ma-container pt-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Solo</p>
            <h1 className="text-3xl font-bold tracking-[-0.03em]">Lancer un blindtest</h1>
            <p className="text-sm text-[var(--ma-muted)]">Choisissez une source pour vos 10-20 morceaux.</p>
          </div>
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            ← Retour
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.flat().map(option => (
            <Link
              key={option.title}
              href={option.href}
              className="group relative overflow-hidden rounded-xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-5 transition duration-200 hover:-translate-y-1 hover:border-[rgba(168,85,247,0.3)] hover:shadow-[0_12px_32px_rgba(168,85,247,0.15)]"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(168,85,247,0.12),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(236,72,153,0.12),transparent_55%)] opacity-80" />
              <div className="relative flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{option.title}</h3>
                  {option.badge ? (
                    <span className="rounded-full border border-[var(--ma-border-strong)] bg-white/5 px-3 py-1 text-xs text-[var(--ma-muted)]">
                      {option.badge}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-[var(--ma-muted)]">{option.description}</p>
                <div className="flex items-center gap-2 text-sm text-[#a855f7]">
                  <span>Lancer</span>
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Link>
          ))}
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
