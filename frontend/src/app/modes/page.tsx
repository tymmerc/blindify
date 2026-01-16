"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Mode } from "@/contexts/ModeContext"
import { useMode } from "@/contexts/ModeContext"
import { Button } from "@/components/ui/button"

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
    description: "",
    accent: "#ec4899",
    destination: "/friends",
    posture: "Social",
  },
  {
    key: "event",
    title: "Jouer en événement",
    subtitle: "Un écran, un rythme, tout le monde suit.",
    description: "",
    accent: "#8b5cf6",
    destination: "/event",
    posture: "Collectif",
  },
  {
    key: "streamer",
    title: "Mode Streamer",
    subtitle: "Joue en live avec ton chat - 3 modes disponibles.",
    description: "",
    accent: "#f97316",
    destination: "/streamer",
    posture: "Live",
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
  const { mode, setMode, isGuest, setGuest } = useMode()
  const [selection, setSelection] = useState<Mode | null>(mode)
  const [hovered, setHovered] = useState<Mode | null>(null)

  const fallbackRoute = useMemo(() => searchParams.get("from") || "/menu", [searchParams])

  useEffect(() => {
    if (mode) setSelection(mode)
  }, [mode])

  useEffect(() => {
    // Sortie du mode invité quand on revient choisir un mode.
    setGuest(false)
  }, [setGuest])

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

  const handleGuestQuickStart = () => {
    setGuest(true)
    const choice = (window.prompt("Choisis un mode : friends / event / chat", "event") || "").trim().toLowerCase()
    if (choice !== "friends" && choice !== "event" && choice !== "chat") return
    setMode(choice as Mode)
    const target =
      choice === "friends"
        ? "/multiplayer?mode=friends"
        : `/multiplayer?mode=${choice}&autojoin=1`
    router.replace(target)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 py-14 text-white">
      <div className="w-full max-w-5xl space-y-8">
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
                className="flex h-full flex-col justify-between rounded-2xl border bg-[#0c0c0c] p-5 text-left transition-colors"
                style={{ borderColor }}
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

        <button
          type="button"
          onClick={handleGuestQuickStart}
          className="fixed bottom-6 right-6 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          aria-label="Jouer sans connexion"
        >
          Jouer sans connexion
        </button>
        {isGuest ? (
          <button
            type="button"
            onClick={() => setGuest(false)}
            className="fixed bottom-6 left-6 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Revenir en mode connecté
          </button>
        ) : null}
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
