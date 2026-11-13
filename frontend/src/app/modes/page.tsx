"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Mode } from "@/contexts/ModeContext"
import { useMode } from "@/contexts/ModeContext"
import { AccountMenu } from "@/components/AccountMenu"
import { publicPath } from "@/lib/publicPath"
import { api } from "@/lib/api"
import { PLAY_SITUATIONS, type PlaySituation } from "@/lib/playSituations"

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
  rpm?: string
  wip?: boolean
  selected?: boolean
  out?: boolean
  picking?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof window !== "undefined" && !window.matchMedia("(max-width: 639px)").matches) return
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.62, rootMargin: "-12% 0px -12% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const discOut = inView
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={picking}
      className="group relative flex h-full w-full flex-col text-left"
    >
      {/* Le disque sort au survol ; au CLIC il RENTRE dans la pochette (geste "je range le disque = je choisis") */}
      <span
        aria-hidden
        className={`absolute left-1/2 top-9 z-0 aspect-square w-[44%] -translate-x-1/2 rounded-full transition-transform sm:top-1.5 sm:w-[78%] duration-[450ms] ${
          picking
            ? "translate-y-9 scale-[.97]"
            : discOut
              ? "-translate-y-6 rotate-6 duration-300 sm:-translate-y-9 sm:rotate-12"
              : "duration-300 group-hover:-translate-y-9 group-hover:rotate-12"
        }`}
        style={{ background: DISC_GROOVES }}
      >
        <span
          className="absolute inset-[34%] rounded-full border-[3px] border-line"
          style={{ background: accent }}
        />
        <span className="absolute inset-[47%] rounded-full bg-paper" />
      </span>
      {/* La pochette — au survol elle prend la COULEUR du mode (bordure + ombre) */}
      <span
        className={`relative z-10 mt-9 flex min-h-[225px] flex-1 flex-col justify-between border-2 bg-paper-deep p-5 transition-all duration-200 group-hover:translate-y-0.5 group-hover:![border-color:var(--ac)] group-hover:!shadow-[6px_6px_0_var(--ac)] ${
          picking || discOut ? "![border-color:var(--ac)] !shadow-[6px_6px_0_var(--ac)]" : ""
        }`}
        style={{
          ["--ac" as string]: accent,
          borderColor: "rgb(var(--c-line))",
          boxShadow: "4px 4px 0 rgb(var(--c-shadow) / .18)",
        }}
      >
        <span className="block">
          <span className="block font-display text-[1.35rem] font-semibold leading-tight text-ink">
            {title}
          </span>
          <span className="mt-2 block text-sm leading-relaxed text-ink-2">{subtitle}</span>
        </span>
        <span className="mt-5 block">
          <span className="flex flex-wrap gap-2">
            <span
              className="rounded-full border-[1.5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: accent, borderColor: accent, color: "#f4ecdb" }}
            >
              {posture}
            </span>
            {wip && (
              <span className="rounded-full border-[1.5px] border-line px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
                Bientôt
              </span>
            )}
          </span>
          <div className="mt-3 flex h-4 items-center justify-end">
            {!wip && (
              <span
                className={`text-[10px] font-bold uppercase tracking-[0.14em] transition-opacity duration-200 ${
                  picking || discOut ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
  // Interrupteur STREAMER_MODE du serveur (T5) : coupe, la carte repasse en « Bientôt ».
  const [streamerOff, setStreamerOff] = useState(false)
  useEffect(() => {
    let active = true
    api.streamerStatus()
      .then(status => { if (active) setStreamerOff(!status.enabled) })
      .catch(() => { /* serveur injoignable : la creation de salle le dira */ })
    return () => { active = false }
  }, [])

  const fallbackRoute = useMemo(() => searchParams.get("from") || "/modes", [searchParams])

  useEffect(() => {
    if (mode) setSelection(mode)
  }, [mode])

  useEffect(() => {
    // Sortie du mode invité quand on revient choisir un mode.
    setGuest(false)
  }, [setGuest])

  // Situations jouables en salle (Solo a sa propre page). Streamer coupe : « Bientot ».
  const cards = useMemo(
    () => PLAY_SITUATIONS.map(card => ({ ...card, wip: card.key === "streamer" && streamerOff })),
    [streamerOff]
  )
  const getCard = (key: Mode | null): (PlaySituation & { wip: boolean }) | null =>
    cards.find(card => card.key === key) ?? null

  const handleConfirm = (targetMode?: Mode) => {
    const selected = targetMode ?? selection
    const card = getCard(selected)
    if (!selected || !card) return
    if (card.wip) return // "Avec ta communaute" coupe par STREAMER_MODE=off : pas jouable
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
    <div className="flex min-h-dvh flex-col px-6 pt-10 pb-24 text-ink sm:min-h-screen sm:flex-row sm:items-center sm:justify-center sm:py-14">
      <AccountMenu />
      <div className="relative z-10 my-auto mx-auto w-full max-w-5xl space-y-10">
        <header className="flex flex-col gap-2">
          {/* Sur grand ecran le logo se fixe en haut a gauche, au meme niveau que le bouton profil */}
          <img
            src={publicPath("/logo-mark.png")}
            alt="Blindz"
            className="mb-1 h-11 w-11 object-contain lg:fixed lg:left-8 lg:top-8 lg:z-40 lg:mb-0 lg:h-12 lg:w-12 dark:hidden"
          />
          <img
            src={publicPath("/logo-mark-nuit.png")}
            alt="Blindz"
            className="mb-1 h-11 w-11 object-contain lg:fixed lg:left-8 lg:top-8 lg:z-40 lg:mb-0 lg:h-12 lg:w-12 hidden dark:block"
          />
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-terra-txt">
            Choisis ta face
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
            Comment tu veux <em className="font-medium italic text-terra-txt">jouer</em>&nbsp;?
          </h1>
          <p className="text-base text-ink-2">Choisis ce qui ressemble à ce que vous faites. Le mode suit tout seul.</p>
        </header>

        <div className="grid gap-10 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(card => (
            <VinylSleeve
              key={card.key}
              title={card.title}
              subtitle={card.subtitle}
              accent={card.accent}
              posture={card.modeName}
              wip={card.wip}
              selected={card.key !== "solo" && selection === card.key}
              picking={picking === card.key}
              onClick={() => (card.key === "solo" ? handleSolo() : handleConfirm(card.key))}
            />
          ))}
        </div>

        <p className="text-center font-display text-sm italic text-sourd">
          Tu pourras changer la musique et les réglages dans la salle.
        </p>

        <button
          type="button"
          onClick={() => setShowHelp(h => !h)}
          className="fixed bottom-6 left-6 rounded-full border-[1.5px] border-line bg-paper-deep px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-ink-block hover:text-on-ink"
        >
          {showHelp ? "Fermer" : "Comment ça marche ?"}
        </button>
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-end justify-start bg-ink-block/20 p-6" onClick={() => setShowHelp(false)}>
            <div
              className="w-full max-w-md space-y-4 border-2 border-line bg-paper p-6 shadow-[6px_6px_0_rgb(var(--c-shadow)/.25)]"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-display text-xl font-semibold text-ink">Comment ça marche ?</h3>
              <p className="text-sm leading-relaxed text-ink-2">
                Blindz te fait écouter des extraits de musique. Tu dois deviner le titre et l'artiste le plus vite possible.
              </p>

              <div className="space-y-3">
                <div className="border-l-4 border-terra bg-paper-deep p-3">
                  <p className="text-sm font-bold text-terra-txt">À distance</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    Crée une salle, invite tes potes avec un code et jouez ensemble. Chacun écoute la musique et répond de son côté. Celui qui devine le plus vite gagne le plus de points.
                  </p>
                </div>

                <div className="border-l-4 border-gold bg-paper-deep p-3">
                  <p className="text-sm font-bold text-gold-deep-txt">Autour d'une table</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    Parfait pour une soirée ou un bar. Un écran principal diffuse la musique (le présentateur), les joueurs rejoignent avec un code et répondent depuis leur téléphone.
                  </p>
                </div>

                <div className="border-l-4 border-sage bg-paper-deep p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-sage-deep-txt">Avec ta communauté</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    Pour un live Twitch : ton public devine depuis son téléphone ou en tapant dans le chat.
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
            className="fixed bottom-[4.5rem] left-6 rounded-full border-[1.5px] border-line/40 bg-paper-deep px-4 py-2 text-xs font-bold text-ink hover:border-line"
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
