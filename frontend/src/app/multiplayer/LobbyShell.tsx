"use client"

import type { ReactNode } from "react"
import { ArrowLeft, ArrowLeftRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GameMode } from "@/lib/gameModes"

// Accents "Club analogique" : friends terracotta, event or, streamer sauge.
const ANALOG_ACCENTS: Record<GameMode, string> = {
  friends: "#c65133",
  event: "#e0a32e",
  streamer: "#7d9471",
}

type LobbyShellProps = {
  mode: GameMode
  title: string
  subtitle: string
  onLeave: () => void
  onChangeMode?: () => void
  hideHeader?: boolean
  error?: string | null
  dataAttrs?: Record<string, string>
  stage?: "entry" | "lobby" | "game" | "results"
  children: ReactNode
}

export function LobbyShell({
  mode,
  title,
  subtitle,
  onLeave,
  onChangeMode,
  hideHeader,
  error,
  dataAttrs,
  stage = "entry",
  children,
}: LobbyShellProps) {
  const accent = ANALOG_ACCENTS[mode] ?? "#c65133"
  return (
    <main className="min-h-screen text-[#2e2014]" {...(dataAttrs ?? {})}>
      <div className={`relative mx-auto flex w-full flex-col ${stage === "game" ? "gap-0" : "max-w-6xl gap-6 px-6 py-8"}`}>
        {!hideHeader ? (
          <LobbyHeader
            mode={mode}
            title={title}
            subtitle={subtitle}
            onLeave={onLeave}
            onChangeMode={onChangeMode}
            stage={stage}
            accent={accent}
          />
        ) : null}
        {error ? (
          <div className="rounded-md border-2 border-[#9c2f1d] bg-[#efe5d0] px-6 py-4 text-sm font-semibold text-[#9c2f1d] shadow-[4px_4px_0_rgba(46,32,20,.18)]">{error}</div>
        ) : null}
        {children}
      </div>
    </main>
  )
}

function LobbyHeader({
  mode,
  title,
  subtitle,
  onLeave,
  onChangeMode,
  stage,
  accent,
}: {
  mode: GameMode
  title: string
  subtitle: string
  onLeave: () => void
  onChangeMode?: () => void
  stage: LobbyShellProps["stage"]
  accent: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b-2 border-[#2e2014] pb-4">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.32em]" style={{ color: accent }}>
          {mode} · {stage === "entry" ? "Entrée" : stage === "lobby" ? "Lobby" : stage === "game" ? "Jeu" : "Résultats"}
        </p>
        <h1 className="mt-1 truncate font-display text-2xl font-semibold text-[#2e2014]">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onChangeMode ? (
          <button
            type="button"
            onClick={onChangeMode}
            className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Mode
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quitter
        </button>
      </div>
    </div>
  )
}
