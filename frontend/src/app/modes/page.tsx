"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Mode } from "@/contexts/ModeContext"
import { useMode } from "@/contexts/ModeContext"

type ModeCard = {
  key: Mode
  title: string
  subtitle: string
  description: string
  accent: string
  destination: string
  posture: string
}

const MODE_CARDS: ModeCard[] = [
  {
    key: "friends",
    title: "Jouer avec des amis",
    subtitle: "Invite, lance une partie, joue entre potes.",
    description: "Les musiques sont choisies à partir des bibliothèques de chacun, puis jouées pour tout le monde.",
    accent: "#ec4899",
    destination: "/menu",
    posture: "Social",
  },
  {
    key: "event",
    title: "Jouer en événement",
    subtitle: "Un écran, un rythme, tout le monde suit.",
    description: "Les morceaux viennent des bibliothèques des participants et sont diffusés ensemble.",
    accent: "#8b5cf6",
    destination: "/menu",
    posture: "Collectif",
  },
  {
    key: "chat",
    title: "Jouer avec le chat",
    subtitle: "Le chat joue avec toi, au rythme du jeu.",
    description: "La musique est tirée des bibliothèques des joueurs présents et partagée avec le chat.",
    accent: "#22d3ee",
    destination: "/menu",
    posture: "Diffusion",
  },
]

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "")
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function ModeSelectionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mode, setMode } = useMode()
  const [selection, setSelection] = useState<Mode | null>(mode)
  const [hovered, setHovered] = useState<Mode | null>(null)

  const fallbackRoute = useMemo(() => searchParams.get("from") || "/menu", [searchParams])

  useEffect(() => {
    if (mode) setSelection(mode)
  }, [mode])

  const getCard = (key: Mode | null) => MODE_CARDS.find(card => card.key === key) ?? null
  const activeCard = getCard(selection)

  const handleConfirm = (targetMode?: Mode) => {
    const selected = targetMode ?? selection
    const card = getCard(selected)
    if (!selected || !card) return
    setMode(selected)
    const target = card.destination || fallbackRoute
    router.replace(target)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 py-14 text-white">
      <div className="w-full max-w-5xl space-y-10">
        <header className="flex flex-col gap-3 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Orientation</p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Comment tu veux jouer ?</h1>
          <p className="text-sm text-white/60">Choisis un mode, je m’occupe du reste.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {MODE_CARDS.map(card => {
            const isActive = selection === card.key
            const isHover = !isActive && hovered === card.key
            const borderColor = isActive
              ? card.accent
              : isHover
                ? hexToRgba(card.accent, 0.38)
                : hexToRgba(card.accent, 0.2)
            const dotColor = isActive ? card.accent : hexToRgba(card.accent, isHover ? 0.35 : 0.18)
            return (
              <button
                key={card.key}
                onClick={() => setSelection(card.key)}
                onDoubleClick={() => handleConfirm(card.key)}
                onMouseEnter={() => setHovered(card.key)}
                onMouseLeave={() => setHovered(current => (current === card.key ? null : current))}
                className="flex h-full flex-col justify-between rounded-2xl border bg-[#0b0b0b] p-5 text-left transition-colors"
                style={{ borderColor, boxShadow: isActive ? `0 0 0 1px ${card.accent}` : "none" }}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.25em] text-white/60">Mode</div>
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full transition-colors"
                      style={{ background: dotColor }}
                    />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">{card.title}</h2>
                    <p className="text-sm text-white/70">{card.subtitle}</p>
                    <p className="text-xs text-white/55">{card.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.3em] text-white/50">Posture</span>
                  <span
                    className="rounded-full px-3 py-1 text-[12px] font-semibold text-white"
                    style={{ background: isActive ? card.accent : hexToRgba(card.accent, isHover ? 0.35 : 0.2) }}
                  >
                    {card.posture}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-white/60">Tu peux changer de mode quand tu veux.</div>
          <button
            type="button"
            onClick={() => handleConfirm()}
            disabled={!selection}
            className="inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{
              borderColor: activeCard ? activeCard.accent : "rgba(255,255,255,0.2)",
              color: activeCard ? activeCard.accent : "rgba(255,255,255,0.8)",
            }}
          >
            Valider ce mode
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ModeSelectionPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#050505] text-sm text-white/70">Chargement…</div>}>
      <ModeSelectionContent />
    </Suspense>
  )
}
