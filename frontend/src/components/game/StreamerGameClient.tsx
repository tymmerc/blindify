"use client"

import { useMemo, useState, useEffect, type CSSProperties } from "react"
import { Check, Mic, Play, Trophy, Volume2, VolumeX } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { audioManager, DEFAULT_AUDIO_VOLUME } from "@/lib/audioManager"
import type { StreamerState } from "@/lib/types"

const PLAYBACK_VOLUME = DEFAULT_AUDIO_VOLUME

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
  const [muted, setMuted] = useState(audioManager.getState().muted)
  const [manualPlayRequired, setManualPlayRequired] = useState(false)
  const [waveformTick, setWaveformTick] = useState(0)

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

  // Reset on phase/round change
  useEffect(() => {
    setLocked(false)
    setGuess("")
  }, [state?.phase, state?.currentRound])

  // Mute state sync
  useEffect(() => {
    return audioManager.subscribe(snapshot => {
      setMuted(snapshot.muted)
    })
  }, [])

  // Waveform animation tick
  useEffect(() => {
    const isAudioPhase = state?.phase === "GUESSING_CHAT" || state?.phase === "GUESSING_STREAMER"
    if (!isAudioPhase) return
    const interval = setInterval(() => setWaveformTick(t => t + 1), 150)
    return () => clearInterval(interval)
  }, [state?.phase])

  // Audio playback for host during guessing phases
  useEffect(() => {
    if (!isHost) return
    const isAudioPhase = state?.phase === "GUESSING_CHAT" || state?.phase === "GUESSING_STREAMER"
    const previewUrl = state?.currentTrack?.previewUrl

    if (!isAudioPhase || !previewUrl) {
      audioManager.stop("streamer_phase_end", "streamer")
      return
    }

    audioManager.setVolume(PLAYBACK_VOLUME, "streamer")
    audioManager.setMuted(muted, "streamer")
    audioManager.play({ src: previewUrl, loop: true, volume: PLAYBACK_VOLUME, owner: "streamer" })
      .then(() => setManualPlayRequired(false))
      .catch((err) => {
        if ((err as DOMException)?.name === "NotAllowedError") {
          setManualPlayRequired(true)
        } else {
          setManualPlayRequired(true)
        }
      })

    return () => {
      audioManager.stop("streamer_track_cleanup", "streamer")
    }
  }, [isHost, state?.phase, state?.currentTrack?.previewUrl, muted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioManager.stop("streamer_unmount", "streamer")
    }
  }, [])

  const handleManualPlay = async () => {
    const previewUrl = state?.currentTrack?.previewUrl
    if (!previewUrl) return
    try {
      await audioManager.play({ src: previewUrl, loop: true, volume: PLAYBACK_VOLUME, owner: "streamer" })
      audioManager.setMuted(muted, "streamer")
      setManualPlayRequired(false)
    } catch {
      // Keep manualPlayRequired visible so user can retry
    }
  }

  const isChatPhase = state?.phase === "GUESSING_CHAT"
  const isStreamerPhase = state?.phase === "GUESSING_STREAMER"
  const isRevealFinal = state?.phase === "REVEAL_FINAL"
  const isRevealPartial = state?.phase === "REVEAL_PARTIAL"
  const isRoundEnded = state?.phase === "ROUND_ENDED"
  const isGameOver = state?.phase === "GAME_OVER"
  const isStarting = state?.phase === "STARTING_ROUND"
  const isLobby = state?.phase === "LOBBY"

  const isOwner = Boolean(
    state?.currentTrack?.metadata &&
    typeof state.currentTrack.metadata === "object" &&
    (state.currentTrack.metadata as { owner_user_id?: number }).owner_user_id === userId
  )
  const showInput = ((!isHost && isChatPhase) || (isHost && isStreamerPhase)) && !isOwner
  const showStart = isHost && (isRoundEnded || isLobby)
  const isAudioPlaying = (isChatPhase || isStreamerPhase) && !manualPlayRequired

  const theme = {
    "--bg": "#0b0710",
    "--surface": "#100d17",
    "--surface-strong": "#171225",
    "--border": `${accent}33`,
    "--ink": "#fff8fd",
    "--muted": "#d9cde1",
    "--accent": accent,
    "--success": "#8df0be",
    "--error": "#ff4d7a",
  } as CSSProperties

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

  const phaseLabel = (() => {
    switch (state?.phase) {
      case "LOBBY": return "En attente"
      case "STARTING_ROUND": return `Décompte... ${remaining}s`
      case "GUESSING_CHAT": return isHost ? "Le chat répond" : "À toi de répondre"
      case "GUESSING_STREAMER": return isHost ? "À toi de jouer" : "Le streamer répond"
      case "REVEAL_PARTIAL": return "Score du chat"
      case "REVEAL_FINAL": return "Révélation"
      case "ROUND_ENDED": return "Manche terminée"
      case "GAME_OVER": return "Partie terminée"
      default: return "En attente"
    }
  })()

  const panelClassName = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ ...theme, background: "var(--bg)", color: "var(--ink)" }}
    >
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-16 top-0 h-[400px] w-[400px] rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle at center, ${accent}30 0, transparent 60%)` }}
        />
        <div
          className="absolute -right-10 bottom-0 h-[350px] w-[350px] rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle at center, ${accent}25 0, transparent 65%)` }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col">
        {/* Header */}
        <header className="shrink-0 border-b border-[var(--border)]/80 backdrop-blur">
          <div className="mx-auto flex w-full items-center justify-between gap-4 px-6 py-3 lg:px-10">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-strong)]">
                <Mic className="relative h-4 w-4" style={{ color: accent }} />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.4em] text-[var(--muted)]">Blindz</p>
                <h1 className="text-lg font-semibold leading-tight">Mode Streamer</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1 text-xs text-[var(--muted)]">
                {state?.currentRound ?? 0}/{state?.totalRounds ?? 0}
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1 text-xs" style={{ color: accent }}>
                {isHost ? "Host" : "Chat"}
              </span>
              {isHost && (
                <button
                  className="rounded-full border border-[var(--border)] p-2 text-[var(--muted)] transition hover:text-[var(--ink)]"
                  onClick={() => {
                    const next = !muted
                    audioManager.setMuted(next)
                    if (!next) audioManager.setVolume(PLAYBACK_VOLUME, "streamer")
                    setMuted(next)
                  }}
                >
                  {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              )}
              {onExit && (
                <button
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] transition hover:text-[var(--ink)]"
                  onClick={onExit}
                >
                  Quitter
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 pb-8 pt-5">
          {/* Score bar */}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">Streamer</p>
              <p className="text-xl font-bold" style={{ color: accent }}>{state?.streamerWins ?? 0}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">VS</p>
              <p className="text-xs text-[var(--muted)]">
                {state?.subMode === "duo" ? "DUO" : state?.subMode === "solo" ? "SOLO" : "CHAT"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">Chat</p>
              <p className="text-xl font-bold" style={{ color: accent }}>{state?.chatWins ?? 0}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* GAME OVER */}
            {isGameOver ? (
              <motion.div
                key="gameover"
                className={panelClassName}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${accent}22` }}>
                    <Trophy className="h-7 w-7" style={{ color: accent }} />
                  </div>
                  <h2 className="text-2xl font-bold">Partie terminée</h2>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-sm text-[var(--muted)]">Streamer</p>
                      <p className="text-3xl font-bold" style={{ color: accent }}>{state?.streamerWins ?? 0}</p>
                    </div>
                    <span className="text-xl text-[var(--muted)]">-</span>
                    <div className="text-center">
                      <p className="text-sm text-[var(--muted)]">Chat</p>
                      <p className="text-3xl font-bold" style={{ color: accent }}>{state?.chatWins ?? 0}</p>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--muted)]">
                    {(state?.streamerWins ?? 0) > (state?.chatWins ?? 0)
                      ? "Le streamer l'emporte !"
                      : (state?.chatWins ?? 0) > (state?.streamerWins ?? 0)
                        ? "Le chat l'emporte !"
                        : "Égalité !"}
                  </p>
                  {onExit && (
                    <button
                      onClick={onExit}
                      className="mt-2 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--ink)]"
                    >
                      Retour au lobby
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (isRevealFinal || isRoundEnded) && state?.currentTrack ? (
              /* REVEAL FINAL */
              <motion.div
                key="reveal"
                className={panelClassName}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex flex-col items-center gap-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--muted)]">La réponse était</p>
                  <h2 className="text-2xl font-bold">{state.currentTrack.title}</h2>
                  <p className="text-base text-[var(--muted)]">{state.currentTrack.artist}</p>

                  {state.chatSnapshot && (
                    <div className="mt-2 flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2">
                      <div className="text-center">
                        <p className="text-xs text-[var(--muted)]">Chat</p>
                        <p className="text-lg font-semibold" style={{ color: accent }}>
                          {state.chatSnapshot.percentCorrect}%
                        </p>
                      </div>
                      <div className="h-6 w-px bg-[var(--border)]" />
                      <div className="text-center">
                        <p className="text-xs text-[var(--muted)]">Correct</p>
                        <p className="text-sm">
                          {state.chatSnapshot.correct}/{state.chatSnapshot.total}
                        </p>
                      </div>
                    </div>
                  )}

                  {showStart && (
                    <button
                      onClick={onHostStart}
                      className="mt-4 rounded-full px-6 py-2.5 text-sm font-semibold transition hover:opacity-90"
                      style={{ background: accent, color: "#0b0d11" }}
                    >
                      Manche suivante
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              /* GUESSING / STARTING / LOBBY */
              <motion.div
                key="playing"
                className={panelClassName}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex flex-col gap-4">
                  {/* Phase label + timer */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--muted)]">{phaseLabel}</p>
                      {isStarting && (
                        <p className="mt-1 text-3xl font-bold" style={{ color: accent }}>{remaining}</p>
                      )}
                    </div>
                    {(isChatPhase || isStreamerPhase) && (
                      <span className="text-lg font-semibold" style={{ color: remaining <= 5 ? "var(--error)" : accent }}>
                        {remaining}s
                      </span>
                    )}
                  </div>

                  {/* Waveform visualizer */}
                  {(isChatPhase || isStreamerPhase) && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                      <div className="flex h-16 items-end justify-center gap-1">
                        {Array.from({ length: 16 }).map((_, idx) => {
                          const height = isAudioPlaying
                            ? Math.max(8, Math.min(56, (Math.sin(waveformTick * 0.3 + idx * 0.8) + 1) * 20 + 8))
                            : 6
                          return (
                            <div
                              key={idx}
                              className="w-2 rounded-full transition-[height] duration-150"
                              style={{ background: accent, height: `${height}px`, opacity: isAudioPlaying ? 0.9 : 0.3 }}
                            />
                          )
                        })}
                      </div>
                      {/* Timer bar */}
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg)]">
                        <div
                          className="h-full rounded-full transition-[width] duration-1000"
                          style={{ width: `${Math.min(100, timerRatio * 100)}%`, background: accent }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Manual play button for host */}
                  {isHost && manualPlayRequired && (isChatPhase || isStreamerPhase) && (
                    <button
                      onClick={handleManualPlay}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm transition hover:opacity-80"
                      style={{ color: accent }}
                    >
                      <Play className="h-4 w-4" />
                      Lancer la musique
                    </button>
                  )}

                  {/* Chat snapshot (shown during REVEAL_PARTIAL or when available in guessing phases) */}
                  {(isRevealPartial || (isStreamerPhase && state?.chatSnapshot)) && state?.chatSnapshot && (
                    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                      <span className="text-[var(--muted)]">Score du chat</span>
                      <span className="font-semibold" style={{ color: accent }}>
                        {state.chatSnapshot.correct}/{state.chatSnapshot.total} ({state.chatSnapshot.percentCorrect}%)
                      </span>
                    </div>
                  )}

                  {/* Guess input */}
                  {showInput ? (
                    <form
                      className="flex flex-col gap-3"
                      onSubmit={e => { e.preventDefault(); handleSubmit() }}
                    >
                      <input
                        value={guess}
                        onChange={e => setGuess(e.target.value)}
                        placeholder={isHost ? "Titre + artiste..." : "Titre + artiste..."}
                        disabled={locked}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
                      />
                      <motion.button
                        type="submit"
                        disabled={locked || !guess.trim()}
                        className="w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-60"
                        style={{
                          background: locked ? "var(--surface-strong)" : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                          color: locked ? "var(--muted)" : "#0b0d11",
                          border: locked ? "1px solid var(--border)" : "none",
                        }}
                        whileTap={!locked ? { scale: 0.95 } : undefined}
                      >
                        {locked ? (
                          <span className="flex items-center justify-center gap-2">
                            <Check className="h-4 w-4" style={{ color: accent }} />
                            Envoyée
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Check className="h-4 w-4" />
                            Valider
                          </span>
                        )}
                      </motion.button>
                    </form>
                  ) : isOwner ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-center text-sm text-[var(--muted)]">
                      C&apos;est ta musique ! Tu ne peux pas jouer sur cette manche.
                    </div>
                  ) : (isChatPhase || isStreamerPhase) ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-center text-sm text-[var(--muted)]">
                      {isHost && isChatPhase && "Le chat répond..."}
                      {!isHost && isStreamerPhase && "Le streamer répond..."}
                      {!isHost && isChatPhase && locked && "Réponse envoyée, en attente..."}
                    </div>
                  ) : null}

                  {/* Lobby/start button */}
                  {showStart && (
                    <button
                      onClick={onHostStart}
                      className="w-full rounded-xl py-3 text-sm font-semibold transition hover:opacity-90"
                      style={{ background: accent, color: "#0b0d11" }}
                    >
                      {isLobby ? "Lancer la partie" : "Manche suivante"}
                    </button>
                  )}

                  {/* Lobby waiting message for non-host */}
                  {isLobby && !isHost && (
                    <div className="text-center text-sm text-[var(--muted)]">
                      En attente du streamer...
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
