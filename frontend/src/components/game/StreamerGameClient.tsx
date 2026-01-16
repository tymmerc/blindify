"use client"

import { useMemo, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import type { StreamerState } from "@/lib/types"

type Props = {
  userId: number
  state: StreamerState | null
  serverNow: number
  onChatGuess: (guess: string) => void
  onHostGuess: (guess: string) => void
  onHostStart: () => void
  onExit?: () => void
  accent?: string
}

export function StreamerGameClient({
  userId,
  state,
  serverNow,
  onChatGuess,
  onHostGuess,
  onHostStart,
  onExit,
  accent = "#22d3ee",
}: Props) {
  const isHost = Boolean(state && state.hostUserId === userId)
  const [guess, setGuess] = useState("")
  const [locked, setLocked] = useState(false)

  const remaining = useMemo(() => {
    if (!state?.timing?.endAt) return 0
    return Math.max(0, Math.ceil((state.timing.endAt - serverNow) / 1000))
  }, [state?.timing?.endAt, serverNow])

  const timerRatio = useMemo(() => {
    if (!state?.timing?.startAt || !state.timing.endAt) return 0
    const total = state.timing.endAt - state.timing.startAt
    if (total <= 0) return 0
    const elapsed = Math.min(total, Math.max(0, serverNow - state.timing.startAt))
    return Math.min(1, elapsed / total)
  }, [state?.timing?.startAt, state?.timing?.endAt, serverNow])

  useEffect(() => {
    setLocked(false)
    setGuess("")
  }, [state?.phase, state?.currentRound])

  const isChatPhase = state?.phase === "GUESSING_CHAT"
  const isStreamerPhase = state?.phase === "GUESSING_STREAMER"
  const isOwner = Boolean(
    state?.currentTrack?.metadata &&
      typeof state.currentTrack.metadata === "object" &&
      (state.currentTrack.metadata as { owner_id?: number }).owner_id === userId
  )
  const showInput = ((!isHost && isChatPhase) || (isHost && isStreamerPhase)) && !isOwner
  const showStart = isHost && (state?.phase === "ROUND_ENDED" || state?.phase === "LOBBY")

  const phaseLabel = isHost
    ? state?.phase === "GUESSING_STREAMER"
      ? "À toi de jouer"
      : state?.phase === "GUESSING_CHAT"
        ? "Le chat répond"
        : state?.phase === "STARTING_ROUND"
          ? "Décompte"
          : "En attente"
    : isChatPhase
      ? "À toi de répondre"
      : "En attente"

  const handleSubmit = () => {
    if (!showInput || locked || !state) return
    if (!guess.trim()) return
    if (isHost) {
      onHostGuess(guess.trim())
    } else {
      onChatGuess(guess.trim())
    }
    setLocked(true)
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-[#050505] p-4 text-white">
      <header className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">Room {state?.roomCode ?? "—"}</p>
          <p className="text-lg font-semibold">
            Manche {state?.currentRound ?? 0} / {state?.totalRounds ?? 0}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onExit ? (
            <Button variant="outline" className="rounded-full border-white/20 px-3 py-1 text-xs" onClick={onExit}>
              Quitter
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0c0c0c] p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.25em] text-white/60">{phaseLabel}</p>
            <p className="text-sm text-white/70">{isHost ? "Vue streamer" : "Vue chat"}</p>
          </div>
          {remaining ? <span className="text-xs uppercase tracking-[0.3em] text-white/60">{remaining}s</span> : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="h-32 rounded-xl border border-white/10 bg-[#0f0f0f] p-3">
            <div className="grid h-full grid-cols-12 items-end gap-1">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="w-full rounded-full transition-[height] duration-150"
                  style={{
                    background: accent,
                    height: `${Math.max(8, Math.min(60, (Math.sin(Date.now() / 200 + idx) + 1) * 20 + 8))}px`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.min(100, Math.max(0, timerRatio * 100))}%`, background: accent }}
            />
          </div>
        </div>

        {state?.chatSnapshot ? (
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white/80">
            <span>Chat correct : {state.chatSnapshot.percentCorrect}%</span>
            <span>
              {state.chatSnapshot.correct}/{state.chatSnapshot.total}
            </span>
          </div>
        ) : null}

        {showInput ? (
          <div className="space-y-2">
            <input
              value={guess}
              onChange={e => setGuess(e.target.value)}
              placeholder={isHost ? "Ta réponse (streamer)" : "Réponse du chat"}
              disabled={locked}
              className="w-full rounded-xl border border-white/15 bg-[#0f0f0f] px-4 py-3 text-sm text-white outline-none focus:border-white/30"
            />
            <Button
              onClick={handleSubmit}
              disabled={locked || !guess.trim()}
              className="w-full justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
              style={{ borderColor: accent, color: accent }}
            >
              {locked ? "Réponse envoyée" : "Valider"}
            </Button>
          </div>
        ) : isOwner ? (
          <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-sm text-white/70">
            C&apos;est ta musique ! Tu ne peux pas jouer sur cette manche.
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-3 text-sm text-white/70">
            {isHost
              ? state?.phase === "GUESSING_CHAT"
                ? "Le chat répond…"
                : state?.phase === "REVEAL_FINAL"
                  ? "Révélation en cours"
                  : "En attente"
              : "En attente du reveal"}
          </div>
        )}

        {showStart ? (
          <Button
            onClick={onHostStart}
            className="w-full justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            style={{ borderColor: accent, color: accent }}
          >
            Lancer la manche
          </Button>
        ) : null}
      </div>
    </div>
  )
}
