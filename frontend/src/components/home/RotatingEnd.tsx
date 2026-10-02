"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Fin du grand titre de la landing qui defile de bas en haut (choix de Tym le
 * 02/10/2026 : « on arrive pas a choisir, on met les deux »).
 *
 * Le HTML pre-rendu ne contient QUE la premiere fin : c'est elle que lisent
 * Google et les IA, et ceux qui ont demande moins d'animations ne voient
 * qu'elle. Les autres n'arrivent qu'apres le chargement, dans la meme case de
 * grille (la hauteur ne saute pas tant qu'aucune fin n'est plus longue que la
 * premiere). Pas de zone « live » : un lecteur d'ecran lit le titre une fois.
 */
const PERIODE_MS = 2200

export function RotatingEnd({ endings }: { endings: ReactNode[] }) {
  const [ready, setReady] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (endings.length < 2) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    setReady(true)
    const timer = window.setInterval(() => setIndex(i => (i + 1) % endings.length), PERIODE_MS)
    return () => window.clearInterval(timer)
  }, [endings.length])

  if (!ready) return <span className="block">{endings[0]}</span>

  return (
    <span className="grid overflow-hidden pb-[0.12em]" aria-hidden={false}>
      {endings.map((ending, i) => {
        const offset = (i - index + endings.length) % endings.length
        // 0 = affichee ; derniere = celle qui vient de sortir (part vers le haut) ;
        // les autres attendent en dessous.
        const position =
          offset === 0 ? "translate-y-0 opacity-100" : offset === endings.length - 1 ? "-translate-y-full opacity-0" : "translate-y-full opacity-0"
        return (
          <span
            key={i}
            aria-hidden={offset !== 0}
            className={`[grid-area:1/1] block transition-[transform,opacity] duration-500 ease-out ${position}`}
          >
            {ending}
          </span>
        )
      })}
    </span>
  )
}
