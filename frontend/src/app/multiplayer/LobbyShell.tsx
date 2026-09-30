"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import type { GameMode } from "@/lib/gameModes"
import { publicPath } from "@/lib/publicPath"
import { Label } from "./lobbyKit"

// Couleurs de mode "Club analogique" : a distance terracotta, table or, streamer sauge.
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
  hideHeader?: boolean
  error?: string | null
  errorAction?: { label: string; onClick: () => void } | null
  dataAttrs?: Record<string, string>
  stage?: "entry" | "lobby" | "game" | "results"
  isGuest?: boolean
  children: ReactNode
}

export function LobbyShell({
  mode,
  title,
  onLeave,
  hideHeader,
  error,
  errorAction,
  dataAttrs,
  stage = "entry",
  children,
}: LobbyShellProps) {
  const accent = ANALOG_ACCENTS[mode] ?? "#c65133"
  return (
    <main className="min-h-screen text-[#2e2014]" {...(dataAttrs ?? {})}>
      <div className={`relative mx-auto flex w-full flex-col ${stage === "game" ? "gap-0" : "min-h-screen max-w-6xl gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8"}`}>
        {!hideHeader ? <LobbyHeader title={title} onLeave={onLeave} stage={stage} accent={accent} /> : null}
        {error ? (
          <div className="flex flex-col gap-3 rounded-md border-2 border-[#9c2f1d] bg-[#efe5d0] px-5 py-4 text-sm font-semibold text-[#9c2f1d] shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            {errorAction ? (
              <button
                type="button"
                onClick={errorAction.onClick}
                className="shrink-0 self-start rounded-full border-2 border-[#9c2f1d] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#9c2f1d] transition hover:bg-[#9c2f1d] hover:text-[#efe5d0] sm:self-auto"
              >
                {errorAction.label}
              </button>
            ) : null}
          </div>
        ) : null}
        {stage === "entry" ? (
          // Entrée : peu de contenu, on le centre verticalement pour ne pas laisser
          // un océan de vide sur grand écran (sinon la carte colle sous le header).
          <div className="flex flex-1 items-center justify-center py-4">{children}</div>
        ) : (
          children
        )}
      </div>
    </main>
  )
}

/** Logo, ou on en est, le nom du mode, et une seule sortie. Le bouton "Mode"
 *  d'avant faisait exactement la meme chose que "Quitter" (retour au choix des
 *  modes) et un invite pouvait croire changer le mode de toute la salle. */
function LobbyHeader({
  title,
  onLeave,
  stage,
  accent,
}: {
  title: string
  onLeave: () => void
  stage: LobbyShellProps["stage"]
  accent: string
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b-2 border-[#2e2014] pb-3 sm:pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <img src={publicPath("/logo-mark.png")} alt="blindz.app" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" />
        <div className="min-w-0">
          <Label dot={accent} className="text-[10px] text-[#2e2014] sm:text-[11px]">
            {stage === "entry" ? "Nouvelle partie" : "Salle d'attente"}
          </Label>
          <h1 className="m-0 mt-0.5 truncate font-display text-xl font-semibold text-[#2e2014] sm:text-2xl">{title}</h1>
        </div>
      </div>
      <button
        type="button"
        onClick={onLeave}
        className="flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Quitter
      </button>
    </header>
  )
}
