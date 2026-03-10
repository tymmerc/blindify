"use client"

import Link from "next/link"
import { Suspense, useMemo, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  const router = useRouter()
  const [quickUrl, setQuickUrl] = useState("")
  const [quickError, setQuickError] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; author: "ia" | "user"; text: string; hint?: string }>
  >([
    {
      id: "seed-1",
      author: "ia",
      text: "Salut ! Décris le blindtest que tu veux : mood, années, énergie, durée… Je te prépare une playlist solo.",
      hint: "Exemple : 90s rock, 12 titres, difficulté normale",
    },
  ])

  const rows = useMemo(() => {
    const groups: SoloOption[][] = []
    for (let i = 0; i < soloOptions.length; i += 3) {
      groups.push(soloOptions.slice(i, i + 3))
    }
    return groups
  }, [])

  const handleQuickPlay = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = quickUrl.trim()
    if (!trimmed) return
    setQuickError(null)
    const encoded = encodeURIComponent(trimmed)
    router.push(`/solo?source=quickplay&quickUrl=${encoded}&count=10`)
  }

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = chatInput.trim()
    if (!value) return
    const nextId = `msg-${Date.now()}`
    setChatMessages(prev => [
      ...prev,
      { id: nextId, author: "user", text: value },
      {
        id: `${nextId}-ia`,
        author: "ia",
        text: "Je prépare ta config… (UI uniquement pour l’instant)",
      },
    ])
    setChatInput("")
  }

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-16">
      <div className="ma-container pt-10 space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Solo</p>
            <h1 className="text-3xl font-bold tracking-[-0.03em]">Lancer un blindtest</h1>
            <p className="text-sm text-[var(--ma-muted)]">Choisissez une source ou collez un lien de playlist publique.</p>
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
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Playlist publique</h2>
              <span className="rounded-full bg-purple-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-400">
                Sans compte
              </span>
            </div>
            <p className="text-sm text-white/60">
              Colle un lien de profil ou playlist Spotify / Deezer. On pioche 10 titres au hasard dans tes playlists publiques.
            </p>
            <form onSubmit={handleQuickPlay} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="url"
                value={quickUrl}
                onChange={e => setQuickUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
                className="flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-purple-500/50"
              />
              <Button
                type="submit"
                disabled={!quickUrl.trim()}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(168,85,247,0.25)] hover:brightness-110 disabled:opacity-50"
              >
                Jouer
              </Button>
            </form>
            {quickError && <p className="text-xs text-red-400">{quickError}</p>}
            <div className="flex flex-wrap gap-2 text-[11px] text-white/30">
              <span className="rounded-full border border-white/10 px-2.5 py-0.5">open.spotify.com/user/...</span>
              <span className="rounded-full border border-white/10 px-2.5 py-0.5">deezer.com/profile/...</span>
              <span className="rounded-full border border-white/10 px-2.5 py-0.5">...playlist/...</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-[0.3em] text-white/30">ou avec ton compte</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

          <div className="relative overflow-hidden rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(168,85,247,0.1),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.1),transparent_55%)]" />
            <div className="relative flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Assistant IA</p>
                <h3 className="text-xl font-semibold">Brief ton blindtest</h3>
                <p className="text-sm text-[var(--ma-muted)]">Décris les genres, l’époque, le tempo, la durée… je prépare un set solo.</p>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-[var(--ma-muted)]">UI only</span>
            </div>

            <div className="mt-4 space-y-3 overflow-hidden rounded-xl border border-[var(--ma-border)] bg-black/30 p-3">
              <div className="grid gap-2 max-h-[320px] overflow-y-auto pr-1">
                {chatMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm leading-relaxed",
                      msg.author === "ia"
                        ? "bg-white/5 text-[var(--ma-muted)] border border-white/5"
                        : "bg-gradient-to-r from-[#8f5bff] to-[#ec4899] text-white border border-transparent",
                    )}
                  >
                    <p className="font-semibold mb-1 text-xs uppercase tracking-[0.15em] text-white/70">
                      {msg.author === "ia" ? "Blindify IA" : "Toi"}
                    </p>
                    <p>{msg.text}</p>
                    {msg.hint ? <p className="mt-1 text-[11px] text-[var(--ma-muted)]">{msg.hint}</p> : null}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={event => setChatInput(event.target.value)}
                  placeholder="Ex: 12 titres pop 2010s, tempo 120-140, mood feel good"
                  className="flex-1 rounded-lg border border-[var(--ma-border)] bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-[rgba(168,85,247,0.4)]"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gradient-to-r from-[#8f5bff] to-[#ec4899] px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(168,85,247,0.35)] transition hover:brightness-110 disabled:opacity-60"
                  disabled={!chatInput.trim()}
                >
                  Générer
                </button>
              </form>
            </div>
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
