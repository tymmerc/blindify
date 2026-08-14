"use client"

// Le plateau du mode "un seul tel" : une zone par joueur, tout le monde pose son
// doigt sur CE telephone. Quand toutes les zones sont tenues la manche demarre,
// et le premier qui lache sa zone gagne le droit de repondre.
//
// Multi-touch : chaque pointerId est associe a UNE zone. On ecoute au niveau du
// plateau (pas des zones) pour que le doigt qui glisse un peu ne "lache" pas.
// Limite materielle : la plupart des iPhone suivent 5 doigts max.

import { useCallback, useEffect, useRef, useState } from "react"

export type BoardPhase = "arming" | "countdown" | "holding"

export type BuzzPlayer = { name: string; color: string; eliminated: boolean }

export function FingerBoard({
  players,
  phase,
  countdown,
  tapMode,
  onAllHeld,
  onBroken,
  onLift,
}: {
  players: BuzzPlayer[]
  phase: BoardPhase
  countdown: number | null
  /** Debug / E2E (?tap dans l'URL) : un clic pose ou leve le doigt. */
  tapMode: boolean
  /** Toutes les zones actives sont tenues. */
  onAllHeld: () => void
  /** Un doigt est parti pendant le decompte : on repart en attente. */
  onBroken: () => void
  /** Un joueur a lache pendant la musique (le buzz). */
  onLift: (playerIndex: number) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const zoneRefs = useRef<(HTMLDivElement | null)[]>([])
  // pointerId -> index de zone
  const pointerZone = useRef<Map<number, number>>(new Map())
  const [held, setHeld] = useState<boolean[]>(() => players.map(() => false))
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const activeIdx = players.map((p, i) => (p.eliminated ? -1 : i)).filter(i => i >= 0)

  const setZoneHeld = useCallback((idx: number, value: boolean) => {
    setHeld(prev => {
      if (prev[idx] === value) return prev
      const next = [...prev]
      next[idx] = value
      return next
    })
  }, [])

  // Toutes les zones actives tenues -> on previent le parent (une seule fois par passage).
  const allHeld = activeIdx.length > 0 && activeIdx.every(i => held[i])
  const allHeldNotified = useRef(false)
  useEffect(() => {
    if (phase !== "arming") { allHeldNotified.current = false; return }
    if (allHeld && !allHeldNotified.current) {
      allHeldNotified.current = true
      onAllHeld()
    }
    if (!allHeld) allHeldNotified.current = false
  }, [allHeld, phase, onAllHeld])

  const zoneAtPoint = useCallback((x: number, y: number): number => {
    for (let i = 0; i < zoneRefs.current.length; i++) {
      const el = zoneRefs.current[i]
      if (!el || players[i]?.eliminated) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
    }
    return -1
  }, [players])

  const releaseZone = useCallback((idx: number) => {
    setZoneHeld(idx, false)
    if (phaseRef.current === "countdown") onBroken()
    else if (phaseRef.current === "holding") onLift(idx)
  }, [setZoneHeld, onBroken, onLift])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return

    const down = (e: PointerEvent) => {
      e.preventDefault()
      const idx = zoneAtPoint(e.clientX, e.clientY)
      if (idx < 0 || pointerZone.current.has(e.pointerId)) return
      // une zone = un seul doigt (pas de "je tiens pour deux")
      if ([...pointerZone.current.values()].includes(idx)) return
      if (tapMode) {
        // debug : clic = toggle
        if (heldRef.current[idx]) releaseZone(idx)
        else setZoneHeld(idx, true)
        return
      }
      pointerZone.current.set(e.pointerId, idx)
      setZoneHeld(idx, true)
    }
    const up = (e: PointerEvent) => {
      const idx = pointerZone.current.get(e.pointerId)
      if (idx === undefined) return
      pointerZone.current.delete(e.pointerId)
      releaseZone(idx)
    }

    board.addEventListener("pointerdown", down)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      board.removeEventListener("pointerdown", down)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
  }, [zoneAtPoint, releaseZone, setZoneHeld, tapMode])

  // tapMode a besoin de lire l'etat courant dans le handler
  const heldRef = useRef(held)
  heldRef.current = held

  // Une manche recommence : plus personne ne tient rien.
  useEffect(() => {
    if (phase === "arming") {
      pointerZone.current.clear()
      setHeld(players.map(() => false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, players.length])

  const holding = phase === "holding"

  return (
    <div
      ref={boardRef}
      className="relative grid h-full w-full select-none gap-2 p-2"
      style={{
        touchAction: "none",
        gridTemplateColumns: players.length > 2 ? "1fr 1fr" : "1fr",
        gridAutoRows: "1fr",
      }}
    >
      {players.map((p, i) => (
        <div
          key={i}
          ref={el => { zoneRefs.current[i] = el }}
          className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-[#2e2014] transition-colors duration-200"
          style={{
            background: p.eliminated
              ? "#d8cdb4"
              : holding
                ? held[i] ? "#b3261e" : "#7a1712"
                : held[i] ? p.color : "#ece1c8",
            opacity: p.eliminated ? 0.45 : 1,
          }}
        >
          <span
            className="font-display text-xl font-bold"
            style={{ color: holding ? "#f4ecdb" : held[i] ? "#f4ecdb" : "#2e2014" }}
          >
            {p.name}
          </span>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: holding ? "#f4ecdb" : "#6b573f" }}>
            {p.eliminated ? "Éliminé cette manche" : holding ? "LÂCHE POUR RÉPONDRE" : held[i] ? "Tiens bon…" : "Pose ton doigt ici"}
          </span>
        </div>
      ))}
      {phase === "countdown" && countdown !== null && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <span className="font-display text-[7rem] font-bold leading-none text-[#2e2014] drop-shadow-[3px_3px_0_#f4ecdb]">
            {countdown}
          </span>
        </div>
      )}
    </div>
  )
}
