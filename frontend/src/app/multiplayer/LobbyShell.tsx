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
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
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
    <div className="sticky top-6 z-10 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0c0c0c] p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            Multijoueur · {mode} · {stage === "entry" ? "Entrée" : stage === "lobby" ? "Lobby" : stage === "game" ? "Jeu" : "Résultats"}
          </p>
          <h1 className="text-3xl font-bold leading-tight text-white">{title}</h1>
          <p className="text-sm text-white/65">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onChangeMode ? (
            <Button
              variant="outline"
              onClick={onChangeMode}
              className="gap-2 rounded-full border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              style={{ borderColor: accent, color: accent }}
            >
              <ArrowLeftRight className="h-4 w-4" />
              Changer de mode
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={onLeave}
            className="gap-2 rounded-full border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            style={{ borderColor: accent, color: accent }}
          >
            <ArrowLeft className="h-4 w-4" />
            Quitter
          </Button>
        </div>
      </div>
    </div>
  )
}
