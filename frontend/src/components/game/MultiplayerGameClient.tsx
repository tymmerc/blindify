"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { MultiplayerGameState, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Check, Loader2, Volume2, VolumeX } from "lucide-react"
import { audioManager, DEFAULT_AUDIO_VOLUME } from "@/lib/audioManager"
import { RoundUiState, resolveModeFlags, resolveRoundTempo } from "@/lib/roundFlow"
import { GAME_MODES, type GameModeConfig, type GameMode } from "@/lib/gameModes"
import { GameShell } from "./GameShell"

const PLAYBACK_VOLUME = DEFAULT_AUDIO_VOLUME;

type Props = {
  user: UserSummary
  state: MultiplayerGameState | null
  serverNow: number
  onAnswer: (guess: string, sourceUserId?: number | null) => void
  onReady: () => void
  onExit?: () => void
  disabled?: boolean
  autoAdvance?: boolean
  modeConfig?: GameModeConfig
  accentColor?: string
  mode: GameMode
}

export function MultiplayerGameClient({
  user,
  state,
  serverNow,
  onAnswer,
  onReady,
  onExit,
  disabled,
  autoAdvance,
  modeConfig,
  accentColor,
  mode,
}: Props) {
  const resolvedConfig = modeConfig ?? GAME_MODES.friends
  const resolvedAccent = accentColor ?? "#8b5cf6"
  const modeFlags = resolveModeFlags(resolvedConfig, resolvedAccent)
  const tempo = resolveRoundTempo(mode)
  const feedbackMs = tempo.feedbackMs
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [sourceGuess, setSourceGuess] = useState<number | null>(null)
  const [muted, setMuted] = useState(audioManager.getState().muted)
  const [isPlaying, setIsPlaying] = useState(false)

  const remaining = useMemo(() => {
    if (!state?.timing?.revealAt) return 0
    return Math.max(0, Math.ceil((state.timing.revealAt - serverNow) / 1000))
  }, [state?.timing?.revealAt, serverNow])
  const totalSeconds = useMemo(() => {
    if (!state?.timing?.startAt || !state?.timing?.revealAt) return null
    return Math.max(0, Math.floor((state.timing.revealAt - state.timing.startAt) / 1000))
  }, [state?.timing?.startAt, state?.timing?.revealAt])

  const currentTrack = state?.currentTrack ?? null
  const trackOwnerUsername =
    currentTrack?.metadata &&
    typeof currentTrack.metadata === "object" &&
    typeof (currentTrack.metadata as { owner_username?: unknown }).owner_username === "string"
      ? (currentTrack.metadata as { owner_username?: string }).owner_username ?? null
      : null
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
  const previousUiState = useRef<RoundUiState>(uiState)

  useEffect(() => {
    return audioManager.subscribe(snapshot => {
      setMuted(snapshot.muted)
      setIsPlaying(snapshot.owner === "multiplayer" && snapshot.playing)
    })
  }, [])

  useEffect(() => {
    const cues = {
      friends: { playing: 0.55, reveal: 0.38 },
      event: { playing: 0.48, reveal: 0.34 },
      chat: { playing: 0.35, reveal: 0.28 },
    } as const
    if (uiState === RoundUiState.Playing) {
      audioManager.setVolume(cues[mode].playing, "multiplayer")
    }
    if (uiState === RoundUiState.Revealed) {
      audioManager.setVolume(cues[mode].reveal, "multiplayer")
    }
    previousUiState.current = uiState
  }, [uiState, mode])

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
    }, mode === "event" ? tempo.revealHoldMs + 400 : tempo.revealHoldMs + 200)
    return () => clearTimeout(timer)
  }, [autoAdvance, uiState, disabled, player?.isReady, onReady, tempo.revealHoldMs, mode])

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
  const bestResponse = useMemo(() => {
    const list = Object.values(state?.players ?? {})
    if (!list.length) return null
    const priority = { correct: 3, close: 2, wrong: 1 } as const
    const ranked = list
      .filter(p => p.lastGuess)
      .sort((a, b) => {
        const pa = priority[(a.lastVerdict ?? "wrong") as keyof typeof priority] ?? 0
        const pb = priority[(b.lastVerdict ?? "wrong") as keyof typeof priority] ?? 0
        if (pb !== pa) return pb - pa
        return (b.score ?? 0) - (a.score ?? 0)
      })
    const pick = ranked[0]
    if (!pick) return null
    return {
      username: pick.username || `Joueur ${pick.userId}`,
      guess: pick.lastGuess ?? null,
      verdict: pick.lastVerdict ?? null,
    }
  }, [state?.players])

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
          transition: `border-color ${feedbackMs}ms ease, background-color ${feedbackMs}ms ease`,
        }}
      >
        {label}
      </span>
    )
  }

  const showScores = resolvedConfig.game.scoring !== false
  const leaderboardShape = resolvedConfig.game.showLeaderboard
  const isLargeUi = "largeUI" in resolvedConfig.game && Boolean((resolvedConfig.game as { largeUI?: boolean }).largeUI)
  const selfIndex = sortedPlayers.findIndex(p => p.userId === user.id)
  const neighbor =
    selfIndex > 0 ? sortedPlayers[selfIndex - 1] : selfIndex === 0 ? sortedPlayers[1] ?? null : sortedPlayers[0] ?? null
  const playerScore = player?.score ?? 0
  const rivalDelta = neighbor ? playerScore - neighbor.score : null
  const variant = mode === "event" ? "wide" : "balanced"
  const streakBadge =
    mode === "friends" && (player?.streak ?? 0) > 1 ? (
      <span className="rounded-full border border-white/15 bg-white/5 px-3 py-[6px] text-xs font-semibold text-white">
        Série x{player?.streak ?? 0}
      </span>
    ) : null
  const phaseLabel =
    uiState === RoundUiState.Playing
      ? "Manche"
      : uiState === RoundUiState.Revealed
        ? "Révélation"
        : state?.status === "finished"
          ? "Résultats"
          : uiState === RoundUiState.Armed
            ? "Préparation"
            : "Attente"

  const roundMeta = (
    <span className="text-[11px] uppercase tracking-[0.35em] text-[var(--ma-muted,#9a9a9a)]">
      Manche {state?.currentRound ?? 0} / {state?.totalRounds ?? 0}
    </span>
  )

  const audioButton = (
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
  )

  const timeProgress =
    totalSeconds != null ? (
      <div
        className="w-full overflow-hidden rounded-full bg-white/10"
        style={{ height: mode === "event" ? 8 : mode === "friends" ? 6 : 4 }}
      >
        <div
          className="h-full transition-[width,background-color] duration-200"
          style={{
            width: `${Math.max(0, Math.min(100, ((totalSeconds - remaining) / totalSeconds) * 100))}%`,
            transitionDuration: tempo.cadence === "snappy" ? "150ms" : tempo.cadence === "steady" ? "240ms" : "320ms",
            backgroundColor: accentTint(mode === "event" ? 0.7 : 0.5),
          }}
        />
      </div>
    ) : null

  const rivalryFocus =
    mode === "friends" && neighbor ? (
      <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.35em] text-[var(--ma-muted,#9a9a9a)]">Rival</span>
            <span className="text-sm font-semibold text-white">{neighbor.username || `Joueur ${neighbor.userId}`}</span>
          </div>
          <span className="rounded-full border px-3 py-[6px] text-lg font-semibold" style={{ borderColor: accentTint(0.55), color: resolvedAccent }}>
            {rivalDelta === 0 ? "Égalité" : rivalDelta && rivalDelta > 0 ? `+${rivalDelta}` : rivalDelta}
          </span>
        </div>
        <div className="mt-3 h-[6px] rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${Math.min(100, Math.abs(rivalDelta ?? 0) * 10)}%`,
              backgroundColor: accentTint(rivalDelta && rivalDelta < 0 ? 0.35 : 0.6),
            }}
          />
        </div>
      </div>
    ) : null

  const participationPulse =
    mode === "chat" ? (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.3em] text-[var(--ma-muted,#9a9a9a)]">Live</span>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full transition-all duration-200"
              style={{
                width: `${sortedPlayers.length ? Math.min(100, Math.round((answeredCount / sortedPlayers.length) * 100)) : 0}%`,
                backgroundColor: accentTint(0.5),
              }}
            />
          </div>
        </div>
        <span className="text-xs text-[var(--ma-muted,#b0b0b0)]">
          {answeredCount}/{sortedPlayers.length || 1}
        </span>
      </div>
    ) : null

  const header =
    mode === "friends" ? (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            {roundMeta}
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-white">{statusLabel}</span>
              {streakBadge}
              {isPlaying ? (
                <span
                  className="rounded-full px-2 py-[2px] text-[10px] uppercase tracking-[0.2em]"
                  style={{ backgroundColor: accentTint(0.18), color: resolvedAccent, border: `1px solid ${accentTint(0.55)}` }}
                >
                  Audio
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[11px] uppercase tracking-[0.3em] text-[var(--ma-muted,#9a9a9a)]">Temps</span>
              <span style={{ color: resolvedAccent, fontWeight: 700 }} className="text-base">
                {remaining.toString().padStart(2, "0")}s
              </span>
            </div>
            {audioButton}
          </div>
        </div>
        {rivalryFocus}
        {timeProgress}
      </div>
    ) : mode === "event" ? (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            {roundMeta}
            <span className="text-lg font-semibold uppercase tracking-[0.2em] text-white">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] uppercase tracking-[0.3em] text-[var(--ma-muted,#9a9a9a)]">Temps</span>
              <span style={{ color: resolvedAccent, fontWeight: 800 }} className="text-4xl">
                {remaining.toString().padStart(2, "0")}s
              </span>
            </div>
            <div className="flex items-center gap-2">{audioButton}</div>
          </div>
        </div>
        {timeProgress}
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            {roundMeta}
            <span className="text-lg font-semibold text-white">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[11px] uppercase tracking-[0.3em] text-[var(--ma-muted,#9a9a9a)]">Temps</span>
              <span style={{ color: resolvedAccent, fontWeight: 700 }} className="text-base">
                {remaining.toString().padStart(2, "0")}s
              </span>
            </div>
            {audioButton}
          </div>
        </div>
        {participationPulse}
      </div>
    )

  const coverSize =
    mode === "event" ? "h-[240px] w-[240px]" : mode === "friends" ? "h-[180px] w-[180px]" : "h-[200px] w-[200px]"
  const mainGap = mode === "event" ? "gap-6" : mode === "friends" ? "gap-3" : "gap-5"
  const statusPadding = mode === "friends" ? "p-3" : "p-4"
  const inputTone = mode === "chat" ? "border-white/5 bg-black/40" : "border-white/10 bg-black/60"
  const selectTone = mode === "chat" ? "border-white/5 bg-black/40" : "border-white/10 bg-black/60"

  const coverCard = (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-[0_20px_50px_rgba(0,0,0,0.35)] ${coverSize}`}
      style={{
        borderColor: feedbackSignal ? accentTint(0.7) : "rgba(255,255,255,0.12)",
        transition: `border-color ${feedbackMs}ms ease`,
      }}
    >
      {currentTrack?.albumCover ? (
        <img src={currentTrack.albumCover} alt={currentTrack.title} className="absolute inset-0 h-full w-full object-cover opacity-80" />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <div className="h-10 w-10 rounded-full border" style={{ borderColor: accentTint(0.6) }} />
        </div>
      )}
    </div>
  )

  const revealFeedback =
    uiState === RoundUiState.Revealed && currentTrack ? (
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#a0a0a0)]">Réponse</div>
            <div className="text-lg font-semibold text-white">{currentTrack.title}</div>
            <div className="text-sm text-[var(--ma-muted,#c2c2c2)]">{currentTrack.artist}</div>
            {trackOwnerUsername ? (
              <div className="text-xs text-[var(--ma-muted,#c2c2c2)]">Proposé par {trackOwnerUsername}</div>
            ) : null}
          </div>
          {verdictBadge()}
        </div>
        {mode === "friends" && rivalDelta !== null && neighbor ? (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#b0b0b0)]">
              <span>Face à {neighbor.username || `Joueur ${neighbor.userId}`}</span>
              <span className="font-semibold text-white">{rivalDelta === 0 ? "Égalité" : rivalDelta > 0 ? `+${rivalDelta} pts` : `${rivalDelta} pts`}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.min(100, Math.abs(rivalDelta ?? 0) * 10)}%`,
                  backgroundColor: rivalDelta >= 0 ? accentTint(0.55) : accentTint(0.35),
                  marginLeft: rivalDelta >= 0 ? 0 : "0%",
                }}
              />
            </div>
          </div>
        ) : null}
        {mode === "event" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#b0b0b0)]">Score total</p>
              <p className="text-2xl font-semibold text-white">{playerScore} pts</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#b0b0b0)]">Collectif</p>
              <p className="text-sm text-white">
                {answeredCount}/{sortedPlayers.length || 1} réponses
              </p>
            </div>
          </div>
        ) : null}
        {mode === "chat" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr]">
            <div className="rounded-lg border border-white/10 bg-black/45 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#b0b0b0)]">Réponse marquante</p>
              <p className="mt-1 text-sm text-white">
                {bestResponse?.guess ? (
                  <>
                    {bestResponse.guess} <span className="text-[var(--ma-muted,#c2c2c2)]">({bestResponse.username})</span>
                  </>
                ) : (
                  "Aucune réponse claire"
                )}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/45 px-4 py-3 text-sm text-white">
              <div className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#b0b0b0)]">Participation</div>
              <div className="mt-2 flex items-center justify-between">
                <span>Réponses</span>
                <span className="rounded-full bg-white/10 px-2 py-[2px] text-[11px]">
                  {answeredCount}/{sortedPlayers.length || 1}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-3 text-sm text-[var(--ma-muted,#c2c2c2)]">
          Ta proposition : {player?.lastGuess ? <span className="text-white">{player.lastGuess}</span> : "aucune"}
        </div>
        <div className="mt-4">
          <Button onClick={onReady} disabled={disabled || player?.isReady} className="gap-2">
            {player?.isReady ? "En attente des autres..." : "Prêt pour la suite"}
          </Button>
        </div>
      </div>
    ) : null

  const participationCard =
    leaderboardShape === false ? (
      <div className={`rounded-xl border ${mode === "chat" ? "border-white/5 bg-black/40" : "border-white/10 bg-white/5"} px-4 py-3 text-sm text-white`}>
        <div className="flex items-center justify-between">
          <span>{mode === "chat" ? "Réponses live" : "Réponses envoyées"}</span>
          <span className="text-xs text-[var(--ma-muted,#cfcfcf)]">
            {answeredCount} / {sortedPlayers.length || 1}
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/10">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${sortedPlayers.length ? Math.min(100, Math.round((answeredCount / sortedPlayers.length) * 100)) : 0}%`,
              backgroundColor: accentTint(mode === "chat" ? 0.5 : 0.55),
            }}
          />
        </div>
        {mode !== "chat" ? (
          <p className="mt-2 text-xs text-[var(--ma-muted,#b0b0b0)]">Participation en direct, sans classement global.</p>
        ) : null}
      </div>
    ) : (
      <div className="space-y-2">
        {leaderboard.map((entry, idx) => (
          <div
            key={entry.userId}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <div className="flex items-center gap-2">
              <span className={`${mode === "event" ? "text-base" : "text-[10px]"} text-[var(--ma-muted,#aaa)]`}>#{idx + 1}</span>
              <span className={mode === "event" ? "text-base" : ""}>{entry.username || `Joueur ${entry.userId}`}</span>
            </div>
            {showScores ? (
              <div className={mode === "event" ? "text-sm text-white font-semibold" : "text-xs text-[var(--ma-muted,#cfcfcf)]"}>
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
    )

  const sidePanel =
    mode === "friends" ? (
      <div className="space-y-4">
        {rivalDelta !== null && neighbor ? (
          <div className="rounded-xl border border-white/10 bg-black/50 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#a0a0a0)]">
              <span>Rival</span>
              <span className="font-semibold text-white">{neighbor.username || `Joueur ${neighbor.userId}`}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.min(100, Math.abs(rivalDelta ?? 0) * 10)}%`,
                  backgroundColor: rivalDelta >= 0 ? accentTint(0.6) : accentTint(0.35),
                }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--ma-muted,#a0a0a0)]">
              {rivalDelta > 0 ? "Tu es devant." : rivalDelta === 0 ? "Égalité parfaite." : "Rattrape ton rival."}
            </p>
          </div>
        ) : null}
        {participationCard}
      </div>
    ) : mode === "event" ? (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#b0b0b0)]">Classement direct</p>
          <div className="mt-3 space-y-2 text-white">
            {leaderboard.slice(0, 3).map((entry, idx) => (
              <div key={entry.userId} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-base text-[var(--ma-muted,#a0a0a0)]">#{idx + 1}</span>
                  <span className="font-semibold">{entry.username || `Joueur ${entry.userId}`}</span>
                </div>
                {showScores ? <span className="text-sm font-semibold">{entry.score} pts</span> : <span className="text-xs text-[var(--ma-muted,#cfcfcf)]">Participation</span>}
              </div>
            ))}
          </div>
        </div>
        {participationCard}
      </div>
    ) : null

  const participationStrip =
    mode === "chat" ? (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white">
        <span className="uppercase tracking-[0.25em] text-[var(--ma-muted,#b0b0b0)]">Participants en direct</span>
        <div className="flex-1 mx-3 h-3 rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${sortedPlayers.length ? Math.min(100, Math.round((answeredCount / sortedPlayers.length) * 100)) : 0}%`,
              backgroundColor: accentTint(0.5),
            }}
          />
        </div>
        <span className="text-xs text-[var(--ma-muted,#b0b0b0)]">{answeredCount}/{sortedPlayers.length || 1}</span>
      </div>
    ) : null

  const formCard = (
    <form
      className="flex flex-col gap-3"
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
        className={`w-full rounded-lg border ${inputTone} px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]`}
      />
      <div className="flex gap-3">
        <input
          value={guessArtist}
          onChange={event => setGuessArtist(event.target.value)}
          placeholder="Artiste"
          disabled={uiState !== RoundUiState.Playing || disabled || isLocked}
          className={`w-full rounded-lg border ${inputTone} px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]`}
        />
        <Button type="submit" disabled={uiState !== RoundUiState.Playing || disabled || hasAnswered} className="min-w-[120px] gap-2">
          {disabled || hasAnswered ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {hasAnswered ? "Réponse envoyée" : "Valider"}
        </Button>
      </div>
      <div className={`flex flex-col gap-2 rounded-lg border ${selectTone} px-3 py-3`}>
        <label className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#a0a0a0)]">De quel joueur vient ce titre ?</label>
        <select
          value={sourceGuess ?? ""}
          onChange={e => setSourceGuess(e.target.value ? Number(e.target.value) : null)}
          disabled={uiState !== RoundUiState.Playing || disabled || isLocked}
          className={`w-full rounded-lg border ${inputTone} px-3 py-2 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]`}
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
  )

  const mainStage = (
    <div className={`flex flex-col ${mainGap}`} {...containerData}>
      <div className={`flex flex-col items-center ${mainGap} sm:flex-row sm:items-start sm:gap-6`}>
        {coverCard}
        <div className="flex flex-1 flex-col gap-3">
          <div className={`rounded-xl border border-white/10 bg-black/60 ${statusPadding}`}>
            <div className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#a0a0a0)]">Statut</div>
            <div className={`${isLargeUi ? "text-2xl" : "text-xl"} font-semibold text-white`}>{statusLabel}</div>
            {hasAnswered && uiState === RoundUiState.Playing ? (
              <div className="mt-2 text-xs uppercase tracking-[0.3em] text-[var(--ma-muted,#c2c2c2)]">En attente des autres joueurs…</div>
            ) : null}
          </div>
          {formCard}
        </div>
      </div>
      {mode === "chat" ? participationCard : null}
      {revealFeedback}
      {state?.status === "finished" ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-[var(--ma-muted,#c2c2c2)]">
          Partie terminée. Merci d’avoir joué !
        </div>
      ) : null}
    </div>
  )

  const navActions = onExit ? (
    <Button size="sm" variant="outline" onClick={onExit} className="rounded-full px-3 py-1 text-xs">
      Quitter
    </Button>
  ) : null

  return (
    <GameShell
      mode={mode}
      header={header}
      main={mainStage}
      side={sidePanel}
      participationStrip={participationStrip}
      variant={variant}
      phase={phaseLabel}
      actions={navActions}
    />
  )
}
