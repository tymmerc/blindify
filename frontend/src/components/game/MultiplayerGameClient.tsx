"use client"

import { useEffect, useMemo, useState } from "react"
import type { MultiplayerGameState, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Check, Loader2, Volume2, VolumeX } from "lucide-react"
import { audioManager, DEFAULT_AUDIO_VOLUME } from "@/lib/audioManager"
import { RoundUiState, resolveModeFlags, ROUND_FEEDBACK_MS } from "@/lib/roundFlow"
import { GAME_MODES, type GameModeConfig } from "@/lib/gameModes"

const PLAYBACK_VOLUME = DEFAULT_AUDIO_VOLUME;

type Props = {
  user: UserSummary
  state: MultiplayerGameState | null
  serverNow: number
  onAnswer: (guess: string, sourceUserId?: number | null) => void
  onReady: () => void
  disabled?: boolean
  autoAdvance?: boolean
  modeConfig?: GameModeConfig
  accentColor?: string
}

export function MultiplayerGameClient({
  user,
  state,
  serverNow,
  onAnswer,
  onReady,
  disabled,
  autoAdvance,
  modeConfig,
  accentColor,
}: Props) {
  const resolvedConfig = modeConfig ?? GAME_MODES.friends
  const resolvedAccent = accentColor ?? "#8b5cf6"
  const modeFlags = resolveModeFlags(resolvedConfig, resolvedAccent)
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [sourceGuess, setSourceGuess] = useState<number | null>(null)
  const [muted, setMuted] = useState(audioManager.getState().muted)
  const [isPlaying, setIsPlaying] = useState(false)

  const remaining = useMemo(() => {
    if (!state?.timing?.revealAt) return 0
    return Math.max(0, Math.ceil((state.timing.revealAt - serverNow) / 1000))
  }, [state?.timing?.revealAt, serverNow])

  const currentTrack = state?.currentTrack ?? null
  const player = state?.players?.[user.id] ?? null
  const backendStatus = state?.status as string | undefined
  let baseUiState: RoundUiState
  switch (backendStatus) {
    case "playing":
      baseUiState = RoundUiState.Playing
      break
    case "reveal":
      baseUiState = RoundUiState.Revealed
      break
    case "finished":
      baseUiState = RoundUiState.Revealed
      break
    case "starting":
    case "countdown":
      baseUiState = RoundUiState.Armed
      break
    default:
      baseUiState = RoundUiState.Idle
  }
  const hasAnswered = Boolean(player?.hasAnswered)
  const uiState = hasAnswered && baseUiState === RoundUiState.Playing ? RoundUiState.Locked : baseUiState
  const isLocked = uiState === RoundUiState.Locked
  const feedbackSignal = uiState === RoundUiState.Locked || uiState === RoundUiState.Revealed
  const containerData = {
    "data-rivalry": modeFlags.isRivalry ? "1" : "0",
    "data-readable": modeFlags.isReadableAtDistance ? "1" : "0",
    "data-participation": modeFlags.isParticipationFocused ? "1" : "0",
  }
  const accentTint = (alpha: number) => {
    const hex = resolvedAccent.startsWith("#") ? resolvedAccent.slice(1) : resolvedAccent
    if (hex.length !== 6) return resolvedAccent
    const clamped = Math.min(255, Math.max(0, Math.round(alpha * 255)))
    return `#${hex}${clamped.toString(16).padStart(2, "0")}`
  }
  const statusLabel =
    uiState === RoundUiState.Playing
      ? "Écoute en cours"
      : uiState === RoundUiState.Revealed
        ? "Réponse révélée"
        : state?.status === "finished"
          ? "Partie terminée"
          : "En attente"

  useEffect(() => {
    return audioManager.subscribe(snapshot => {
      setMuted(snapshot.muted)
      setIsPlaying(snapshot.owner === "multiplayer" && snapshot.playing)
    })
  }, [])

  useEffect(() => {
    if (uiState !== RoundUiState.Playing || !currentTrack?.previewUrl) {
      audioManager.stop("multiplayer_phase_end", "multiplayer")
      return
    }
    audioManager.setVolume(PLAYBACK_VOLUME, "multiplayer")
    audioManager.setMuted(muted, "multiplayer")
    audioManager
      .play({ src: currentTrack.previewUrl, loop: true, volume: PLAYBACK_VOLUME, owner: "multiplayer" })
      .catch(() => setIsPlaying(false))
    return () => {
      audioManager.stop("multiplayer_track_cleanup", "multiplayer")
    }
  }, [uiState, currentTrack?.previewUrl, muted])

  useEffect(() => {
    return () => {
      audioManager.stop("multiplayer_unmount", "multiplayer")
    }
  }, [])

  useEffect(() => {
    if (uiState === RoundUiState.Playing) {
      setGuessArtist("")
      setGuessTitle("")
      setSourceGuess(null)
    }
  }, [uiState, state?.currentRound])

  useEffect(() => {
    if (!autoAdvance || uiState !== RoundUiState.Revealed || disabled || player?.isReady) return
    const timer = setTimeout(() => {
      onReady()
    }, 900)
    return () => clearTimeout(timer)
  }, [autoAdvance, uiState, disabled, player?.isReady, onReady])

  const sortedPlayers = useMemo(() => {
    if (!state?.players) return []
    return Object.values(state.players)
      .map(p => ({
        userId: p.userId,
        username: p.username,
        score: p.score,
        accuracy: p.accuracy,
        avatar: p.avatar,
        hasAnswered: p.hasAnswered,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.accuracy - a.accuracy
      })
  }, [state?.players])

  const leaderboard = useMemo(() => {
    const shape = resolvedConfig.game.showLeaderboard
    if (shape === false) return []
    if (!sortedPlayers.length) return []
    if (shape === "top3") {
      return sortedPlayers.slice(0, 3)
    }
    if (shape === "rivals") {
      const selfIndex = sortedPlayers.findIndex(p => p.userId === user.id)
      if (selfIndex === -1) return sortedPlayers.slice(0, 3)
      const start = Math.max(0, selfIndex - 1)
      return sortedPlayers.slice(start, Math.min(sortedPlayers.length, start + 3))
    }
    return sortedPlayers
  }, [resolvedConfig.game.showLeaderboard, sortedPlayers, user.id])

  const answeredCount = useMemo(() => sortedPlayers.filter(p => p.hasAnswered).length, [sortedPlayers])

  const verdictBadge = () => {
    if (!player?.lastVerdict || uiState !== RoundUiState.Revealed) return null
    const label =
      player.lastVerdict === "correct" ? "Validé" : player.lastVerdict === "close" ? "Partiel" : "Clos"
    return (
          <span
            className="rounded-full border px-2 py-[2px] text-[11px] font-medium"
            style={{
              borderColor: accentTint(0.55),
              backgroundColor: accentTint(0.18),
              color: resolvedAccent,
              transition: `border-color ${ROUND_FEEDBACK_MS}ms ease, background-color ${ROUND_FEEDBACK_MS}ms ease`,
            }}
          >
            {label}
          </span>
    )
  }

  const showScores = resolvedConfig.game.scoring !== false
  const leaderboardShape = resolvedConfig.game.showLeaderboard
  const isLargeUi = Boolean(resolvedConfig.game.largeUI)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" {...containerData}>
      <div
        className="rounded-2xl border bg-black/60 p-6 shadow-lg"
        style={{
          borderColor: feedbackSignal ? resolvedAccent : "#1b1b1b",
          boxShadow: feedbackSignal ? `0 0 0 2px ${accentTint(0.45)}` : "0 10px 30px rgba(0,0,0,0.35)",
          transition: `box-shadow ${ROUND_FEEDBACK_MS}ms ease, border-color ${ROUND_FEEDBACK_MS}ms ease`,
        }}
      >
        <div className="flex items-center justify-between text-sm text-[var(--ma-muted,#a0a0a0)]">
          <span>Manche {state?.currentRound ?? 0} / {state?.totalRounds ?? 0}</span>
          <span style={{ color: resolvedAccent, fontWeight: 600 }}>{remaining.toString().padStart(2, "0")}s restantes</span>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4">
          <div className="relative h-[200px] w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#b155f0] to-[#f24f90] shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            {currentTrack?.albumCover ? (
              <img src={currentTrack.albumCover} alt={currentTrack.title} className="absolute inset-0 h-full w-full object-cover opacity-80" />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <div
                  className="h-10 w-10 rounded-full border"
                  style={{ borderColor: accentTint(0.6) }}
                />
              </div>
            )}
          </div>

          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#a0a0a0)]">Statut</div>
            <div className={`font-semibold text-white ${isLargeUi ? "text-2xl" : "text-xl"}`}>
              {statusLabel}
            </div>
          </div>
        </div>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={event => {
            event.preventDefault()
            if (uiState !== RoundUiState.Playing || disabled || hasAnswered) return
            const guess = `${guessTitle} ${guessArtist}`.trim()
            onAnswer(guess, sourceGuess)
          }}
        >
          <input
            value={guessTitle}
            onChange={event => setGuessTitle(event.target.value)}
            placeholder="Titre du morceau"
            disabled={uiState !== RoundUiState.Playing || disabled || isLocked}
            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]"
          />
          <div className="flex gap-3">
            <input
              value={guessArtist}
              onChange={event => setGuessArtist(event.target.value)}
              placeholder="Artiste"
              disabled={uiState !== RoundUiState.Playing || disabled || isLocked}
              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]"
            />
            <Button
              type="submit"
              disabled={uiState !== RoundUiState.Playing || disabled || hasAnswered}
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
              disabled={uiState !== RoundUiState.Playing || disabled || isLocked}
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

        {hasAnswered && uiState === RoundUiState.Playing ? (
          <div className="mt-2 text-center text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#c2c2c2)]">
            En attente des autres joueurs…
          </div>
        ) : null}

        {uiState === RoundUiState.Revealed && currentTrack ? (
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

        {state?.status === "finished" ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-[var(--ma-muted,#c2c2c2)]">
            Partie terminée. Merci d'avoir joué !
          </div>
        ) : null}
      </div>

      <aside className="rounded-2xl border border-white/10 bg-black/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ma-muted,#a0a0a0)]">
            {leaderboardShape === false ? "Participation" : "Classement"}
          </h3>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white"
              onClick={() => {
                const next = !muted
                audioManager.setMuted(next)
                if (!next) {
                  audioManager.setVolume(PLAYBACK_VOLUME, "multiplayer")
                }
                setMuted(next)
              }}
              title={muted ? "Activer le son" : "Couper le son"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {isPlaying ? (
              <span
                className="rounded-full px-2 py-[2px] text-[10px] uppercase tracking-[0.2em]"
                style={{
                  backgroundColor: accentTint(0.18),
                  color: resolvedAccent,
                  border: `1px solid ${accentTint(0.55)}`,
                }}
              >
                Audio
              </span>
            ) : null}
          </div>
        </div>
        {leaderboardShape === false ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
            <div className="flex items-center justify-between">
              <span>Réponses envoyées</span>
              <span className="text-xs text-[var(--ma-muted,#cfcfcf)]">
                {answeredCount} / {sortedPlayers.length || 1}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${sortedPlayers.length ? Math.min(100, Math.round((answeredCount / sortedPlayers.length) * 100)) : 0}%`,
                  backgroundColor: accentTint(0.55),
                }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--ma-muted,#b0b0b0)]">Participation en direct, sans classement global.</p>
          </div>
        ) : (
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
                {showScores ? (
                  <div className="text-xs text-[var(--ma-muted,#cfcfcf)]">
                    {entry.score} pts · {entry.accuracy}%
                  </div>
                ) : (
                  <div className="text-xs text-[var(--ma-muted,#cfcfcf)]">Participation</div>
                )}
              </div>
            ))}
            {leaderboard.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[var(--ma-muted,#a0a0a0)]">
                En attente des joueurs…
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  )
}
