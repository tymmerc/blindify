"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// Split-screen epingle : l'illustration reste fixe a gauche pendant que les
// trois facons de jouer defilent a droite. Le texte des modes est rendu cote
// serveur (children) : cet ilot ne fait que suivre le scroll.
//
// Le fondu entre les scenes est PILOTE par la position de scroll, en continu :
// chaque scene a une opacite proportionnelle a la proximite de son bloc avec
// la ligne focale de l'ecran. On remonte, ca revient ; pas de seuil, pas de
// clignotement a la frontiere (c'etait un IntersectionObserver avant).
export type ModeKey = "table" | "untel" | "distance"

const ORDER: ModeKey[] = ["table", "untel", "distance"]

const LABELS: Record<ModeKey, string> = {
  table: "Un écran au milieu, un tel par joueur",
  untel: "Un seul téléphone, un doigt chacun",
  distance: "Chacun chez soi, un code à partager",
}

type Weights = Record<ModeKey, number>
const INITIAL: Weights = { table: 1, untel: 0, distance: 0 }

export function ModesStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [weights, setWeights] = useState<Weights>(INITIAL)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const items = ORDER.map(k => root.querySelector<HTMLElement>(`[data-mode="${k}"]`))
    if (items.some(el => !el)) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    let raf = 0
    const compute = () => {
      raf = 0
      const vh = window.innerHeight || 1
      const focal = vh * 0.42
      const range = vh * 0.55
      const raw = ORDER.map((k, i) => {
        const r = items[i]!.getBoundingClientRect()
        // Distance entre le centre du bloc et la ligne focale, en fraction de range.
        const d = Math.abs((r.top + r.height / 2) - focal) / range
        return [k, Math.max(0, 1 - d)] as const
      })
      // Normalise : la scene la plus proche est pleine, les autres s'effacent.
      const max = Math.max(...raw.map(([, w]) => w), 0.0001)
      const next: Weights = { table: 0, untel: 0, distance: 0 }
      for (const [k, w] of raw) next[k] = reduce ? (w === max ? 1 : 0) : Math.pow(w / max, 2.2)
      setWeights(prev => (ORDER.every(k => Math.abs(prev[k] - next[k]) < 0.01) ? prev : next))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute) }
    compute()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const active = ORDER.reduce((best, k) => (weights[k] > weights[best] ? k : best), "table" as ModeKey)

  return (
    <div ref={ref} className="lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
      {/* Mobile : bandeau compact colle en haut (le dessin change pendant que
          les modes defilent dessous). Desktop : panneau epingle a gauche. */}
      <div className="sticky top-0 z-10 -mx-5 mb-8 flex items-center gap-4 border-b-2 border-[#2e2014] bg-[#ece1c8] px-5 py-3 sm:-mx-8 sm:px-8 lg:top-24 lg:z-auto lg:mx-0 lg:mb-0 lg:block lg:self-start lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <div className="relative aspect-[4/3] w-28 shrink-0 sm:w-36 lg:w-full lg:max-w-[520px]">
          {ORDER.map(k => <Scene key={k} mode={k} opacity={weights[k]} />)}
        </div>
        <p className="font-mono text-[10px] font-bold uppercase leading-snug tracking-[0.14em] text-[#6b573f] sm:text-[11px] lg:mt-4 lg:tracking-[0.2em]">
          {LABELS[active]}
        </p>
      </div>
      <div>{children}</div>
    </div>
  )
}

// Trois scenes dessinees au trait, encre espresso + terracotta, en SVG inline
// (aucune image a charger, pas de CDN). L'opacite vient du scroll.
function Scene({ mode, opacity }: { mode: ModeKey; opacity: number }) {
  return (
    <svg
      viewBox="0 0 400 300"
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{ opacity }}
      fill="none"
      stroke="#2e2014"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {mode === "table" && (
        <>
          {/* Ecran central */}
          <rect x="90" y="30" width="220" height="130" rx="8" fill="#ece1c8" />
          <path d="M170 160 v18 M230 160 v18 M150 178 h100" />
          {/* Onde qui joue */}
          <path d="M120 95 q10 -30 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#cc4830" />
          {/* QR stylise */}
          <g fill="#2e2014" stroke="none">
            <rect x="262" y="42" width="34" height="34" rx="2" fill="none" stroke="#2e2014" strokeWidth="3" />
            <rect x="268" y="48" width="8" height="8" /><rect x="284" y="48" width="6" height="6" />
            <rect x="268" y="62" width="6" height="6" /><rect x="280" y="60" width="10" height="10" />
          </g>
          {/* Trois telephones autour de la table */}
          <rect x="40" y="200" width="54" height="86" rx="10" fill="#f4ecdb" />
          <rect x="173" y="212" width="54" height="86" rx="10" fill="#f4ecdb" />
          <rect x="306" y="200" width="54" height="86" rx="10" fill="#f4ecdb" />
          <circle cx="67" cy="240" r="9" fill="#cc4830" stroke="none" />
          <circle cx="200" cy="252" r="9" fill="#cc4830" stroke="none" />
          <circle cx="333" cy="240" r="9" fill="#486090" stroke="none" />
        </>
      )}
      {mode === "untel" && (
        <>
          {/* Un grand telephone a plat */}
          <rect x="100" y="20" width="200" height="260" rx="22" fill="#f4ecdb" />
          <rect x="116" y="40" width="168" height="222" rx="12" fill="#ece1c8" />
          {/* Cinq zones : quatre doigts poses, un qui vient de lacher */}
          <circle cx="160" cy="95" r="22" fill="#d88418" stroke="none" />
          <circle cx="240" cy="95" r="22" fill="#d88418" stroke="none" />
          <circle cx="160" cy="175" r="22" fill="#d88418" stroke="none" />
          <circle cx="240" cy="175" r="22" fill="#d88418" stroke="none" />
          <circle cx="200" cy="235" r="22" fill="none" stroke="#cc4830" strokeDasharray="6 6" />
          {/* Le doigt leve */}
          <path d="M200 235 v-42" stroke="#cc4830" />
          <circle cx="200" cy="184" r="6" fill="#cc4830" stroke="none" />
        </>
      )}
      {mode === "distance" && (
        <>
          {/* Trois ecrans eloignes */}
          <rect x="24" y="40" width="96" height="66" rx="8" fill="#f4ecdb" />
          <rect x="280" y="30" width="96" height="66" rx="8" fill="#f4ecdb" />
          <rect x="150" y="200" width="96" height="66" rx="8" fill="#f4ecdb" />
          <circle cx="72" cy="73" r="8" fill="#486090" stroke="none" />
          <circle cx="328" cy="63" r="8" fill="#486090" stroke="none" />
          <circle cx="198" cy="233" r="8" fill="#486090" stroke="none" />
          {/* Liens pointilles vers le code */}
          <path d="M120 80 L170 130 M280 70 L230 130 M198 200 L198 165" stroke="#486090" strokeDasharray="5 7" />
          {/* Le code a 6 caracteres */}
          <rect x="128" y="118" width="144" height="46" rx="6" fill="#ece1c8" />
          <text x="200" y="149" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="22" fontWeight="700" fill="#2e2014" stroke="none" letterSpacing="4">
            K7X2QA
          </text>
        </>
      )}
    </svg>
  )
}
