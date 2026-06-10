"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Mode } from "@/contexts/ModeContext"
import { useMode } from "@/contexts/ModeContext"
import { MangaSpeakers } from "@/components/ui/MangaSpeakers"


type ModeCard = {
  key: Mode
  title: string
  subtitle: string
  description: string
  accent: string
  destination: string
  posture: string
  wip?: boolean
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
    wip: true,
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
  const [showHelp, setShowHelp] = useState(false)

  const fallbackRoute = useMemo(() => searchParams.get("from") || "/modes", [searchParams])

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
    const choice = (window.prompt("Choisis un mode : friends / event / streamer", "event") || "").trim().toLowerCase()
    if (choice !== "friends" && choice !== "event" && choice !== "streamer") return
    setMode(choice as Mode)
    const target =
      choice === "friends"
        ? "/multiplayer?mode=friends"
        : `/multiplayer?mode=${choice}&autojoin=1`
    router.replace(target)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-14 text-white">
      <MangaSpeakers />
      <div className="relative z-10 w-full max-w-5xl space-y-10">
        <header className="flex flex-col gap-3 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">
            &gt; Select_Mode
          </p>
          <h1
            className="font-display text-5xl uppercase tracking-[0.06em] text-[#ff2ec8] text-glow-pink sm:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Comment tu veux jouer ?
          </h1>
          <p className="text-sm text-white/70">Choisis un mode, le reste suit.</p>
        </header>

        <div className="grid gap-5 md:grid-cols-3">
          {MODE_CARDS.map(card => {
            const isActive = selection === card.key
            const isHover = !isActive && hovered === card.key
            const borderColor = isActive
              ? card.accent
              : isHover
                ? hexToRgba(card.accent, 0.55)
                : hexToRgba(card.accent, 0.28)
            const dotColor = isActive ? card.accent : hexToRgba(card.accent, isHover ? 0.5 : 0.22)
            const glowIntensity = isActive ? 0.6 : isHover ? 0.35 : 0.12
            return (
              <button
                key={card.key}
                onClick={() => setSelection(card.key)}
                onDoubleClick={() => handleConfirm(card.key)}
                onMouseEnter={() => setHovered(card.key)}
                onMouseLeave={() => setHovered(current => (current === card.key ? null : current))}
                className="group relative flex h-full flex-col justify-between rounded-xl border bg-[rgba(15,5,30,0.85)] p-6 text-left backdrop-blur-md transition-all duration-200 hover:-translate-y-1"
                style={{
                  borderColor,
                  boxShadow: `0 0 24px ${hexToRgba(card.accent, glowIntensity)}, inset 0 0 18px ${hexToRgba(card.accent, glowIntensity * 0.25)}`,
                }}
              >
                {/* Corner brackets - arcade frame feel */}
                <span
                  aria-hidden
                  className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2"
                  style={{ borderColor: card.accent }}
                />
                <span
                  aria-hidden
                  className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2"
                  style={{ borderColor: card.accent }}
                />
                <span
                  aria-hidden
                  className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2"
                  style={{ borderColor: card.accent }}
                />
                <span
                  aria-hidden
                  className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2"
                  style={{ borderColor: card.accent }}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/50">[ Mode ]</div>
                    <div className="flex items-center gap-2">
                      {card.wip && (
                        <span className="rounded-sm bg-white/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white/60">
                          Bientot
                        </span>
                      )}
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full transition-all"
                        style={{
                          background: dotColor,
                          boxShadow: isActive ? `0 0 12px ${card.accent}, 0 0 4px ${card.accent}` : `0 0 6px ${dotColor}`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h2
                      className="font-display text-xl uppercase tracking-[0.04em]"
                      style={{
                        color: card.accent,
                        textShadow: `0 0 8px ${hexToRgba(card.accent, 0.7)}, 0 0 16px ${hexToRgba(card.accent, 0.4)}`,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {card.title}
                    </h2>
                    <p className="text-sm text-white/70">{card.subtitle}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/50">// posture</span>
                  <span
                    className="rounded-sm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-white"
                    style={{
                      background: hexToRgba(card.accent, isActive ? 0.25 : 0.12),
                      border: `1px solid ${card.accent}`,
                      boxShadow: `inset 0 0 8px ${hexToRgba(card.accent, 0.3)}`,
                    }}
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
            className="inline-flex items-center gap-2 rounded-md border-2 px-6 py-2.5 font-display text-sm uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: activeCard ? activeCard.accent : "rgba(255,255,255,0.2)",
              color: activeCard ? activeCard.accent : "rgba(255,255,255,0.8)",
              boxShadow: activeCard ? `0 0 18px ${hexToRgba(activeCard.accent, 0.45)}, inset 0 0 12px ${hexToRgba(activeCard.accent, 0.15)}` : "none",
              textShadow: activeCard ? `0 0 6px ${hexToRgba(activeCard.accent, 0.7)}` : "none",
              fontFamily: "var(--font-display)",
            }}
          >
            &gt; Valider
          </button>
        </div>

        <div className="fixed bottom-6 right-6 z-40">
          <button
            type="button"
            onClick={() => router.push("/solo")}
            className="btn-neon font-display text-sm"
            style={{ fontFamily: "var(--font-display)" }}
            aria-label="Jouer en solo"
          >
            Solo
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(h => !h)}
          className="fixed bottom-6 left-6 rounded-sm border border-white/20 bg-[rgba(15,5,30,0.7)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white/80 backdrop-blur transition hover:border-[#00f7ff] hover:text-[#00f7ff]"
        >
          {showHelp ? "[ X ] Fermer" : "[ ? ] Aide"}
        </button>
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-end justify-start p-6" onClick={() => setShowHelp(false)}>
            <div
              className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#0c0c0c]/95 p-6 shadow-2xl backdrop-blur-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white">Comment ça marche ?</h3>
              <p className="text-sm text-white/60">
                Blindify te fait écouter des extraits de musique. Tu dois deviner le titre et l'artiste le plus vite possible.
              </p>

              <div className="space-y-3">
                <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
                  <p className="text-sm font-semibold text-pink-400">Entre amis</p>
                  <p className="mt-1 text-xs text-white/60">
                    Crée une salle, invite tes potes avec un code et jouez ensemble. Chacun écoute la musique et répond de son côté. Celui qui devine le plus vite gagne le plus de points.
                  </p>
                </div>

                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                  <p className="text-sm font-semibold text-violet-400">Événement</p>
                  <p className="mt-1 text-xs text-white/60">
                    Parfait pour une soirée ou un bar. Un écran principal diffuse la musique (le présentateur), les joueurs rejoignent avec un code et répondent depuis leur téléphone.
                  </p>
                </div>

                <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-orange-400">Streamer</p>
                    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-orange-400/70">
                      En développement
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    Joue en live avec ton chat Twitch. Tes viewers participent directement depuis le chat. Plusieurs modes de jeu prévus.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {isGuest ? (
          <button
            type="button"
            onClick={() => setGuest(false)}
            className="fixed bottom-[4.5rem] left-6 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
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
