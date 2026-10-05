"use client"

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

/**
 * Fin du grand titre de la landing qui change toutes les 2,2 s (choix de Tym le
 * 02/10/2026 : « on arrive pas a choisir, on met les deux »).
 *
 * Le HTML pre-rendu ne contient QUE la premiere fin : c'est elle que lisent
 * Google et les IA, et ceux qui ont demande moins d'animations ne voient
 * qu'elle. Les autres n'arrivent qu'apres le chargement, dans la meme case de
 * grille. Chaque fin tient sur UNE ligne, a la meme taille que le debut du
 * titre : toutes ont la meme hauteur, donc pas de trou sous les fins courtes
 * (retour de Tym le 02/10). Pas de zone « live » : un lecteur d'ecran lit le
 * titre une fois.
 *
 * Passage d'une fin a l'autre (demande de Tym le 05/10) : « volets ». Les
 * lettres basculent une par une de gauche a droite, comme un panneau a
 * palettes. Tout le mouvement est en CSS (globals.css, bloc « Fin du grand
 * titre ») : ici on ne fait que poser l'etat de chaque fin et couper en lettres
 * les deux fins qui bougent.
 */
const PERIODE_MS = 2200
// Meme taille que le debut du titre (retour de Tym : pas deux tailles). C'est
// la taille du titre entier (page.tsx) qui est calee pour que la fin la plus
// longue tienne sur une ligne, de 320 px de large au grand ecran.
const LIGNE = "whitespace-nowrap"

/**
 * repos : affichee depuis le chargement, sans animation d'entree.
 * entre : vient d'arriver (ses lettres basculent pour apparaitre).
 * sort : vient d'etre remplacee (ses lettres basculent pour partir).
 * attend : cachee, garde juste sa place dans la case.
 */
export type EtatFin = "repos" | "entre" | "sort" | "attend"

/** Etat de la fin `i` apres `tours` passages, sur `total` fins. */
export function etatFin(i: number, tours: number, total: number): EtatFin {
  const index = tours % total
  if (i === index) return tours === 0 ? "repos" : "entre"
  if (tours > 0 && i === (index - 1 + total) % total) return "sort"
  return "attend"
}

/**
 * Coupe le texte d'une fin en lettres (span.volet) en gardant les <em> et leurs
 * classes. --i est le rang de la lettre dans la fin (espaces compris) : il
 * decale chaque bascule. Les espaces restent du texte simple.
 */
export function enLettres(fin: ReactNode): ReactNode {
  let rang = 0
  const couper = (n: ReactNode): ReactNode => {
    if (typeof n === "string" || typeof n === "number") {
      return Array.from(String(n), (c, j) => {
        const i = rang++
        if (c === " ") return " "
        return (
          <span key={j} className="volet" style={{ "--i": i } as CSSProperties}>
            {c}
          </span>
        )
      })
    }
    if (isValidElement<{ children?: ReactNode }>(n)) {
      return cloneElement(n, undefined, ...Children.toArray(n.props.children).map(couper))
    }
    return n
  }
  return couper(fin)
}

export function RotatingEnd({ endings }: { endings: ReactNode[] }) {
  const [ready, setReady] = useState(false)
  const [tours, setTours] = useState(0)
  const lettres = useMemo(() => endings.map(enLettres), [endings])

  useEffect(() => {
    if (endings.length < 2) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    setReady(true)
    const timer = window.setInterval(() => setTours(t => t + 1), PERIODE_MS)
    return () => window.clearInterval(timer)
  }, [endings.length])

  // titre-fin des le HTML pre-rendu : meme repere avant et apres le chargement
  // (et le texte que verifie la mise en prod du front).
  if (!ready) return <span className={`titre-fin block pb-[0.12em] ${LIGNE}`}>{endings[0]}</span>

  return (
    <span className={`titre-fin grid pb-[0.12em] ${LIGNE}`}>
      {endings.map((ending, i) => {
        const etat = etatFin(i, tours, endings.length)
        const lue = etat === "repos" || etat === "entre"
        return (
          <span key={i} data-etat={etat} aria-hidden={!lue} className="[grid-area:1/1] block">
            {etat === "entre" || etat === "sort" ? (
              <>
                {/* Les lettres separees se liraient une par une : le lecteur
                    d'ecran lit la copie entiere, invisible a l'ecran. */}
                <span aria-hidden>{lettres[i]}</span>
                <span className="sr-only">{ending}</span>
              </>
            ) : (
              ending
            )}
          </span>
        )
      })}
    </span>
  )
}
