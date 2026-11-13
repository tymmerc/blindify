"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { PlayerAvatar } from "@/components/ui/PlayerAvatar"
import { placeLabel, playerTone } from "@/lib/roundPacing"
import { ConfettiBurst } from "../ConfettiBurst"

export interface PodiumPlayer {
  userId: number
  username: string | null
  avatar?: string | null
  score: number
}

export interface GamePodiumProps {
  /** Classement final, deja trie (points, puis vitesse). */
  ranked: PodiumPlayer[]
  /** Le joueur de cet ecran ; null sur l'ecran central et chez un spectateur. */
  meId?: number | null
  large?: boolean
}

// Revelation une place apres l'autre (ms depuis l'arrivee sur l'ecran).
const SHOW_THIRD = 900
const SHOW_SECOND = 2_700
const TEASE_FIRST = 4_300
const SHOW_FIRST = 5_600
const SHOW_REST = 6_600

const name = (p: PodiumPlayer | undefined) => p?.username?.trim() || "Joueur"

const BLOCK: Record<number, { height: string; tone: string }> = {
  1: { height: "h-40 sm:h-48", tone: "bg-gold text-on-accent" },
  2: { height: "h-28 sm:h-36", tone: "bg-paper-strong text-ink" },
  3: { height: "h-20 sm:h-28", tone: "bg-ambre text-on-accent" },
}

/** Ecoule le temps de la revelation ; tout de suite a la fin si l'animation est coupee. */
function useElapsed(reduce: boolean): number {
  const [elapsed, setElapsed] = useState(reduce ? SHOW_REST : 0)
  useEffect(() => {
    if (reduce) return
    const timers = [SHOW_THIRD, SHOW_SECOND, TEASE_FIRST, SHOW_FIRST, SHOW_REST].map(at => setTimeout(() => setElapsed(at), at))
    return () => timers.forEach(clearTimeout)
  }, [reduce])
  return elapsed
}

/**
 * Le podium de fin de partie (T38) : la 3e place, la 2e, puis la 1re, l'une
 * apres l'autre, et le reste du classement en une ligne.
 */
export function GamePodium({ ranked, meId = null, large = false }: GamePodiumProps) {
  const reduce = useReducedMotion() === true
  const elapsed = useElapsed(reduce)
  const [first, second, third] = ranked
  // Seul joueur : pas de suspense, il apparait tout de suite.
  const firstAt = second ? SHOW_FIRST : SHOW_THIRD
  const shown = (place: number) => elapsed >= (place === 3 ? SHOW_THIRD : place === 2 ? SHOW_SECOND : firstAt)

  let captionText = "Et sur le podium…"
  if (elapsed >= firstAt) {
    captionText = first && first.score > 0 ? `${name(first)} gagne la partie !` : "Personne n'a marqué. On rejoue ?"
  } else if (elapsed >= TEASE_FIRST) captionText = "Et la 1re place…"
  else if (elapsed >= SHOW_SECOND && second) captionText = `2e place : ${name(second)}`
  else if (elapsed >= SHOW_THIRD && third) captionText = `3e place : ${name(third)}`

  const steps = [
    { place: 2, player: second },
    { place: 1, player: first },
    { place: 3, player: third },
  ].filter((s): s is { place: number; player: PodiumPlayer } => Boolean(s.player))

  const rest = ranked.slice(3)

  return (
    <div className="relative flex w-full flex-col items-center gap-3 text-center" data-testid="podium">
      {elapsed >= firstAt && first && first.score > 0 ? <ConfettiBurst /> : null}
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.3em] text-terra-txt">Partie terminée</p>
      <h2 className={`m-0 font-display font-semibold leading-none text-ink ${large ? "text-6xl" : "text-5xl"}`}>Le podium</h2>
      <p className="m-0 min-h-[1.75rem] font-display text-xl italic text-ink" aria-live="polite">{captionText}</p>
      <div
        className="mt-4 grid w-full max-w-xl items-end gap-3"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map(({ place, player }) => {
          const on = shown(place)
          const isMe = player.userId === meId
          return (
            <div key={player.userId} className="flex min-w-0 flex-col items-center gap-1.5" data-place={place}>
              <motion.div
                initial={false}
                animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
                transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                className="flex min-w-0 max-w-full flex-col items-center gap-1"
                aria-hidden={!on}
              >
                {place === 1 ? <span aria-hidden className="text-2xl leading-none text-gold-deep-txt">♛</span> : null}
                <PlayerAvatar
                  name={player.username}
                  avatarUrl={player.avatar}
                  className={`border-2 border-line ${place === 1 ? "h-16 w-16 text-2xl" : "h-12 w-12 text-lg"}`}
                  style={playerTone(player.userId)}
                />
                <span className="max-w-full truncate font-display text-lg font-semibold text-ink">
                  {name(player)}
                  {isMe ? <span className="ml-1 font-sans text-xs font-bold">(toi)</span> : null}
                </span>
                <span className="font-mono text-base font-bold text-ink">{player.score} pts</span>
              </motion.div>
              <div
                className={`flex w-full items-start justify-center rounded-t-md border-2 border-b-0 border-line pt-2 font-display text-4xl font-bold shadow-[4px_0_0_rgb(var(--c-shadow)/.18)] ${BLOCK[place].height} ${BLOCK[place].tone}`}
              >
                {place}
                <sup className="mt-1 text-base">{place === 1 ? "er" : "e"}</sup>
              </div>
            </div>
          )
        })}
      </div>
      <div className="h-[3px] w-full max-w-xl bg-line" aria-hidden />
      {rest.length > 0 ? (
        <motion.p
          initial={false}
          animate={{ opacity: elapsed >= SHOW_REST ? 1 : 0 }}
          className="m-0 max-w-xl text-sm leading-relaxed text-ink-2"
        >
          {rest.map((p, i) => (
            <span key={p.userId} className="whitespace-nowrap">
              {i > 0 ? <span aria-hidden> · </span> : null}
              {placeLabel(i + 3)} {name(p)}
              {p.userId === meId ? " (toi)" : ""} <b className="font-mono text-ink">{p.score}</b>
            </span>
          ))}
        </motion.p>
      ) : null}
    </div>
  )
}
