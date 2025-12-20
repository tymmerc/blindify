"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { MultiplayerGameState, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Check, Loader2, Volume2, VolumeX } from "lucide-react"

const PLAYBACK_VOLUME = 0.35;

type Props = {
  user: UserSummary
  state: MultiplayerGameState | null
  serverNow: number
  onAnswer: (guess: string, sourceUserId?: number | null) => void
  onReady: () => void
  disabled?: boolean
  autoAdvance?: boolean
}

export function MultiplayerGameClient({ user, state, serverNow, onAnswer, onReady, disabled, autoAdvance }: Props) {
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [sourceGuess, setSourceGuess] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [muted, setMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const remaining = useMemo(() => {
    if (!state?.timing?.revealAt) return 0
    return Math.max(0, Math.ceil((state.timing.revealAt - serverNow) / 1000))
  }, [state?.timing?.revealAt, serverNow])

  const currentTrack = state?.currentTrack ?? null
  const player = state?.players?.[user.id] ?? null
  const phase = state?.status ?? "lobby"
  const hasAnswered = Boolean(player?.hasAnswered)

  useEffect(() => {
    if (phase !== "playing" || !currentTrack?.previewUrl) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setIsPlaying(false)
      return
    }
    const audio = new Audio(currentTrack.previewUrl)
    audio.loop = true
    audio.volume = muted ? 0 : PLAYBACK_VOLUME
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    audioRef.current = audio
    return () => {
      audio.pause()
      setIsPlaying(false)
    }
  }, [phase, currentTrack?.previewUrl, muted])

  useEffect(() => {
    if (phase === "playing") {
      setGuessArtist("")
      setGuessTitle("")
      setSourceGuess(null)
    }
  }, [phase, state?.currentRound])

  useEffect(() => {
    if (!autoAdvance || phase !== "reveal" || disabled || player?.isReady) return
    const timer = setTimeout(() => {
      onReady()
    }, 900)
    return () => clearTimeout(timer)
  }, [autoAdvance, phase, disabled, player?.isReady])

  const leaderboard = useMemo(() => {
    if (!state?.players) return []
    return Object.values(state.players).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.accuracy - a.accuracy
    })
  }, [state?.players])

  const verdictBadge = () => {
    if (!player?.lastVerdict || phase !== "reveal") return null
    const common = "rounded-full px-2 py-[2px] text-[11px] border"
    if (player.lastVerdict === "correct") return <span className={`${common} border-emerald-400/50 bg-emerald-400/10 text-emerald-200`}>Réussi</span>
    if (player.lastVerdict === "close") return <span className={`${common} border-amber-400/50 bg-amber-400/10 text-amber-100`}>Presque</span>
    return <span className={`${common} border-rose-400/50 bg-rose-400/10 text-rose-100`}>Raté</span>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-2xl border border-white/10 bg-black/60 p-6 shadow-lg">
        <div className="flex items-center justify-between text-sm text-[var(--ma-muted,#a0a0a0)]">
          <span>Manche {state?.currentRound ?? 0} / {state?.totalRounds ?? 0}</span>
          <span>{remaining.toString().padStart(2, "0")}s restantes</span>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4">
          <div className="relative h-[200px] w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#b155f0] to-[#f24f90] shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            {currentTrack?.albumCover ? (
              <img src={currentTrack.albumCover} alt={currentTrack.title} className="absolute inset-0 h-full w-full object-cover opacity-80" />
            ) : (
              <div className="grid h-full w-full place-items-center text-5xl">🎵</div>
            )}
          </div>

          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#a0a0a0)]">Statut</div>
            <div className="text-xl font-semibold text-white">
              {phase === "playing" ? "Écoute en cours" : phase === "reveal" ? "Réponse révélée" : phase === "finished" ? "Partie terminée" : "En attente"}
            </div>
          </div>
        </div>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={event => {
            event.preventDefault()
            if (phase !== "playing" || disabled || hasAnswered) return
            const guess = `${guessTitle} ${guessArtist}`.trim()
            onAnswer(guess, sourceGuess)
          }}
        >
          <input
            value={guessTitle}
            onChange={event => setGuessTitle(event.target.value)}
            placeholder="Titre du morceau"
            disabled={phase !== "playing" || disabled || hasAnswered}
            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]"
          />
          <div className="flex gap-3">
            <input
              value={guessArtist}
              onChange={event => setGuessArtist(event.target.value)}
              placeholder="Artiste"
              disabled={phase !== "playing" || disabled || hasAnswered}
              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]"
            />
            <Button
              type="submit"
              disabled={phase !== "playing" || disabled || hasAnswered}
              className="min-w-[120px] gap-2"
            >
              {disabled ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasAnswered ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {hasAnswered ? "Réponse envoyée" : "Valider"}
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-3">
            <label className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#a0a0a0)]">
              De quel joueur vient ce titre ?
            </label>
            <select
              value={sourceGuess ?? ""}
              onChange={e => setSourceGuess(e.target.value ? Number(e.target.value) : null)}
              disabled={phase !== "playing" || disabled || hasAnswered}
              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]"
            >
              <option value="">Je ne sais pas</option>
              {Object.values(state?.players ?? {}).map(player => (
                <option key={player.userId} value={player.userId}>
                  {player.username || `Joueur ${player.userId}`}
                </option>
              ))}
            </select>
          </div>
        </form>

        {hasAnswered && phase === "playing" ? (
          <div className="mt-2 text-center text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#c2c2c2)]">
            En attente des autres joueurs…
          </div>
        ) : null}

        {phase === "reveal" && currentTrack ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#a0a0a0)]">Réponse</div>
                <div className="text-lg font-semibold text-white">{currentTrack.title}</div>
                <div className="text-sm text-[var(--ma-muted,#c2c2c2)]">{currentTrack.artist}</div>
                {currentTrack.metadata && (currentTrack.metadata as any).owner_username ? (
                  <div className="text-xs text-[var(--ma-muted,#c2c2c2)]">
                    Proposé par {(currentTrack.metadata as any).owner_username}
                  </div>
                ) : null}
              </div>
              {verdictBadge()}
            </div>
            <div className="mt-3 text-sm text-[var(--ma-muted,#c2c2c2)]">
              Ta proposition : {player?.lastGuess ? <span className="text-white">{player.lastGuess}</span> : "aucune"}
            </div>
            <div className="mt-4">
              <Button onClick={onReady} disabled={disabled || player?.isReady} className="gap-2">
                {player?.isReady ? "En attente des autres..." : "Prêt pour la suite"}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "finished" ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-[var(--ma-muted,#c2c2c2)]">
            Partie terminée. Merci d'avoir joué !
          </div>
        ) : null}
      </div>

      <aside className="rounded-2xl border border-white/10 bg-black/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ma-muted,#a0a0a0)]">Classement</h3>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white"
              onClick={() => {
                const audio = audioRef.current
                if (audio) {
                  const next = !muted
                  audio.volume = next ? 0 : PLAYBACK_VOLUME
                  setMuted(next)
                }
              }}
              title={muted ? "Activer le son" : "Couper le son"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {isPlaying ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-[2px] text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                Audio
              </span>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          {leaderboard.map((entry, idx) => (
            <div
              key={entry.userId}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--ma-muted,#aaa)]">#{idx + 1}</span>
                <span>{entry.username || `Joueur ${entry.userId}`}</span>
              </div>
              <div className="text-xs text-[var(--ma-muted,#cfcfcf)]">
                {entry.score} pts · {entry.accuracy}%
              </div>
            </div>
          ))}
          {leaderboard.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[var(--ma-muted,#a0a0a0)]">
              En attente des joueurs…
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
