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
 * Un seul tour (choix de Tym le 05/10, WCAG 2.2.2 « Pause, Stop, Hide ») : les
 * 13 fins passent une fois, le 13e passage ramene la premiere, et au battement
 * suivant elle se pose (le meme HTML que le pre-rendu) et la minuterie s'arrete
 * pour de bon. Environ 31 s en tout, plus rien ne bouge ensuite.
 *
 * Le HTML pre-rendu ne contient QUE la premiere fin : c'est elle que lisent
 * Google et les IA, et ceux qui ont demande moins d'animations ne voient
 * qu'elle. Les autres n'arrivent qu'apres le chargement, dans la meme case de
 * grille. Chaque fin tient sur UNE ligne, a la meme taille que le debut du
 * titre : toutes ont la meme hauteur, donc pas de trou sous les fins courtes
 * (retour de Tym le 02/10). Pas de zone « live » : un lecteur d'ecran lit le
 * titre une fois.
 *
 * La rotation s'arrete quand l'onglet est cache et repart a son retour (une
 * periode entiere avant le passage suivant), la ou elle en etait : le tour
 * n'est pas rallonge. Elle s'arrete aussi si l'appareil passe en « moins
 * d'animations » en cours de route, et repart s'il en sort : la fin affichee
 * reste alors posee, sans lettres en mouvement. Une fois le tour fini, plus
 * rien ne la relance.
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
 * repos : posee sans animation (au chargement, ou pendant une pause).
 * entre : vient d'arriver (ses lettres basculent pour apparaitre).
 * sort : vient d'etre remplacee (ses lettres basculent pour partir).
 * attend : cachee, garde juste sa place dans la case.
 */
export type EtatFin = "repos" | "entre" | "sort" | "attend"

/**
 * Etat de la fin `i` apres `tours` passages, sur `total` fins. `pose` est le
 * nombre de passages au dernier arret (0 au chargement) : tant qu'aucun passage
 * n'a eu lieu depuis, la fin affichee est au repos et aucune ne sort.
 */
export function etatFin(i: number, tours: number, total: number, pose = 0): EtatFin {
  const index = tours % total
  if (i === index) return tours === pose ? "repos" : "entre"
  if (tours > pose && i === (index - 1 + total) % total) return "sort"
  return "attend"
}

/**
 * Lettres d'un texte telles qu'on les voit (graphemes) : une lettre et son
 * accent combine, ou un emoji compose, restent ensemble. Array.from (points de
 * code) si le navigateur n'a pas Intl.Segmenter.
 */
export function graphemes(texte: string): string[] {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return Array.from(texte)
  const segmenteur = new Intl.Segmenter("fr", { granularity: "grapheme" })
  return Array.from(segmenteur.segment(texte), s => s.segment)
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
      return graphemes(String(n)).map((c, j) => {
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

type Rotation = { tours: number; pose: number }

const avancer = (r: Rotation): Rotation => ({ ...r, tours: r.tours + 1 })
// Meme objet si rien ne change : pas de rendu pour rien.
const poser = (r: Rotation): Rotation => (r.pose === r.tours ? r : { ...r, pose: r.tours })
// Un battement de la minuterie : un passage tant que le tour n'est pas fait,
// puis on pose la premiere fin revenue.
const battre = (total: number) => (r: Rotation): Rotation => (r.tours < total ? avancer(r) : poser(r))
// Tour fait et premiere fin posee (au dernier battement ou par une pause).
const tourFini = (r: Rotation, total: number) => r.tours >= total && r.pose === r.tours

export function RotatingEnd({ endings }: { endings: ReactNode[] }) {
  // ready : la rotation a pu demarrer au moins une fois (pas de « moins
  // d'animations » demande). Avant, on garde la fin du HTML pre-rendu.
  const [ready, setReady] = useState(false)
  const [enPause, setEnPause] = useState(true)
  const [rotation, setRotation] = useState<Rotation>({ tours: 0, pose: 0 })
  const lettres = useMemo(() => endings.map(enLettres), [endings])

  // Ecoute « moins d'animations » et la visibilite de l'onglet
  useEffect(() => {
    if (endings.length < 2) return
    const requete = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    const suivre = () => {
      const reduit = Boolean(requete?.matches)
      const pause = reduit || document.hidden
      setEnPause(pause)
      if (pause) setRotation(poser)
      if (!reduit) setReady(true)
    }
    suivre()
    requete?.addEventListener?.("change", suivre)
    document.addEventListener("visibilitychange", suivre)
    return () => {
      requete?.removeEventListener?.("change", suivre)
      document.removeEventListener("visibilitychange", suivre)
    }
  }, [endings.length])

  const fini = tourFini(rotation, endings.length)
  useEffect(() => {
    if (!ready || enPause || fini) return
    const timer = window.setInterval(() => setRotation(battre(endings.length)), PERIODE_MS)
    return () => window.clearInterval(timer)
  }, [ready, enPause, fini, endings.length])

  // titre-fin des le HTML pre-rendu : meme repere avant et apres le chargement
  // (et le texte que verifie la mise en prod du front).
  if (!ready) return <span className={`titre-fin block pb-[0.12em] ${LIGNE}`}>{endings[0]}</span>

  return (
    <span className={`titre-fin grid pb-[0.12em] ${LIGNE}`}>
      {endings.map((ending, i) => {
        const etat = etatFin(i, rotation.tours, endings.length, rotation.pose)
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
