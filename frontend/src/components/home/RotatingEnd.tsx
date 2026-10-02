"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Fin du grand titre de la landing qui defile de bas en haut (choix de Tym le
 * 02/10/2026 : « on arrive pas a choisir, on met les deux »).
 *
 * Le HTML pre-rendu ne contient QUE la premiere fin : c'est elle que lisent
 * Google et les IA, et ceux qui ont demande moins d'animations ne voient
 * qu'elle. Les autres n'arrivent qu'apres le chargement, dans la meme case de
 * grille. Chaque fin tient sur UNE ligne, a la meme taille que le debut du
 * titre : les trois ont la meme hauteur, donc pas de
 * trou sous les fins courtes (retour de Tym le 02/10). Pas de zone « live » :
 * un lecteur d'ecran lit le titre une fois.
 */
const PERIODE_MS = 2200
// Meme taille que le debut du titre (retour de Tym : pas deux tailles). C'est
// la taille du titre entier (page.tsx) qui est calee pour que « avec vos
// playlists. » tienne sur une ligne, de 320 px de large au grand ecran.
const LIGNE = "whitespace-nowrap"

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

  if (!ready) return <span className={`block pb-[0.12em] ${LIGNE}`}>{endings[0]}</span>

  return (
    <span className={`grid overflow-hidden pb-[0.12em] ${LIGNE}`}>
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
            className={`[grid-area:1/1] block transition-[transform,opacity] duration-[350ms] ease-out ${position}`}
          >
            {ending}
          </span>
        )
      })}
    </span>
  )
}
