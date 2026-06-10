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
    <div className="tech-grid flex min-h-screen items-center justify-center px-6 py-14 text-[#fafafa]">
      <div className="relative z-10 w-full max-w-5xl space-y-10">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#71717a]">
            Select · mode
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.02em] text-[#fafafa] sm:text-5xl">
            Comment tu veux jouer ?
          </h1>
          <p className="text-base text-[#71717a]">Choisis ton terrain. Le reste suit.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {MODE_CARDS.map(card => {
            const isActive = selection === card.key
            const glyph = card.key === "friends" ? "◎" : card.key === "event" ? "▣" : "◈"
            return (
              <button
                key={card.key}
                onClick={() => setSelection(card.key)}
                onDoubleClick={() => handleConfirm(card.key)}
                onMouseEnter={() => setHovered(card.key)}
                onMouseLeave={() => setHovered(current => (current === card.key ? null : current))}
                className="group relative flex h-full flex-col justify-between rounded-2xl border bg-[var(--app-surface)] p-6 text-left transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  borderColor: isActive ? hexToRgba(card.accent, 0.5) : "rgba(255,255,255,0.07)",
                  boxShadow: isActive ? `inset 0 0 0 1px ${hexToRgba(card.accent, 0.35)}` : "none",
                }}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 items-center justify-center rounded-[10px] text-lg"
                      style={{ background: hexToRgba(card.accent, 0.14), color: card.accent }}
                    >
                      {glyph}
                    </span>
                    {card.wip && (
                      <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717a]">
                        Bientôt
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#fafafa]">
                      {card.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-[#71717a]">{card.subtitle}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <span
                    className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]"
                    style={{ borderColor: hexToRgba(card.accent, 0.4), color: card.accent }}
                  >
                    {card.posture}
                  </span>
                  <span className="rounded-full border border-white/[0.07] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717a]">
                    {card.key === "friends" ? "Multi" : card.key === "event" ? "Live" : "Twitch"}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-[#71717a]">Tu peux changer de mode quand tu veux.</div>
          <button
            type="button"
            onClick={() => handleConfirm()}
            disabled={!selection}
            className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: selection ? "#fafafa" : "rgba(255,255,255,0.06)",
              color: selection ? "#09090b" : "rgba(255,255,255,0.5)",
            }}
          >
            Lancer une partie
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
          className="fixed bottom-6 left-6 rounded-lg border border-white/10 bg-[var(--app-surface)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a] backdrop-blur transition hover:border-white/30 hover:text-[#fafafa]"
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
