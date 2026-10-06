"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { publicPath } from "@/lib/publicPath"
import { parseSoloTab, searchWithTab, tabForKey, type SoloTab } from "@/lib/soloSetup"
import { ChallengeTab } from "./ChallengeTab"
import { ChronoForm } from "./ChronoForm"
import { ClassicForm } from "./ClassicForm"
import { useSoloSettings } from "./SoloFormParts"

// Lobby solo : trois onglets (classique, chrono, defi) au sens ARIA du terme
// (tablist / tab / tabpanel, fleches du clavier, comme le chat du lobby
// multi), et des reglages communs qui survivent au changement d'onglet.

const TABS: { key: SoloTab; label: string }[] = [
  { key: "classic", label: "Classique" },
  { key: "chrono", label: "Chrono" },
  { key: "challenge", label: "Défier un ami" },
]

// Une ligne d'aide sous la carte, sans carte de plus : l'essentiel est dans le formulaire.
const HELP: Record<SoloTab, string> = {
  classic: "La playlist ou le profil doit être public pour qu'on le trouve. Les extraits durent 30 secondes et viennent de Deezer, même avec un lien Spotify.",
  chrono: "Un titre trouvé rapporte 1 point, l'artiste 1 de plus. Pas de bonus de vitesse : seul le nombre de bonnes réponses compte.",
  challenge: "Le défi reste ouvert : tous ceux qui ont le lien peuvent le relever, et le classement se remplit au fur et à mesure.",
}

const tabId = (key: SoloTab) => `solo-onglet-${key}`
const panelId = (key: SoloTab) => `solo-panneau-${key}`

function TabBar({ active, onChange }: { active: SoloTab; onChange: (t: SoloTab) => void }) {
  const tabs = useRef(new Map<SoloTab, HTMLButtonElement>())

  // Fleches, Debut, Fin : l'onglet vise s'ouvre et prend le focus.
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = tabForKey(active, e.key)
    if (!next) return
    e.preventDefault()
    onChange(next)
    tabs.current.get(next)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Type de partie"
      className="flex gap-1 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-1 shadow-[4px_4px_0_rgba(46,32,20,.18)]"
    >
      {TABS.map(tab => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            ref={el => {
              if (el) tabs.current.set(tab.key, el)
              else tabs.current.delete(tab.key)
            }}
            type="button"
            role="tab"
            id={tabId(tab.key)}
            aria-selected={isActive}
            aria-controls={isActive ? panelId(tab.key) : undefined}
            // Un seul onglet dans l'ordre de tabulation, les fleches font le reste.
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={handleKeyDown}
            className={`flex-1 rounded px-2 py-2.5 text-[13px] font-bold leading-tight transition sm:text-sm ${
              isActive ? "bg-[#c65133] text-[#f4ecdb]" : "text-[#6b573f] hover:text-[#2e2014]"
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export function SoloSelector() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // ?tab=challenge : arrivee depuis "Defier a mon tour" (fin d'un defi releve).
  const [tab, setTab] = useState<SoloTab>(() => parseSoloTab(searchParams.get("tab")))
  const settings = useSoloSettings()
  const panelRef = useRef<HTMLDivElement>(null)
  const [focusHeading, setFocusHeading] = useState(false)

  const showTab = (next: SoloTab) => {
    setTab(next)
    // L'adresse suit l'onglet : retour arriere depuis une partie, rechargement.
    const { pathname, search, hash } = window.location
    window.history.replaceState(null, "", `${pathname}${searchWithTab(search, next)}${hash}`)
  }

  // Depuis un lien du formulaire ("Lance un defi") : le bouton clique
  // disparait avec l'onglet, le focus va sur le titre du nouveau.
  const jumpTo = (next: SoloTab) => {
    showTab(next)
    setFocusHeading(true)
  }

  useEffect(() => {
    if (!focusHeading) return
    panelRef.current?.querySelector<HTMLElement>("h2")?.focus()
    setFocusHeading(false)
  }, [focusHeading, tab])

  return (
    <div className="min-h-screen px-4 py-5 text-[#2e2014] sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">

        {/* En-tete commun a tous les modes (meme gabarit que les salles d'attente) */}
        <header className="flex items-center justify-between gap-3 border-b-2 border-[#2e2014] pb-3 sm:pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={publicPath("/logo-mark.png")} alt="blindz.app" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" />
            <div className="min-w-0">
              <p className="m-0 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] sm:text-[11px]">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-[#2e2014] bg-[#a8b8c8]" />
                Nouvelle partie
              </p>
              <h1 className="m-0 mt-0.5 font-display text-xl font-semibold sm:text-2xl">Solo</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/modes")}
            className="flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quitter
          </button>
        </header>

        <TabBar active={tab} onChange={showTab} />

        <div ref={panelRef} role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} className="flex flex-col gap-6">
          {tab === "classic" && <ClassicForm settings={settings} onJump={jumpTo} />}
          {tab === "chrono" && <ChronoForm settings={settings} />}
          {tab === "challenge" && <ChallengeTab settings={settings} />}

          <p className="px-1 text-[13px] leading-relaxed text-[#6b573f]">{HELP[tab]}</p>
        </div>
      </div>
    </div>
  )
}
