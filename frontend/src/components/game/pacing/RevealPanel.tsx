"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { pacingScreen, secondsUntil } from "@/lib/roundPacing"
import type { MultiplayerGameState, MultiplayerPlayerState, RevealStep } from "@/lib/types"
import { RoundAnswerScreen } from "./RoundAnswerScreen"
import { RoundScoreboard } from "./RoundScoreboard"

export interface RevealPanelProps {
  state: MultiplayerGameState
  /** Joueurs de la manche (presentateur d'un event deja retire). */
  players: MultiplayerPlayerState[]
  /** Le joueur de cet ecran ; null sur l'ecran central et chez un spectateur. */
  meId: number | null
  /** « Suivant » : seulement chez l'hote. */
  onNext?: (round: number, step: RevealStep) => void
  /** Heure serveur fine (useServerClock). */
  now: number
  /** Ecran central d'une partie autour d'une table. */
  large?: boolean
  /** Remplit la hauteur de son parent et fait defiler son contenu (vue a distance). */
  fill?: boolean
}

/**
 * Les ecrans entre deux manches (T38) : la reponse puis le classement, a
 * l'heure decidee par le serveur. En bas : le temps qui reste, et le bouton
 * « Suivant » chez l'hote.
 */
export function RevealPanel({ state, players, meId, onNext, now, large = false, fill = false }: RevealPanelProps) {
  const screen = pacingScreen(state, now)
  const step: RevealStep = screen === "scores" ? "scores" : "answer"
  const endsAt = state.pacing?.endsAt ?? null
  const left = secondsUntil(endsAt, now)
  const span = state.pacing?.ms ?? 0
  const progress = endsAt && span > 0 ? Math.min(1, Math.max(0, (endsAt - now) / span)) : 0
  const finished = state.phase === "FINISHED"

  return (
    <section
      className={`flex w-full flex-col rounded-md border-2 border-line bg-paper shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] ${fill ? "h-full min-h-0" : ""}`}
      data-testid="entre-manches"
      data-step={finished ? "fin" : step}
    >
      <div className="h-1.5 shrink-0 overflow-hidden rounded-t-sm bg-line/10" aria-hidden>
        <div className="h-full bg-line/45 transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className={`${fill ? "min-h-0 flex-1 overflow-y-auto" : ""} px-4 py-4 sm:px-6 sm:py-5`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${state.currentRound}-${step}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {step === "scores" ? (
              <RoundScoreboard players={players} round={state.currentRound} meId={meId} large={large} />
            ) : (
              <RoundAnswerScreen track={state.currentTrack} players={players} meId={meId} large={large} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 rounded-b-md border-t border-line/20 bg-paper px-4 py-3 sm:px-6">
        <span className="text-sm text-ink-2" aria-live="off">
          {finished ? "Place au podium" : state.paused ? "En pause" : endsAt ? (
            <>Suite dans <b className="font-mono text-ink">{left}</b> s</>
          ) : null}
        </span>
        {onNext && !finished ? (
          <button
            type="button"
            onClick={() => onNext(state.currentRound, step)}
            disabled={state.paused}
            className="inline-flex items-center gap-2 rounded-md border-2 border-line bg-ink-block px-5 py-2.5 font-bold text-on-ink shadow-[3px_3px_0_rgb(var(--c-shadow)/.25)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            data-testid="suivant"
          >
            Suivant <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : !finished ? (
          <span className="text-xs text-ink-2">L&apos;hôte peut passer</span>
        ) : null}
      </div>
    </section>
  )
}
