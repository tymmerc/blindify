"use client"

import type { ReactNode } from "react"
import { ArrowLeft, ArrowLeftRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GameMode } from "@/lib/gameModes"
import { modeAccent } from "@/lib/uiTokens"

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
  const accent = modeAccent(mode)
  return (
    <main className="min-h-screen bg-[#050505] text-white" {...(dataAttrs ?? {})}>
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
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-200">{error}</div>
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
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
          {mode} · {stage === "entry" ? "Entrée" : stage === "lobby" ? "Lobby" : stage === "game" ? "Jeu" : "Résultats"}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-white truncate">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onChangeMode ? (
          <button
            type="button"
            onClick={onChangeMode}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/5 hover:text-white/80"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Mode
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/5 hover:text-white/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quitter
        </button>
      </div>
    </div>
  )
}
