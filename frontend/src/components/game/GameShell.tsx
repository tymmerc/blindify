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
}

export function GameShell({ mode, header, main, side, participationStrip, variant = "balanced" }: GameShellProps) {
  const padding = mode === "event" ? "24px" : mode === "friends" ? "16px" : "18px"
  const gapSize = mode === "event" ? "20px" : mode === "friends" ? "12px" : spacing.gap
  const gridClass = side
    ? variant === "wide"
      ? "grid lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]"
      : "grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]"
    : "grid"

  return (
    <div className="flex flex-col gap-4 text-ink" data-mode={mode}>
      <div className="sticky top-0 z-10 flex items-center justify-end gap-3 bg-paper px-4 py-2 text-sm text-ink-2">
        {header}
      </div>

      <div className={gridClass} style={{ gap: gapSize }}>
        <div
          className="border-2 border-line bg-paper-deep shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]"
          style={{ borderRadius: radii.card, padding: padding }}
        >
          {main}
        </div>
        {side ? (
          <aside
            className="border-2 border-line bg-paper-deep shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]"
            style={{ borderRadius: radii.card, padding: padding }}
          >
            {side}
          </aside>
        ) : null}
      </div>

      {participationStrip ? (
        <div
          className="border-[1.5px] border-[rgb(var(--c-line)/.22)] bg-paper-deep"
          style={{ borderRadius: radii.card, padding: mode === "streamer" ? "12px" : "14px" }}
        >
          {participationStrip}
        </div>
      ) : null}
    </div>
  )
}
