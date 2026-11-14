"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { PlayerAvatar } from "@/components/ui/PlayerAvatar"
import { placeLabel, playerTone, rankNote, rankRows, TOP_SIZE, type RankRow } from "@/lib/roundPacing"
import type { MultiplayerPlayerState } from "@/lib/types"

export interface RoundScoreboardProps {
  players: MultiplayerPlayerState[]
  round: number
  /** Le joueur de cet ecran ; null sur l'ecran central et chez un spectateur. */
  meId: number | null
  large?: boolean
}

/** Delai avant que les places bougent : on lit d'abord le classement d'avant. */
const MOVE_DELAY_MS = 900

/** Score qui grimpe de `from` a `to`. */
function Count({ from, to, run }: { from: number; to: number; run: boolean }) {
  const [value, setValue] = useState(run ? from : to)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    if (!run || from === to) {
      setValue(to)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 700)
      setValue(Math.round(from + (to - from) * k))
      if (k < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [from, to, run])
  return <>{value}</>
}

function Move({ move }: { move: number }) {
  if (move > 0) return <span className="font-mono text-sm font-bold text-sage-deep-txt" aria-label={`monte de ${move}`}>▲{move}</span>
  if (move < 0) return <span className="font-mono text-sm font-bold text-rouge-txt" aria-label={`descend de ${-move}`}>▼{-move}</span>
  return <span aria-hidden className="w-6" />
}

/**
 * Deuxieme ecran apres une manche (T38) : le top 5, places d'avant puis les
 * montees animees, et sa propre place quand on n'est pas dans le top.
 */
export function RoundScoreboard({ players, round, meId, large = false }: RoundScoreboardProps) {
  const reduce = useReducedMotion() === true
  const rows = rankRows(players)
  const [moved, setMoved] = useState(reduce)
  useEffect(() => {
    if (reduce) return
    const t = setTimeout(() => setMoved(true), MOVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [reduce])

  const order = (r: RankRow) => (moved ? r.rank : r.prevRank)
  const shown = [...rows].sort((a, b) => order(a) - order(b)).filter(r => order(r) < TOP_SIZE)
  const me = meId != null ? rows.find(r => r.userId === meId) : undefined
  const note = rankNote(rows)

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className={`m-0 font-display font-semibold text-ink ${large ? "text-6xl" : "text-4xl"}`}>Classement</h2>
        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-terra-txt">Après la manche {round}</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        <AnimatePresence initial={false}>
          {shown.map(r => {
            const place = order(r)
            const isMe = r.userId === meId
            return (
              <motion.li
                key={r.userId}
                layout={!reduce}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3"
                data-testid="classement-joueur"
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full font-display text-xl font-bold ${
                    place === 0 ? "border-2 border-line bg-gold text-on-accent" : "text-ink"
                  }`}
                >
                  {place + 1}
                </span>
                <div
                  className={`flex items-center gap-3 rounded-md border-2 bg-paper-deep px-3 py-2 shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] ${
                    isMe ? "border-terra" : "border-line"
                  }`}
                >
                  <PlayerAvatar name={r.username} avatarUrl={r.avatar} className={`border-2 border-line ${large ? "h-12 w-12 text-lg" : "h-10 w-10 text-sm"}`} style={playerTone(r.userId)} />
                  <span className={`min-w-0 flex-1 truncate font-display font-semibold text-ink ${large ? "text-3xl" : "text-xl"}`}>
                    {r.username}
                    {isMe ? <span className="ml-2 font-sans text-xs font-bold uppercase tracking-[0.16em] text-ink-2">toi</span> : null}
                  </span>
                  {moved ? <Move move={r.move} /> : null}
                  <span className="flex flex-col items-end leading-none">
                    <span className={`font-mono text-xs font-bold ${r.gained > 0 ? "text-sage-deep-txt" : "text-sourd"}`}>+{r.gained}</span>
                    <span className={`font-mono font-bold tabular-nums text-ink ${large ? "text-3xl" : "text-2xl"}`}>
                      <Count from={r.score - r.gained} to={r.score} run={moved && !reduce} />
                    </span>
                  </span>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
      {me && me.rank >= TOP_SIZE ? (
        <>
          <p aria-hidden className="m-0 text-center tracking-[0.5em] text-sourd">···</p>
          <div className="flex items-center gap-3 rounded-md border-2 border-terra bg-paper-deep px-3 py-2 shadow-[4px_4px_0_rgb(var(--c-terra)/.35)]" data-testid="ma-place">
            <span className="font-display text-2xl font-bold text-ink">{placeLabel(me.rank)}</span>
            <PlayerAvatar name={me.username} avatarUrl={me.avatar} className="h-10 w-10 border-2 border-line text-sm" style={playerTone(me.userId)} />
            <span className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-ink">Toi</span>
            <Move move={me.move} />
            <span className="font-mono text-2xl font-bold tabular-nums text-ink">{me.score}</span>
          </div>
        </>
      ) : null}
      {note ? <p className="m-0 text-center font-display text-lg italic text-ink">{note}</p> : null}
    </div>
  )
}
