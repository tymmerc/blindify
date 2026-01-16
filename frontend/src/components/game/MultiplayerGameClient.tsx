"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { MultiplayerGameState, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Check, Loader2, Volume2, VolumeX } from "lucide-react"
import { audioManager, DEFAULT_AUDIO_VOLUME } from "@/lib/audioManager"
import { RoundUiState, resolveRoundTempo } from "@/lib/roundFlow"
import { GAME_MODES, type GameModeConfig, type GameMode } from "@/lib/gameModes"
import { GameShell } from "./GameShell"

const PLAYBACK_VOLUME = DEFAULT_AUDIO_VOLUME

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
  const resolvedConfig = modeConfig ?? GAME_MODES[mode] ?? GAME_MODES.friends
  const accent = accentColor ?? (resolvedConfig as { theme?: { accent?: string } }).theme?.accent ?? "#8b5cf6"
  const tempo = resolveRoundTempo(mode)
  const feedbackMs = tempo.feedbackMs
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [sourceGuess, setSourceGuess] = useState<number | null>(null)
  const [muted, setMuted] = useState(audioManager.getState().muted)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [bassLevel, setBassLevel] = useState(0.6)
  const [showRevealModal, setShowRevealModal] = useState(false)

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
  const backendPhase = state?.phase

  let baseUiState: RoundUiState
  switch (backendPhase) {
    case "GUESSING":
      baseUiState = RoundUiState.Playing
      break
    case "REVEAL":
    case "FINISHED":
      baseUiState = RoundUiState.Revealed
      break
    case "LOBBY":
      baseUiState = RoundUiState.Armed
      break
    default:
      baseUiState = RoundUiState.Idle
  }

  const hasAnswered = Boolean(player?.hasAnswered)
  const localHasAnswered = hasAnswered || justSubmitted
  const uiState = hasAnswered && baseUiState === RoundUiState.Playing ? RoundUiState.Locked : baseUiState
  const isLocked = uiState === RoundUiState.Locked
  const feedbackSignal = uiState === RoundUiState.Locked || uiState === RoundUiState.Revealed

  const accentTint = (alpha: number) => {
    const hex = accent.startsWith("#") ? accent.slice(1) : accent
    if (hex.length !== 6) return accent
    const clamped = Math.min(255, Math.max(0, Math.round(alpha * 255)))
    return `#${hex}${clamped.toString(16).padStart(2, "0")}`
  }

  const statusLabel =
    uiState === RoundUiState.Playing
      ? "Écoute en cours"
      : uiState === RoundUiState.Revealed
        ? "Réponse révélée"
        : state?.phase === "FINISHED"
          ? "Partie terminée"
          : "En attente"

  const previousUiState = useRef<RoundUiState>(uiState)

  useEffect(() => {
    return audioManager.subscribe(snapshot => {
      setMuted(snapshot.muted)
    })
  }, [])

  useEffect(() => {
    const cues = {
      friends: { playing: 0.55, reveal: 0.38 },
      event: { playing: 0.48, reveal: 0.34 },
      chat: { playing: 0.35, reveal: 0.28 },
      streamer: { playing: 0.50, reveal: 0.35 },
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
    audioManager.play({ src: currentTrack.previewUrl, loop: true, volume: PLAYBACK_VOLUME, owner: "multiplayer" }).catch(() => {})
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
      setJustSubmitted(false)
      setShowRevealModal(false)
    }
  }, [uiState, state?.currentRound])

  useEffect(() => {
    if (!autoAdvance || uiState !== RoundUiState.Revealed || disabled || player?.isReady) return
    const timer = setTimeout(() => {
      onReady()
    }, mode === "event" ? tempo.revealHoldMs + 400 : tempo.revealHoldMs + 200)
    return () => clearTimeout(timer)
  }, [autoAdvance, uiState, disabled, player?.isReady, onReady, tempo.revealHoldMs, mode])

  useEffect(() => {
    if (uiState === RoundUiState.Revealed) {
      setShowRevealModal(true)
    }
  }, [uiState])

  useEffect(() => {
    if (uiState !== RoundUiState.Playing) return
    const element = audioManager.getCurrent("multiplayer")
    if (!element) return
    let raf: number | null = null
    let ctx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let gain: GainNode | null = null
    try {
      ctx = new AudioContext()
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const source = ctx.createMediaElementSource(element)
      gain = ctx.createGain()
      gain.gain.value = 0
      source.connect(analyser)
      analyser.connect(gain)
      gain.connect(ctx.destination)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const sample = () => {
        analyser?.getByteFrequencyData(data)
        const bins = analyser ? analyser.frequencyBinCount : data.length
        const take = Math.max(8, Math.floor(bins * 0.2))
        let sum = 0
        for (let i = 0; i < take; i += 1) {
          sum += data[i]
        }
        const avg = sum / take / 255
        setBassLevel(prev => prev * 0.7 + avg * 0.3)
        raf = requestAnimationFrame(sample)
      }
      raf = requestAnimationFrame(sample)
    } catch {
      setBassLevel(0.6)
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      analyser?.disconnect()
      gain?.disconnect()
      if (ctx) ctx.close().catch(() => {})
    }
  }, [uiState])

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
        lastGuess: p.lastGuess,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return (b.accuracy ?? 0) - (a.accuracy ?? 0)
      })
  }, [state?.players])

  const answeredCount = useMemo(() => sortedPlayers.filter(p => p.hasAnswered).length, [sortedPlayers])
  const displayAnsweredCount = Math.max(answeredCount, localHasAnswered ? 1 : 0)

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
          color: accent,
          transition: `border-color ${feedbackMs}ms ease, background-color ${feedbackMs}ms ease`,
        }}
      >
        {label}
      </span>
    )
  }

  const playerCount = sortedPlayers.length
  const selfEntry = sortedPlayers.find(p => p.userId === user.id) ?? null
  const selfRank = selfEntry ? sortedPlayers.findIndex(p => p.userId === selfEntry.userId) + 1 : null
  const leader = sortedPlayers[0] ?? null
  const streakText =
    mode === "friends" && (player?.streak ?? 0) > 1 ? `Série en cours : ${player?.streak ?? 0}` : null
  const revealResponses = useMemo(
    () =>
      Object.values(state?.players ?? {})
        .map(p => ({
          username: p.username || `Joueur ${p.userId}`,
          guess: p.lastGuess,
          verdict: p.lastVerdict ?? null,
          hasAnswered: p.hasAnswered,
        }))
        .filter(entry => entry.guess || entry.hasAnswered),
    [state?.players]
  )

  const header = (
    <div className="flex items-center gap-3 text-sm text-white/60">
      <span>
        Manche {state?.currentRound ?? 0} / {state?.totalRounds ?? 0}
      </span>
      <span aria-hidden className="text-white/40">·</span>
      <span>{remaining.toString().padStart(2, "0")}s</span>
      {onExit ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onExit}
          className="rounded-full border-white/20 px-3 py-1 text-xs text-white"
          style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.8)" }}
        >
          Quitter
        </Button>
      ) : null}
    </div>
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
      <div className="w-full overflow-hidden rounded-full bg-white/10" style={{ height: 10 }}>
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

  const amplitudeFactor = useMemo(() => {
    if (uiState !== RoundUiState.Playing) return 0.35
    return Math.max(0.25, Math.min(1.2, bassLevel * 1.25))
  }, [bassLevel, uiState])

  const coverCard = (
    <div
      className="relative h-16 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f0f] shadow-[0_12px_30px_rgba(0,0,0,0.35)] sm:h-20"
      style={{
        borderColor: feedbackSignal ? accentTint(0.7) : "rgba(255,255,255,0.12)",
        transition: `border-color ${feedbackMs}ms ease`,
      }}
    >
      <div className="flex h-full w-full items-end justify-between px-3">
        {Array.from({ length: 24 }).map((_, idx) => {
          const delay = (idx % 8) * 70
          const base = 18 + (idx % 7) * 6
          return (
            <span
              key={idx}
              className="eq-bar"
              style={{
                animationDelay: `${delay}ms`,
                height: `${base * amplitudeFactor}%`,
                backgroundColor: accent,
                animationPlayState: uiState === RoundUiState.Playing ? "running" : "paused",
              }}
            />
          )
        })}
      </div>
      <style jsx>{`
        .eq-bar {
          width: 6px;
          min-width: 4px;
          border-radius: 9999px;
          animation: eq-bounce 800ms ease-in-out infinite;
          transform-origin: bottom;
          opacity: 0.85;
        }
        @keyframes eq-bounce {
          0%,
          100% {
            transform: scaleY(0.35);
          }
          50% {
            transform: scaleY(1);
          }
        }
      `}</style>
    </div>
  )

  const livePositionCard = (
    <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-5">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/60">
        <span>Position live</span>
        {playerCount ? <span className="text-[11px] text-white/50">{displayAnsweredCount} réponses</span> : null}
      </div>
      {playerCount === 0 ? (
        <p className="mt-3 text-sm text-white/60">En attente des joueurs…</p>
      ) : playerCount === 2 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div
            className="rounded-xl border border-white/10 bg-[#111] px-3 py-3"
            style={selfEntry ? { borderColor: accentTint(0.6) } : undefined}
          >
            <p className="text-xs text-white/60">Toi</p>
            <p className="text-base font-semibold text-white">{selfEntry?.score ?? 0} pts</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-3">
            <p className="text-xs text-white/60">Adversaire</p>
            <p className="text-base font-semibold text-white">
              {sortedPlayers.find(p => p.userId !== user.id)?.username || "Adversaire"}
            </p>
          </div>
        </div>
      ) : playerCount <= 6 ? (
        <div className="mt-4 space-y-2">
          {(function () {
            if (!selfEntry) return sortedPlayers.slice(0, 3)
            const idx = sortedPlayers.findIndex(p => p.userId === selfEntry.userId)
            if (idx <= 1) return sortedPlayers.slice(0, 3)
            const next = sortedPlayers[idx + 1] ?? sortedPlayers[idx - 1] ?? null
            return [sortedPlayers[0], selfEntry, next].filter(Boolean) as typeof sortedPlayers
          })().map((entry, idx) => (
            <div
              key={entry.userId}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm"
              style={
                entry.userId === user.id
                  ? { borderColor: accentTint(0.6), backgroundColor: accentTint(0.12) }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white/50">#{idx + 1}</span>
                <span className="font-semibold text-white">{entry.username || `Joueur ${entry.userId}`}</span>
              </div>
              <span className="text-xs text-white/70">{entry.score} pts</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-lg font-semibold text-white">
            Ta position : {selfRank ? `${selfRank} / ${playerCount}` : `— / ${playerCount}`}
          </p>
          {leader && selfEntry ? (
            <p className="text-sm text-white/70">
              {Math.max(0, leader.score - selfEntry.score)} pts derrière le leader
            </p>
          ) : (
            <p className="text-sm text-white/60">Classement en cours…</p>
          )}
        </div>
      )}
    </div>
  )

  const miniFeed =
    playerCount > 0 ? (
      <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/60">
          <span>Direct</span>
          <span className="rounded-full bg-white/10 px-2 py-[2px] text-[11px] text-white/70">
            {displayAnsweredCount}/{playerCount}
          </span>
        </div>
        <div className="mt-3 space-y-2 text-sm text-white/80">
          {sortedPlayers
            .filter(p => p.hasAnswered || p.lastGuess)
            .slice(0, 4)
            .map(entry => (
              <div
                key={entry.userId}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-[#111] px-3 py-2"
              >
                <span className="truncate font-medium">{entry.username || `Joueur ${entry.userId}`}</span>
                <span className="text-xs text-white/60">{entry.hasAnswered ? "réponse envoyée" : "…"} </span>
              </div>
            ))}
          {sortedPlayers.filter(p => p.hasAnswered || p.lastGuess).length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs text-white/60">
              Aucune réponse pour l’instant
            </div>
          ) : null}
        </div>
      </div>
    ) : null

  const revealBlock =
    uiState === RoundUiState.Revealed && currentTrack ? (
      <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/50">Réponse</div>
              <div className="text-lg font-semibold text-white">{currentTrack.title}</div>
              <div className="text-sm text-white/70">{currentTrack.artist}</div>
              {trackOwnerUsername ? (
                <div className="text-xs text-white/60">Proposé par {trackOwnerUsername}</div>
              ) : null}
            </div>
            {verdictBadge()}
          </div>
          <div className="text-sm text-white/70">
            Ta proposition : {player?.lastGuess ? <span className="text-white">{player.lastGuess}</span> : "aucune"}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={onReady}
              disabled={disabled || player?.isReady}
              variant="outline"
              className="gap-2 rounded-full border-white/20 px-4 py-2 text-sm"
              style={{ borderColor: accent, color: accent }}
            >
              {player?.isReady ? "En attente des autres..." : "Prêt pour la suite"}
            </Button>
          </div>
        </div>
      </div>
    ) : null

  const competitionSection = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/50">Statut</div>
            <div className="text-xl font-semibold text-white sm:text-2xl">{statusLabel}</div>
            {localHasAnswered && uiState === RoundUiState.Playing ? (
              <div className="mt-1 text-xs uppercase tracking-[0.25em] text-white/50">En attente des autres joueurs…</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">{audioButton}</div>
        </div>
        {timeProgress ? <div className="mt-4">{timeProgress}</div> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        {livePositionCard}
        {miniFeed}
      </div>
      {revealBlock}
    </div>
  )

  const answerSection = (
    <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-6">
      <div className="flex flex-col items-center gap-4">
        {coverCard}
        <div className="w-full space-y-3">
          <form
            className="space-y-3"
            onSubmit={event => {
              event.preventDefault()
              if (uiState !== RoundUiState.Playing || disabled || localHasAnswered || justSubmitted) return
              const guess = `${guessTitle} ${guessArtist}`.trim()
              setJustSubmitted(true)
              onAnswer(guess, sourceGuess)
            }}
          >
            <input
              value={guessTitle}
              onChange={event => setGuessTitle(event.target.value)}
              placeholder="Titre du morceau"
              disabled={uiState !== RoundUiState.Playing || disabled || isLocked || justSubmitted || localHasAnswered}
              className={`w-full rounded-lg border ${"border-white/10 bg-[#0f0f0f]"} px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]`}
            />
            <input
              value={guessArtist}
              onChange={event => setGuessArtist(event.target.value)}
              placeholder="Artiste"
              disabled={uiState !== RoundUiState.Playing || disabled || isLocked || justSubmitted || localHasAnswered}
              className={`w-full rounded-lg border ${"border-white/10 bg-[#0f0f0f]"} px-3 py-3 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]`}
            />
            <div className={`flex flex-col gap-2 rounded-lg border ${"border-white/10 bg-[#0f0f0f]"} px-3 py-3`}>
              <label className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted,#a0a0a0)]">
                De quel joueur vient ce titre ?
              </label>
              <select
                value={sourceGuess ?? ""}
                onChange={e => setSourceGuess(e.target.value ? Number(e.target.value) : null)}
                disabled={uiState !== RoundUiState.Playing || disabled || isLocked || justSubmitted || localHasAnswered}
                className={`w-full rounded-lg border ${"border-white/10 bg-[#0f0f0f]"} px-3 py-2 text-sm text-white outline-none focus:border-[var(--ma-border,#444)]`}
              >
                <option value="">Je ne sais pas</option>
                {Object.values(state?.players ?? {}).map(player => (
                  <option key={player.userId} value={player.userId}>
                    {player.username || `Joueur ${player.userId}`}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={uiState !== RoundUiState.Playing || disabled || localHasAnswered || justSubmitted}
              className="w-full justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-white transition duration-150 hover:-translate-y-0.5"
              style={{ borderColor: accent, color: accent }}
            >
              {disabled || localHasAnswered || justSubmitted ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {localHasAnswered || justSubmitted ? "Réponse envoyée" : "Valider"}
            </Button>
          </form>
          <div className="flex flex-wrap items-center justify_between gap-2 text-xs text-white/60">
            <span>{displayAnsweredCount} joueurs ont déjà répondu</span>
            {streakText ? <span className="text-white/70">{streakText}</span> : null}
          </div>
        </div>
      </div>
    </div>
  )

  const mainStage = (
    <div className="space-y-6">
      {competitionSection}
      <div className="h-px bg-white/10" />
      {answerSection}
      {state?.phase === "FINISHED" ? (
        <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-4 text-center text-sm text-[var(--ma-muted,#c2c2c2)]">
          Partie terminée. Merci d’avoir joué !
        </div>
      ) : null}
      {showRevealModal && uiState === RoundUiState.Revealed && currentTrack ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-[#0b0b0b] p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-white/50">Révélation</div>
                <div className="text-2xl font-semibold text-white">{currentTrack.title}</div>
                <div className="text-sm text-white/70">{currentTrack.artist}</div>
                {trackOwnerUsername ? (
                  <div className="text-xs text-white/60">Proposé par {trackOwnerUsername}</div>
                ) : null}
              </div>
              {verdictBadge()}
            </div>
            <div className="space-y-2 rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
              <div className="text-xs uppercase tracking-[0.25em] text-white/50">Réponses</div>
              {revealResponses.length === 0 ? (
                <p className="text-sm text-white/70">En attente des données…</p>
              ) : (
                <div className="space-y-2">
                  {revealResponses.map((entry, idx) => (
                    <div
                      key={`${entry.username}-${idx}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111] px-3 py-2 text-sm text-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/50">#{idx + 1}</span>
                        <span className="font-semibold">{entry.username}</span>
                      </div>
                      <div className="text-right text-sm text-white/80">
                        <div>{entry.guess || "—"}</div>
                        <div className="text-xs text-white/50">
                          {entry.verdict === "correct"
                            ? "Validé"
                            : entry.verdict === "close"
                              ? "Partiel"
                              : entry.hasAnswered
                                ? "Répondu"
                                : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                disabled={disabled || player?.isReady}
                className="rounded-full border-white/20 px-4 py-2 text-sm"
                style={{ borderColor: accent, color: accent }}
                onClick={() => {
                  setShowRevealModal(false)
                  onReady()
                }}
              >
                {player?.isReady ? "En attente des autres..." : "Prêt"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  return <GameShell mode={mode} header={header} main={mainStage} variant="balanced" />
}
