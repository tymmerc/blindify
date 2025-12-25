"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GameMode } from "@/lib/gameModes"
import { modeAccent } from "@/lib/uiTokens"

type LobbyShellProps = {
  mode: GameMode
  title: string
  subtitle: string
  onLeave: () => void
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
  hideHeader,
  error,
  dataAttrs,
  stage = "entry",
  children,
}: LobbyShellProps) {
  const accent = modeAccent(mode)
  return (
    <main className="min-h-screen bg-black text-white" {...(dataAttrs ?? {})}>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        {!hideHeader ? (
          <LobbyHeader mode={mode} title={title} subtitle={subtitle} onLeave={onLeave} stage={stage} accent={accent} />
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
  stage,
  accent,
}: {
  mode: GameMode
  title: string
  subtitle: string
  onLeave: () => void
  stage: LobbyShellProps["stage"]
  accent: string
}) {
  return (
    <div
      className="sticky top-6 z-10 flex flex-col gap-6 rounded-2xl border bg-[var(--ma-surface)]/95 p-8 backdrop-blur"
      style={{ borderColor: accent, boxShadow: `0 10px 40px ${accent}22` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">
              Multijoueur · {mode} · {stage === "entry" ? "Entrée" : stage === "lobby" ? "Lobby" : stage === "game" ? "Jeu" : "Résultats"}
            </p>
            <h1 className="text-3xl font-bold leading-tight" style={{ color: accent }}>
              {title}
            </h1>
            <p className="text-sm text-[var(--ma-muted)]">{subtitle}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onLeave}
          className="gap-2 rounded-full bg-transparent text-white hover:bg-white/10"
          style={{ borderColor: accent, color: accent }}
        >
          <ArrowLeft className="h-4 w-4" />
          Quitter
        </Button>
      </div>
    </div>
  )
}
