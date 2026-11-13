"use client"

import { useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

export interface RoundCountdownProps {
  round: number
  totalRounds: number
  /** Heure serveur du depart de la manche (musique et chrono). */
  startAt: number | null | undefined
  /** Heure serveur fine (useServerClock). */
  now: number
  /** Ecran central : plus grand. */
  large?: boolean
}

const RADIUS = 100
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function kicker(round: number, total: number): string {
  if (round >= total) return "Dernière manche"
  if (round === 1) return "Première manche"
  return "Prochaine manche"
}

function caption(round: number, total: number): { strong: string; rest: string } {
  if (round >= total) return { strong: "C'est la dernière.", rest: " Tout se joue maintenant." }
  const left = total - round + 1
  return { strong: `Encore ${left} morceaux`, rest: ", celui-là compris." }
}

/**
 * Le 3-2-1 avant chaque manche (T38), par-dessus l'ecran de jeu. Il dure
 * jusqu'a l'heure de depart decidee par le serveur : la musique part pile a
 * la fin, chez tout le monde en meme temps.
 */
export function RoundCountdown({ round, totalRounds, startAt, now, large = false }: RoundCountdownProps) {
  const reduce = useReducedMotion() === true
  const left = startAt ? startAt - now : 0
  const visible = left > 0 && round > 0
  // Duree totale vue a l'ouverture : l'anneau se vide sur ce temps-la.
  const spanRef = useRef<{ startAt: number; span: number } | null>(null)
  if (visible && spanRef.current?.startAt !== startAt) spanRef.current = { startAt: startAt ?? 0, span: Math.max(left, 1) }
  const progress = visible && spanRef.current ? Math.min(1, left / spanRef.current.span) : 0
  const digit = Math.max(1, Math.ceil(left / 1000))
  const text = caption(round, totalRounds)

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="decompte"
          role="status"
          aria-live="polite"
          aria-label={`Manche ${round} sur ${totalRounds}, départ dans ${digit}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-paper px-6 text-center"
          data-testid="decompte-manche"
        >
          <p className="m-0 text-xs font-bold uppercase tracking-[0.3em] text-terra-txt">{kicker(round, totalRounds)}</p>
          <h2 className={`m-0 font-display font-semibold leading-none text-ink ${large ? "text-7xl" : "text-5xl"}`}>
            Manche {round} <em className="font-normal text-ink-2" style={{ fontSize: "0.55em" }}>sur {totalRounds}</em>
          </h2>
          <div className={`relative ${large ? "h-72 w-72" : "h-52 w-52"}`}>
            <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="rgb(var(--c-line) / .15)" strokeWidth="8" />
              <circle
                cx="110"
                cy="110"
                r={RADIUS}
                fill="none"
                stroke="rgb(var(--c-terra))"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                style={{ transition: "stroke-dashoffset 250ms linear" }}
              />
            </svg>
            <motion.span
              key={digit}
              initial={reduce ? false : { scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className={`absolute inset-0 grid place-items-center font-display font-bold text-ink ${large ? "text-[9rem]" : "text-8xl"}`}
            >
              {digit}
            </motion.span>
          </div>
          <p className="m-0 text-base text-ink-2">
            <b className="text-ink">{text.strong}</b>
            {text.rest}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5" aria-hidden>
            {Array.from({ length: totalRounds }, (_, i) => (
              <i
                key={i}
                className={`block h-1.5 w-6 rounded-full ${i + 1 < round ? "bg-ink" : i + 1 === round ? "bg-terra" : "bg-line/20"}`}
              />
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
