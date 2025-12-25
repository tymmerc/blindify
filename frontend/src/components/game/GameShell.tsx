"use client"

import type { ReactNode } from "react"
import type { GameMode } from "@/lib/gameModes"
import { spacing, radii } from "@/lib/uiTokens"

type GameShellProps = {
  mode: GameMode
  header: ReactNode
  main: ReactNode
  side?: ReactNode
  participationStrip?: ReactNode
  variant?: "balanced" | "wide"
  phase?: string
  actions?: ReactNode
}

export function GameShell({ mode, header, main, side, participationStrip, variant = "balanced", phase, actions }: GameShellProps) {
  const padding = mode === "event" ? "24px" : mode === "friends" ? "16px" : "18px"
  const gapSize = mode === "event" ? "20px" : mode === "friends" ? "12px" : spacing.gap
  const gridClass = side
    ? variant === "wide"
      ? "grid lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]"
      : "grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]"
    : "grid"

  return (
    <div className="flex flex-col gap-4" data-mode={mode}>
      <div className="rounded-2xl border border-white/10 bg-black/60" style={{ borderRadius: radii.card, padding: padding }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#b0b0b0)]">
          <span>{mode}</span>
          <div className="flex items-center gap-2">
            {phase ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] tracking-[0.25em] text-white">
                {phase}
              </span>
            ) : null}
            {actions}
          </div>
        </div>
        {header}
      </div>

      <div className={gridClass} style={{ gap: gapSize }}>
        <div
          className="rounded-2xl border border-white/10 bg-black/70"
          style={{ borderRadius: radii.card, padding: padding }}
        >
          {main}
        </div>
        {side ? (
          <aside
            className="rounded-2xl border border-white/10 bg-black/70"
            style={{ borderRadius: radii.card, padding: padding }}
          >
            {side}
          </aside>
        ) : null}
      </div>

      {participationStrip ? (
        <div
          className="rounded-2xl border border-white/10 bg-black/70"
          style={{ borderRadius: radii.card, padding: mode === "chat" ? "12px" : "14px" }}
        >
          {participationStrip}
        </div>
      ) : null}
    </div>
  )
}
