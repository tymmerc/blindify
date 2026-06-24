"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Mode } from "@/contexts/ModeContext"
import { useMode } from "@/contexts/ModeContext"

type ModeCard = {
  key: Mode
  title: string
  subtitle: string
  accent: string
  destination: string
  posture: string
  rpm: string
  wip?: boolean
}

const MODE_CARDS: ModeCard[] = [
  {
    key: "friends",
    title: "À distance",
    subtitle: "Chacun chez soi. Un code à partager, tout le monde joue sur son écran.",
    accent: "#c65133",
    destination: "/friends",
    posture: "À distance",
    rpm: "33⅓ RPM · STÉRÉO",
  },
  {
    key: "event",
    title: "Autour d'une table",
    subtitle: "Un écran central pour la musique, les autres répondent sur leur téléphone.",
    accent: "#e0a32e",
    destination: "/event",
    posture: "En vrai",
    rpm: "33⅓ RPM · STÉRÉO",
  },
  {
    key: "streamer",
    title: "Avec ta communauté",
    subtitle: "Pour streamer : ton audience devine.",
    accent: "#7d9471",
    destination: "/streamer",
    posture: "Stream",
    rpm: "45 RPM · MONO",
    wip: true,
  },
]

const DISC_GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2px, #38291a 2px 4px)"

function VinylSleeve({
  title,
  subtitle,
  accent,
  posture,
  rpm,
  wip,
  selected,
  out,
  picking,
  onClick,
  onDoubleClick,
}: {
  title: string
  subtitle: string
  accent: string
  posture: string
  rpm: string
  wip?: boolean
  selected?: boolean
  out?: boolean
  picking?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
}) {
  const discOut = selected || out
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={picking}
      className="group relative block w-full text-left"
    >
      {/* Le disque sort au survol ; au CLIC il RENTRE dans la pochette (geste "je range le disque = je choisis") */}
      <span
        aria-hidden
        className={`absolute left-1/2 top-1.5 z-0 aspect-square w-[78%] -translate-x-1/2 rounded-full transition-transform duration-[450ms] ${
          picking
            ? "translate-y-9 scale-[.97]"
            : "duration-300 group-hover:-translate-y-9 group-hover:rotate-12"
        }`}
        style={{ background: DISC_GROOVES }}
      >
        <span
          className="absolute inset-[34%] rounded-full border-[3px] border-[#2e2014]"
          style={{ background: accent }}
        />
        <span className="absolute inset-[47%] rounded-full bg-[#f4ecdb]" />
      </span>
      {/* La pochette — au survol elle prend la COULEUR du mode (bordure + ombre) */}
      <span
        className={`relative z-10 mt-9 flex min-h-[225px] flex-col justify-between border-2 bg-[#ece1c8] p-5 transition-all duration-200 group-hover:translate-y-0.5 group-hover:![border-color:var(--ac)] group-hover:!shadow-[6px_6px_0_var(--ac)] ${
          picking ? "![border-color:var(--ac)] !shadow-[6px_6px_0_var(--ac)]" : ""
        }`}
        style={{
          ["--ac" as string]: accent,
          borderColor: "#2e2014",
          boxShadow: "4px 4px 0 rgba(46,32,20,.18)",
        }}
      >
        <span className="block">
          <span className="block font-display text-[1.35rem] font-semibold leading-tight text-[#2e2014]">
            {title}
          </span>
          <span className="mt-2 block text-sm leading-relaxed text-[#6b573f]">{subtitle}</span>
        </span>
        <span className="block">
          <span className="flex flex-wrap gap-2">
            <span
              className="rounded-full border-[1.5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: accent, borderColor: accent, color: "#f4ecdb" }}
            >
              {posture}
            </span>
            {wip && (
              <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                Bientôt
              </span>
            )}
          </span>
          <div className="mt-3 flex h-4 items-center justify-end">
            {!wip && (
              <span
                className={`text-[10px] font-bold uppercase tracking-[0.14em] transition-opacity duration-200 ${
                  picking ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                style={{ color: accent }}
              >
                {picking ? "Sélectionné ✓" : "Créer →"}
              </span>
            )}
          </div>
        </span>
      </span>
    </button>
  )
}

function ModeSelectionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mode, setMode, isGuest, setGuest } = useMode()
  const [selection, setSelection] = useState<Mode | null>(mode)
  const [picking, setPicking] = useState<Mode | "solo" | null>(null)
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

  const handleConfirm = (targetMode?: Mode) => {
    const selected = targetMode ?? selection
    const card = getCard(selected)
    if (!selected || !card) return
    if (card.wip) return // "Avec ta communaute" : bientot, pas jouable
    if (picking) return // un choix est deja en cours d'animation
    setMode(selected)
    // On arrive ici via "Creer" (choisi a l'entree) -> on cree directement la partie (host).
    // Le nom + la musique ont deja ete saisis a l'ecran d'entree (pas de wizard a refaire).
    let nick = ""
    try {
      const n = (localStorage.getItem("blindify_nickname") ?? "").trim()
      if (n) nick = `&nickname=${encodeURIComponent(n)}`
    } catch { /* ignore */ }
    // Le disque rentre dans la pochette, PUIS on navigue (~520ms).
    setPicking(selected)
    setTimeout(() => {
      router.push(`/multiplayer?mode=${selected}&intent=host${nick}`)
    }, 520)
  }

  const handleSolo = () => {
    if (picking) return
    setPicking("solo")
    setTimeout(() => router.push("/solo"), 520)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-14 text-[#2e2014]">
      <div className="relative z-10 w-full max-w-5xl space-y-10">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">
            Choisis ta face
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
            Comment tu veux <em className="font-medium italic text-[#c65133]">jouer</em>&nbsp;?
          </h1>
          <p className="text-base text-[#6b573f]">Choisis ton terrain. Le reste suit.</p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {MODE_CARDS.map(card => (
            <VinylSleeve
              key={card.key}
              title={card.title}
              subtitle={card.subtitle}
              accent={card.accent}
              posture={card.posture}
              rpm={card.rpm}
              wip={card.wip}
              selected={selection === card.key}
              picking={picking === card.key}
              onClick={() => handleConfirm(card.key)}
            />
          ))}
          <VinylSleeve
            title="Solo"
            subtitle="Toi, une playlist, le chrono."
            accent="#a8b8c8"
            posture="Rapide"
            rpm="33⅓ RPM · STÉRÉO"
            picking={picking === "solo"}
            onClick={handleSolo}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-5">
          <span className="font-display text-sm italic text-[#8a7558]">
            Sors un disque de sa pochette pour voir.
          </span>
          <button
            type="button"
            onClick={() => handleConfirm()}
            disabled={!selection}
            className="btn-neon disabled:cursor-not-allowed disabled:opacity-40"
          >
            Lancer une partie
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowHelp(h => !h)}
          className="fixed bottom-6 left-6 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          {showHelp ? "Fermer" : "Comment ça marche ?"}
        </button>
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-end justify-start bg-[#2e2014]/20 p-6" onClick={() => setShowHelp(false)}>
            <div
              className="w-full max-w-md space-y-4 border-2 border-[#2e2014] bg-[#f4ecdb] p-6 shadow-[6px_6px_0_rgba(46,32,20,.25)]"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-display text-xl font-semibold text-[#2e2014]">Comment ça marche ?</h3>
              <p className="text-sm leading-relaxed text-[#6b573f]">
                Blindify te fait écouter des extraits de musique. Tu dois deviner le titre et l'artiste le plus vite possible.
              </p>

              <div className="space-y-3">
                <div className="border-l-4 border-[#c65133] bg-[#ece1c8] p-3">
                  <p className="text-sm font-bold text-[#c65133]">À distance</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#6b573f]">
                    Crée une salle, invite tes potes avec un code et jouez ensemble. Chacun écoute la musique et répond de son côté. Celui qui devine le plus vite gagne le plus de points.
                  </p>
                </div>

                <div className="border-l-4 border-[#e0a32e] bg-[#ece1c8] p-3">
                  <p className="text-sm font-bold text-[#a87714]">Événement</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#6b573f]">
                    Parfait pour une soirée ou un bar. Un écran principal diffuse la musique (le présentateur), les joueurs rejoignent avec un code et répondent depuis leur téléphone.
                  </p>
                </div>

                <div className="border-l-4 border-[#7d9471] bg-[#ece1c8] p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#5d7252]">Streamer</p>
                    <span className="rounded-full border border-[#2e2014]/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[#8a7558]">
                      En développement
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#6b573f]">
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
            className="fixed bottom-[4.5rem] left-6 rounded-full border-[1.5px] border-[#2e2014]/40 bg-[#ece1c8] px-4 py-2 text-xs font-bold text-[#2e2014] hover:border-[#2e2014]"
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
    <Suspense>
      <ModeSelectionContent />
    </Suspense>
  )
}
