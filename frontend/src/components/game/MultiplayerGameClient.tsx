"use client"

import { accentTexte } from "@/lib/accentText"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { MultiplayerGameState, RevealStep, UserSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Check, Clock, Lock, Play, Users, Volume2, VolumeX, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { audioManager } from "@/lib/audioManager"
import { GAME_MODES, type GameModeConfig, type GameMode } from "@/lib/gameModes"
import { useWakeLock } from "@/lib/useWakeLock"
import { shortGameNotice } from "@/lib/roundCount"
import { RevealPanel } from "./pacing/RevealPanel"
import { RoundCountdown } from "./pacing/RoundCountdown"
import { useServerClock } from "@/hooks/useServerClock"
import { TheaterGameView } from "./TheaterGameView"
import { showOwnerQuestion } from "@/lib/ownerQuestion"
import { SpectatorBadge } from "./SpectatorBadge"
import { DeezerCredit, SpotifyTrackLink } from "./SourceCredits"
import { ANSWER_INPUT_PROPS } from "@/lib/answerInput"

const VINYL_GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"

const SAGE = "#7d9471"

// Platine analogique : sillons sombres, label central couleur d'accent bordé d'encre, trou papier.
function AnalogVinyl({
  size,
  spinning,
  accentColor,
  coverUrl,
  blurred = false,
}: {
  size: number
  spinning: boolean
  accentColor: string
  coverUrl?: string | null
  blurred?: boolean
}) {
  return (
    <div
      className="relative rounded-full border-[3px] border-line"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        maxWidth: "80vw",
        maxHeight: "80vw",
        background: VINYL_GROOVES,
        animation: spinning ? "vinyl-spin 7s linear infinite" : "none",
      }}
    >
      {coverUrl ? (
        <div className="absolute inset-[26%] overflow-hidden rounded-full border-[3px] border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt="Pochette d'album"
            className="h-full w-full object-cover transition-[filter] duration-700"
            style={{ filter: blurred ? "blur(4px) saturate(0.8)" : "none" }}
          />
        </div>
      ) : (
        <span
          aria-hidden
          className="absolute inset-[33%] rounded-full border-[3px] border-line"
          style={{ background: accentColor }}
        />
      )}
      <span aria-hidden className="absolute inset-[47%] z-10 rounded-full border-2 border-line bg-paper" />
    </div>
  )
}


export type ChatMessage = {
  userId: number
  username: string
  message: string
  timestamp: number
}

type Props = {
  user: UserSummary
  state: MultiplayerGameState | null
  serverNow: number
  onAnswer: (guessTitle: string, guessArtist: string, sourceUserId?: number | null) => void
  /** « Suivant » de l'hote entre deux manches (T38) : passe a l'ecran suivant. */
  onNext?: (round: number, step: RevealStep) => void
  onExit?: () => void
  disabled?: boolean
  autoAdvance?: boolean
  modeConfig?: GameModeConfig
  accentColor?: string
  mode: GameMode
  chatMessages?: ChatMessage[]
  onSendChat?: (message: string) => void
  /** Incremente quand le serveur refuse une reponse -> sortir de l'etat "Envoyee". */
  answerRejectSignal?: number
  /** Pause / reprise (hote uniquement) : emis vers le serveur par le parent. */
  onPauseToggle?: () => void
  /** Spectateurs de la salle (T18) : « 👀 1 spectateur » dans l'en-tete. */
  spectators?: number
  /** L'extrait de la manche ne joue pas (lien expire) : redemander un lien neuf au serveur (T35). */
  onPreviewBroken?: (round: number) => void
}

type Phase = "guessing" | "locked" | "reveal"

export function MultiplayerGameClient({
  user,
  state,
  serverNow,
  onAnswer,
  onNext,
  onExit,
  disabled,
  onPauseToggle,
  onPreviewBroken,
  modeConfig,
  accentColor,
  mode,
  chatMessages = [],
  onSendChat,
  answerRejectSignal,
  spectators = 0,
}: Props) {
  const resolvedConfig = modeConfig ?? GAME_MODES[mode] ?? GAME_MODES.friends
  const accent = accentColor ?? (resolvedConfig as { theme?: { accent?: string } }).theme?.accent ?? "#c65133"
  const gameConfig = resolvedConfig.game
  const isHost = user.id === state?.hostUserId
  // En event, l'hote presente seulement SAUF s'il a choisi "je joue aussi" (hostPlays) :
  // dans ce cas il joue comme un participant tout en restant la source audio.
  const hostPlays = state?.hostPlays === true
  const isEventPresenter = mode === "event" && isHost && !hostPlays
  const isEventParticipant = mode === "event" && !isHost
  // largeUI only applies to the presenter projection — participants get normal sizing
  const isLargeUI = "largeUI" in gameConfig && gameConfig.largeUI === true && !isEventParticipant
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [sourceGuess, setSourceGuess] = useState<number | null>(null)
  const [muted, setMuted] = useState(audioManager.getState().muted)
  // Mobile : pas de slider in-app (cache <640px) -> on demarre a 100% pour que le
  // volume physique du telephone controle tout le niveau. Desktop garde le defaut + slider.
  const [volume, setVolume] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
      ? 1
      : audioManager.getState().volume,
  )
  const [manualPlayRequired, setManualPlayRequired] = useState(false)
  const [audioBrokenNotice, setAudioBrokenNotice] = useState(false)
  const showAudioBrokenNotice = () => setAudioBrokenNotice(true)
  // Watchdog audio : force une re-execution de l'effet de lecture (relance).
  const [audioRetryNonce, setAudioRetryNonce] = useState(0)
  const audioRetriesRef = useRef(0)
  // T35 : manche pour laquelle un lien neuf a deja ete demande (une fois par manche).
  // Cle = heure de depart de la manche : une revanche repart a la manche 1 sans demontage.
  const previewAskedRef = useRef<number | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Autour d'une table : aucun ecran ne doit se mettre en veille pendant la partie
  // (l'ecran central diffuse, les telephones servent de manette).
  useWakeLock(mode === "event")

  // Le 3-2-1 avant chaque manche (T38) : horloge serveur fine.
  const clock = useServerClock(serverNow, state?.phase === "GUESSING" || state?.phase === "REVEAL")

  // Petit buzz quand une manche demarre : ramene le joueur qui regardait ailleurs.
  const lastVibratedRoundRef = useRef(0)
  useEffect(() => {
    if (mode !== "event" || isEventPresenter) return
    const round = state?.currentRound ?? 0
    if (state?.phase !== "GUESSING" || round === 0) return
    if (lastVibratedRoundRef.current === round) return
    lastVibratedRoundRef.current = round
    try { navigator.vibrate?.(60) } catch { /* non supporte */ }
  }, [mode, isEventPresenter, state?.phase, state?.currentRound])

  const remaining = useMemo(() => {
    if (!state?.timing?.revealAt) return 0
    return Math.max(0, Math.ceil((state.timing.revealAt - serverNow) / 1000))
  }, [state?.timing?.revealAt, serverNow])

  const totalSeconds = useMemo(() => {
    if (!state?.timing?.startAt || !state?.timing?.revealAt) return 30
    return Math.max(1, Math.floor((state.timing.revealAt - state.timing.startAt) / 1000))
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

  let uiPhase: Phase
  switch (backendPhase) {
    case "GUESSING":
      uiPhase = player?.hasAnswered || justSubmitted ? "locked" : "guessing"
      break
    case "REVEAL":
    case "FINISHED":
      uiPhase = "reveal"
      break
    default:
      uiPhase = "guessing"
  }

  const hasAnswered = Boolean(player?.hasAnswered)
  const localHasAnswered = hasAnswered || justSubmitted
  const isPlaying = uiPhase === "guessing"
  const isLocked = uiPhase === "locked"
  const isRevealed = uiPhase === "reveal"

  const timerProgress = isPlaying ? Math.max(0, Math.min(100, (remaining / totalSeconds) * 100)) : 100
  const timerColor = isPlaying
    ? remaining > 10
      ? "rgb(var(--c-ink))"
      : remaining > 5
        ? "rgb(var(--c-gold-txt))"
        : "rgb(var(--c-rouge-txt))"
    : accent

  const hasInput = guessTitle.trim().length > 0 || guessArtist.trim().length > 0

  const theme = {
    // Thème papier "Club analogique" - transparent pour laisser le papier du body
    "--bg": "transparent",
    "--surface": "rgb(var(--c-paper-deep))",
    "--surface-strong": "rgb(var(--c-well))",
    "--border": "rgb(var(--c-line) / 0.35)",
    "--ink": "rgb(var(--c-ink))",
    "--muted": "rgb(var(--c-sourd))",
    "--accent": accent,
    "--success": "rgb(var(--c-sage))",
    "--warn": "rgb(var(--c-gold))",
    "--error": "rgb(var(--c-rouge-txt))",
  } as CSSProperties

  useEffect(() => {
    return audioManager.subscribe(snapshot => {
      setMuted(snapshot.muted)
      setVolume(snapshot.volume)
    })
  }, [])

  // Le serveur a refuse la reponse : retirer le lock optimiste "Envoyee" pour
  // que le joueur puisse re-tenter au lieu de croire que c'est parti.
  const firstRejectSignal = useRef(answerRejectSignal)
  useEffect(() => {
    if (answerRejectSignal === undefined) return
    if (firstRejectSignal.current === undefined) { firstRejectSignal.current = answerRejectSignal; return }
    if (answerRejectSignal !== firstRejectSignal.current) {
      firstRejectSignal.current = answerRejectSignal
      setJustSubmitted(false)
    }
  }, [answerRejectSignal])

  // Audio should play during both guessing and locked phases (music keeps playing
  // after submit while waiting for other players). Use a stable boolean so the effect
  // doesn't re-trigger on guessing↔locked transitions.
  // In event mode, only the presenter plays audio — participants hear it from the projector.
  // En mode "autour d'une table", seul l'ecran de l'hote diffuse la musique. S'il
  // quitte, les joueurs devinaient sur du silence, chrono qui tourne, sans un mot
  // d'explication. On bascule alors le son sur leur telephone. Le delai evite de
  // declencher ca pendant les quelques secondes ou sa socket se rattache.
  // On se fie a `hostConnected`, publie par le serveur : quand l'hote presente
  // seulement, il n'est PAS dans `players`, donc son absence de la liste ne
  // prouve rien. `!== false` pour ne pas declencher sur un etat plus ancien
  // qui ne porterait pas encore le champ.
  const hostAbsent = isEventParticipant && state?.hostConnected === false
  const [hostGone, setHostGone] = useState(false)
  useEffect(() => {
    if (!hostAbsent) {
      setHostGone(false)
      return
    }
    const timer = setTimeout(() => setHostGone(true), 6000)
    return () => clearTimeout(timer)
  }, [hostAbsent])

  const isPaused = state?.paused === true
  // L'extrait continue pendant la reponse et le classement (T38), il s'arrete
  // au 3-2-1 de la manche suivante (nouvel extrait, qui attend son depart).
  const isAudioPhase = (uiPhase === "guessing" || uiPhase === "locked" || backendPhase === "REVEAL") && (!isEventParticipant || hostGone) && !isPaused

  // Warmup audio on first user interaction in the game view.
  // This unlocks autoplay for non-host players who didn't click "Lancer".
  const warmedUp = useRef(false)
  useEffect(() => {
    if (warmedUp.current) return
    const handler = () => {
      audioManager.warmup()
      warmedUp.current = true
      document.removeEventListener("click", handler)
      document.removeEventListener("touchstart", handler)
    }
    document.addEventListener("click", handler, { once: true })
    document.addEventListener("touchstart", handler, { once: true })
    return () => {
      document.removeEventListener("click", handler)
      document.removeEventListener("touchstart", handler)
    }
  }, [])

  // Track the current round to force audio restart on new rounds even if
  // isAudioPhase and previewUrl happen to be the same across rounds.
  const currentRound = state?.currentRound ?? 0

  // Une fois par manche : le serveur renvoie l'etat avec un lien neuf (ou celui
  // deja rafraichi), et l'effet de lecture repart tout seul sur ce lien.
  const askFreshPreview = () => {
    const roundKey = state?.timing?.startAt ?? null
    if (!onPreviewBroken || !currentRound || roundKey === null || previewAskedRef.current === roundKey) return
    previewAskedRef.current = roundKey
    onPreviewBroken(currentRound)
  }

  // Sequence platine : vinyle IMMOBILE, le bras se pose (~1.3s), la musique part
  // a startAt. Avant, tout demarrait en meme temps et ca cassait l'illusion.
  const [needleStage, setNeedleStage] = useState<"raised" | "dropping" | "down">("down")
  useEffect(() => {
    const startAt = state?.timing?.startAt
    if (uiPhase === "reveal" || !startAt) { setNeedleStage("raised"); return }
    const wait = startAt - serverNow
    if (wait <= 120) { setNeedleStage("down"); return }
    setNeedleStage("raised")
    const t1 = setTimeout(() => setNeedleStage("dropping"), Math.max(0, wait - 1300))
    const t2 = setTimeout(() => setNeedleStage("down"), wait)
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // serverNow volontairement hors deps : il tique chaque seconde, on ne veut
    // sequencer qu'au changement de manche / de phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.timing?.startAt, currentRound, uiPhase === "reveal"])


  useEffect(() => {
    if (!isAudioPhase || !currentTrack?.previewUrl) {
      audioManager.stop("multiplayer_phase_end", "multiplayer")
      return
    }
    audioManager.setVolume(volume, "multiplayer")
    audioManager.setMuted(muted, "multiplayer")
    // Calculate seek position to sync audio across players
    // timing.startAt is the server timestamp when the round started
    const startAt = state?.timing?.startAt ?? 0
    const elapsed = startAt ? (serverNow - startAt) / 1000 : 0
    const seekTo = elapsed > 0.5 ? elapsed : 0 // Only seek if >500ms has passed

    const playedSrc = currentTrack.previewUrl!
    const startPlayback = () => {
      audioManager.play({ src: playedSrc, loop: true, volume, owner: "multiplayer", seekTo })
        .then(() => {
          setManualPlayRequired(false)
          setAudioBrokenNotice(false)
        })
        .catch((err) => {
          if ((err as DOMException)?.name === "NotAllowedError") {
            setManualPlayRequired(true)
          } else {
            // Extrait illisible (lien Deezer expire : 403 -> NotSupportedError).
            // Rejouer le meme lien ne sert a rien : on en demande un neuf, et le
            // watchdog relance la lecture (puis montre le bouton et le message
            // si ca ne joue toujours pas). Avant, le bouton play apparaissait
            // tout de suite, sans message, et rejouait le lien mort (T35).
            console.error("multiplayer_audio_play_failed", err)
            askFreshPreview()
          }
        })
    }

    // Pre-roll : si la manche demarre dans le futur (decompte 3-2-1), on attend
    // l'heure de depart au lieu de jouer par-dessus le decompte.
    const waitMs = startAt ? startAt - serverNow : 0
    if (waitMs > 250) {
      const t = setTimeout(startPlayback, waitMs)
      return () => {
        clearTimeout(t)
        audioManager.stopIfSrc(playedSrc, "multiplayer_track_cleanup", "multiplayer")
      }
    }
    startPlayback()
    return () => {
      audioManager.stopIfSrc(playedSrc, "multiplayer_track_cleanup", "multiplayer")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volume changes are applied via setVolume, not by re-triggering play. currentRound forces re-trigger on new rounds.
  }, [isAudioPhase, currentTrack?.previewUrl, muted, currentRound, audioRetryNonce])

  useEffect(() => {
    return () => {
      audioManager.stop("multiplayer_unmount", "multiplayer")
    }
  }, [])

  // Nouvelle manche : le watchdog repart de zero.
  useEffect(() => { audioRetriesRef.current = 0; setAudioBrokenNotice(false) }, [currentRound])

  // Watchdog : pendant une phase audio, si rien ne joue alors que ca devrait
  // (extrait mort, lecture interrompue par le navigateur, race au rematch),
  // on relance tout seul jusqu'a 2 fois, puis on montre le bouton play + un
  // message. Fini les manches muettes sans explication.
  useEffect(() => {
    if (!isAudioPhase || !currentTrack?.previewUrl || manualPlayRequired) return
    const id = setInterval(() => {
      const startAt = state?.timing?.startAt ?? 0
      if (startAt && Date.now() < startAt + 1500) return // pas encore l'heure
      if (audioManager.getState().playing) { audioRetriesRef.current = 0; return }
      askFreshPreview()
      if (audioRetriesRef.current < 2) {
        audioRetriesRef.current += 1
        setAudioRetryNonce(n => n + 1) // re-execute l'effet de lecture
      } else {
        setManualPlayRequired(true)
        showAudioBrokenNotice()
      }
    }, 2500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAudioPhase, currentTrack?.previewUrl, manualPlayRequired, currentRound])


  // Reset justSubmitted as soon as reveal happens, so it's clean for the next round.
  // Without this, justSubmitted stays true through REVEAL→GUESSING transition,
  // causing an immediate LOCK on the new round (deadlock: reset only fires on "guessing"
  // but uiPhase can't become "guessing" while justSubmitted is true).
  useEffect(() => {
    if (uiPhase === "reveal") {
      setJustSubmitted(false)
    }
  }, [uiPhase])

  // Nouvelle manche = nouvelle ardoise, MEME si on n'est pas passe par un reveal.
  // Apres une coupure reseau on saute directement de GUESSING(manche N, verrouille)
  // a GUESSING(manche N+2) : sans ce reset le joueur restait bloque sur "C'est note"
  // avec son ancienne reponse, incapable de jouer la manche en cours.
  const lastRoundRef = useRef(0)
  useEffect(() => {
    const round = state?.currentRound ?? 0
    if (round === lastRoundRef.current) return
    lastRoundRef.current = round
    setJustSubmitted(false)
    setGuessTitle("")
    setGuessArtist("")
    setSourceGuess(null)
  }, [state?.currentRound])

  useEffect(() => {
    if (uiPhase === "guessing") {
      setGuessArtist("")
      setGuessTitle("")
      setSourceGuess(null)
      setJustSubmitted(false)
      setManualPlayRequired(false)
    }
  }, [uiPhase, state?.currentRound])

  // Safety: if stuck in LOCK (justSubmitted but backend says not answered) and timer expired,
  // re-emit the answer to recover from a lost socket event.
  const onAnswerRef = useRef(onAnswer)
  onAnswerRef.current = onAnswer
  const lastResubmitRef = useRef<number>(0)
  useEffect(() => {
    if (!justSubmitted || hasAnswered) return
    if (remaining > 0) return
    if (backendPhase !== "GUESSING") return
    // Timer expired, we submitted but backend doesn't know — re-emit after 2s
    const timer = setTimeout(() => {
      if (Date.now() - lastResubmitRef.current < 5000) return
      lastResubmitRef.current = Date.now()
      onAnswerRef.current(guessTitle.trim(), guessArtist.trim(), sourceGuess)
    }, 2000)
    return () => clearTimeout(timer)
  }, [justSubmitted, hasAnswered, remaining, backendPhase, guessTitle, guessArtist, sourceGuess])

  // Auto-scroll chat
  useEffect(() => {
    const container = chatScrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [chatMessages])

  const sortedPlayersFixed = useMemo(() => {
    if (!state?.players) return []
    return Object.values(state.players)
      // En event, l'hote est exclu des listes SAUF s'il a choisi "je joue aussi".
      .filter(p => !(mode === "event" && !state.hostPlays && state.hostUserId && p.userId === state.hostUserId))
      .map(p => ({
        userId: p.userId,
        username: p.username,
        score: p.score,
        accuracy: p.accuracy,
        avatar: p.avatar,
        hasAnswered: p.hasAnswered,
        lastGuess: p.lastGuess,
        lastVerdict: p.lastVerdict,
        lastGained: p.lastGained ?? 0,
        isReady: p.isReady,
        streak: p.streak ?? 0,
        bestStreak: p.bestStreak ?? 0,
        totalReactionMs: p.totalReactionMs,
        disconnected: p.disconnected === true,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        // Egalite de points : le plus rapide (cumul des temps de reponse) devant
        return (a.totalReactionMs ?? Infinity) - (b.totalReactionMs ?? Infinity)
      })
  }, [state?.players, mode, state?.hostUserId])

  // Les "X/Y" ne comptent que les joueurs encore la. Sinon la table attend un
  // fantome : "0/3 prets" alors que le 3e a ferme son onglet il y a 30 secondes.
  // Ils restent visibles au classement (une coupure de tunnel ne doit pas effacer
  // quelqu'un), ils sortent juste des denominateurs.
  const activePlayers = useMemo(() => sortedPlayersFixed.filter(p => !p.disconnected), [sortedPlayersFixed])
  const answeredCount = useMemo(() => activePlayers.filter(p => p.hasAnswered).length, [activePlayers])
  const displayAnsweredCount = Math.max(answeredCount, localHasAnswered ? 1 : 0)
  const playerCount = activePlayers.length

  // Picker "qui a ajoute ?" : 3 candidats (le bon + 2 leurres) fournis par le serveur
  // via ownerChoices ; fallback sur tous les joueurs si absent (< 3 joueurs).
  const pickerPlayers = useMemo(() => {
    const choices = currentTrack?.ownerChoices
    if (!choices || choices.length === 0) return sortedPlayersFixed
    const resolved = choices
      .map(id => sortedPlayersFixed.find(p => p.userId === id))
      .filter((p): p is typeof sortedPlayersFixed[number] => Boolean(p))
    return resolved.length > 0 ? resolved : sortedPlayersFixed
  }, [currentTrack?.ownerChoices, sortedPlayersFixed])

  const askOwner = showOwnerQuestion({
    ownerQuestion: currentTrack?.ownerQuestion,
    singleContributor: state?.singleContributor,
    playerCount: sortedPlayersFixed.length,
  })

  const handleSubmit = () => {
    if (uiPhase !== "guessing" || disabled || localHasAnswered || justSubmitted) return
    setJustSubmitted(true)
    onAnswer(guessTitle.trim(), guessArtist.trim(), sourceGuess)
  }

  // "Je sais pas" : envoie une reponse vide. Le serveur marque le joueur comme
  // ayant repondu -> des que tout le monde a tranche, le reveal part sans
  // attendre la fin du chrono. C'est ca qui rend les manches courtes a 2-3.
  const handlePass = () => {
    if (uiPhase !== "guessing" || disabled || localHasAnswered || justSubmitted) return
    setJustSubmitted(true)
    onAnswer("", "", null)
  }

  const [playLoading, setPlayLoading] = useState(false)

  const handleManualPlay = async () => {
    if (!currentTrack?.previewUrl || playLoading) return
    setPlayLoading(true)
    try {
      await audioManager.play({
        src: currentTrack.previewUrl,
        loop: true,
        volume,
        owner: "multiplayer",
      })
      audioManager.setMuted(muted, "multiplayer")
      setManualPlayRequired(false)
    } catch (err) {
      // Keep manualPlayRequired visible so user can retry
      if ((err as DOMException)?.name !== "NotAllowedError") askFreshPreview()
    } finally {
      setPlayLoading(false)
    }
  }

  // Plus de bouton "cliquer pour lancer" : si l'autoplay est bloque (invite qui n'a pas
  // encore interagi), on relance le son au PREMIER tap n'importe ou sur la page.
  useEffect(() => {
    if (!manualPlayRequired || !isAudioPhase) return
    const resume = () => { void handleManualPlay() }
    document.addEventListener("pointerdown", resume, { once: true })
    return () => document.removeEventListener("pointerdown", resume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualPlayRequired, isAudioPhase, currentTrack?.previewUrl])

  // Le navigateur met l'audio en pause quand l'onglet passe en arriere-plan (alt-tab entre
  // Safari/Chrome). Au retour, on relance le son tout seul -> plus besoin de couper/remettre.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (!isAudioPhase || !currentTrack?.previewUrl) return
      if (audioManager.getState().playing) return
      audioManager.resume("multiplayer")
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAudioPhase, currentTrack?.previewUrl, muted])

  const panelClassName =
    "rounded-md border-2 border-line bg-[var(--surface)] p-5 shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]"

  // Waveform bars component
  const WaveformBars = ({ active }: { active: boolean }) => (
    <div className="flex items-end gap-[2px] h-4">
      {[0, 1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: accent }}
          animate={active ? {
            height: ["6px", `${12 + Math.sin(i * 1.5) * 4}px`, "6px"],
          } : { height: "4px" }}
          transition={active ? {
            duration: 0.6 + i * 0.1,
            repeat: Infinity,
            ease: "easeInOut",
          } : { duration: 0.2 }}
        />
      ))}
    </div>
  )

  // Theater UI is the new visual for friends/streamer modes.
  // Overlay de pause : plein ecran chez tout le monde, bouton reprendre chez l'hote.
  const pauseOverlay = isPaused ? (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: "rgb(var(--c-ink-block) / .92)" }}>
      <p className="font-display text-6xl font-bold text-on-ink">PAUSE</p>
      <p className="text-sm font-semibold text-[#d8cdb4]">
        {isHost ? "La partie est gelée pour tout le monde." : "L'hôte a mis la partie en pause."}
      </p>
      {isHost && onPauseToggle && (
        <button
          type="button"
          onClick={onPauseToggle}
          className="rounded-md border-2 border-on-ink bg-paper px-6 py-3 font-display text-lg font-bold text-ink shadow-[4px_4px_0_rgba(244,236,219,.3)]"
        >
          Reprendre
        </button>
      )}
    </div>
  ) : null

  // Les ecrans entre deux manches (T38), les memes dans tous les modes.
  const revealPlayers = state?.players
    ? Object.values(state.players).filter(p => sortedPlayersFixed.some(s => s.userId === p.userId))
    : []
  const nextHandler = isHost && onNext ? onNext : undefined
  const revealPanel = (opts: { large?: boolean; fill?: boolean; meId: number | null }) =>
    state && (state.phase === "REVEAL" || state.phase === "FINISHED") && currentTrack ? (
      <RevealPanel state={state} players={revealPlayers} meId={opts.meId} onNext={nextHandler} now={clock} large={opts.large} fill={opts.fill} />
    ) : null
  const countdown = state ? (
    <RoundCountdown round={state.currentRound} totalRounds={state.totalRounds} startAt={state.phase === "GUESSING" ? state.timing?.startAt : null} now={clock} large={isEventPresenter} />
  ) : null

  // Partie plus courte que demandee (titres sans extrait) : dit pendant la 1re manche.
  const shortNotice = shortGameNotice(state)

  // Event mode keeps its dedicated presenter/participant rendering below.
  if (mode !== "event") {
    return (
      <>
      {pauseOverlay}
      {countdown}
      <TheaterGameView
        user={user}
        state={state}
        uiPhase={uiPhase}
        isPlaying={isPlaying}
        isHost={isHost}
        onPauseToggle={onPauseToggle}
        needleStage={needleStage}
        isLocked={isLocked}
        isRevealed={isRevealed}
        remaining={remaining}
        totalSeconds={totalSeconds}
        sortedPlayers={sortedPlayersFixed}
        answeredCount={answeredCount}
        displayAnsweredCount={displayAnsweredCount}
        playerCount={playerCount}
        guessTitle={guessTitle}
        setGuessTitle={setGuessTitle}
        guessArtist={guessArtist}
        setGuessArtist={setGuessArtist}
        sourceGuess={sourceGuess}
        setSourceGuess={setSourceGuess}
        localHasAnswered={localHasAnswered}
        onSubmit={handleSubmit}
        onPass={handlePass}
        disabled={disabled}
        muted={muted}
        volume={volume}
        onToggleMute={() => {
          const next = !muted
          audioManager.setMuted(next)
          setMuted(next)
        }}
        onVolumeChange={v => {
          audioManager.setVolume(v, "multiplayer")
          setVolume(v)
          if (v > 0 && muted) { audioManager.setMuted(false); setMuted(false) }
          if (v === 0 && !muted) { audioManager.setMuted(true); setMuted(true) }
        }}
        manualPlayRequired={manualPlayRequired}
        isAudioPhase={isAudioPhase}
        onManualPlay={handleManualPlay}
        currentTrack={currentTrack}
        trackOwnerUsername={trackOwnerUsername}
        player={player}
        revealPanel={revealPanel({ fill: true, meId: user.id })}
        onExit={onExit}
        chatMessages={chatMessages}
        spectators={spectators}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendChat={onSendChat}
        chatScrollRef={chatScrollRef}
      />
      </>
    )
  }

  return (
    <div
      className="relative min-h-screen"
      style={{ ...theme, background: "var(--bg)", color: "var(--ink)" }}
    >
      {countdown}
      {pauseOverlay}
      {audioBrokenNotice && (
        <div
          className="sticky top-0 z-[59] border-b-2 border-line px-3 py-2 text-center text-xs font-semibold sm:text-sm"
          style={{ background: "#b3543f", color: "#f4ecdb" }}
        >
          Pas de son ? L&apos;extrait semble indisponible. Tente le bouton play, ou passez la manche.
        </div>
      )}
      {hostGone && (
        <div
          className="sticky top-0 z-[60] border-b-2 border-line px-3 py-2 text-center text-xs font-semibold sm:text-sm"
          style={{ background: "#e0a32e", color: "rgb(var(--c-on-accent))" }}
        >
          L&apos;organisateur a quitté. La musique passe sur ton téléphone, monte le son.
        </div>
      )}
      <div className="relative flex min-h-screen flex-col">
        {/* Header - compact */}
        <header className="shrink-0 border-b-2 border-line">
          <div className="mx-auto flex w-full items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 lg:px-12">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-line bg-[var(--surface)] sm:h-10 sm:w-10">
                <Clock className="relative h-4 w-4" style={{ color: timerColor }} />
              </div>
              <div className="min-w-0">
                <p className="hidden text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--muted)] sm:block">Blindz</p>
                <h1 className="truncate font-display text-base font-semibold leading-tight sm:text-lg">
                  {mode === "event" ? "Événement" : mode === "streamer" ? "Streamer" : "Amis"}
                </h1>
              </div>
            </div>

            <motion.div
              className="rounded-full border-[1.5px] border-line bg-[var(--surface)] px-4 py-1.5"
              animate={isPlaying && remaining <= 5 && remaining > 0 ? { x: [0, -2, 2, -2, 2, 0], scale: [1, 1.02, 1] } : { x: 0, scale: 1 }}
              transition={isPlaying && remaining <= 5 && remaining > 0 ? { duration: 0.4, repeat: Infinity, repeatDelay: 0.6 } : { duration: 0.2 }}
            >
              <div className="flex items-center gap-3">
                <span className={`${isLargeUI ? "text-2xl" : "text-base"} font-display font-bold`} style={{ color: timerColor }}>
                  {isPlaying ? `${remaining}s` : isLocked ? "LOCK" : "REVEAL"}
                </span>
                <div className={`hidden sm:block ${isLargeUI ? "h-2 w-40" : "h-1.5 w-28"} rounded-full bg-[rgb(var(--c-line)/.15)]`}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${timerProgress}%`, background: timerColor }}
                  />
                </div>
                <span className="text-xs font-bold text-[var(--muted)]">
                  {state?.currentRound ?? 0}/{state?.totalRounds ?? 0}
                </span>
              </div>
            </motion.div>

            <div className="flex items-center gap-2">
              <SpectatorBadge count={spectators} />
              <div className="hidden items-center gap-1.5 text-xs text-[var(--muted)] md:flex">
                <Users className="h-3.5 w-3.5" />
                <span>{playerCount}</span>
              </div>
              {/* Volume control (hidden for event participants — audio plays on presenter only) */}
              {!isEventParticipant && <div className="flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-line bg-[var(--surface)] px-1.5 py-1.5">
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] transition hover:text-[var(--ink)]"
                  onClick={() => {
                    const next = !muted
                    audioManager.setMuted(next)
                    setMuted(next)
                  }}
                  title={muted ? "Activer le son" : "Couper le son"}
                  aria-label={muted ? "Activer le son" : "Couper le son"}
                >
                  {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : Math.round(volume * 100)}
                  onChange={e => {
                    const v = Number(e.target.value) / 100
                    audioManager.setVolume(v, "multiplayer")
                    setVolume(v)
                    if (v > 0 && muted) {
                      audioManager.setMuted(false)
                      setMuted(false)
                    }
                    if (v === 0 && !muted) {
                      audioManager.setMuted(true)
                      setMuted(true)
                    }
                  }}
                  className="hidden h-1 cursor-pointer appearance-none rounded-full bg-[rgb(var(--c-line)/.25)] accent-[var(--accent)] sm:block sm:w-16 md:w-20"
                  style={{ accentColor: accent }}
                />
              </div>}
              {isHost && onPauseToggle && (
                <button
                  className="flex shrink-0 items-center rounded-full border-[1.5px] border-line bg-[var(--surface)] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)] transition hover:bg-ink-block hover:text-on-ink sm:px-3"
                  onClick={onPauseToggle}
                  title="Pause"
                >
                  <span className="sm:hidden">II</span>
                  <span className="hidden sm:inline">Pause</span>
                </button>
              )}
              {onExit && (
                <button
                  className="flex shrink-0 items-center rounded-full border-[1.5px] border-line bg-[var(--surface)] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)] transition hover:bg-ink-block hover:text-on-ink sm:px-3"
                  onClick={onExit}
                  title="Quitter"
                >
                  <X className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">Quitter</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {shortNotice && (
          <p
            className={`px-5 pt-3 text-center text-xs text-[var(--muted)] transition-opacity duration-500 lg:px-10 ${shortNotice.visible ? "" : "opacity-0"}`}
            role={shortNotice.visible ? "status" : undefined}
            aria-hidden={!shortNotice.visible}
          >
            {shortNotice.text}
          </p>
        )}

        {/* Main content */}
        <div className="mx-auto flex w-full flex-1 flex-col gap-5 px-5 pb-8 pt-5 lg:flex-row lg:items-stretch lg:px-10">
          <main className="flex flex-1 flex-col gap-5">
            <AnimatePresence mode="wait">
              {/* ===== EVENT PRESENTER VIEW (projection-optimized) ===== */}
              {isEventPresenter ? (
                <motion.section
                  key="presenter"
                  className="flex-1"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  {isRevealed && currentTrack ? (
                    /* --- PRESENTER: entre deux manches (T38) --- */
                    revealPanel({ large: true, meId: null })
                  ) : (
                  <div className={`${panelClassName} relative overflow-hidden h-full flex flex-col items-center justify-center min-h-[60vh]`}>
                    {/* --- PRESENTER: GUESSING / LOCKED --- */}
                      <div className="relative flex flex-col items-center gap-8 py-6">
                        <AnalogVinyl size={320} spinning={isPlaying && !manualPlayRequired && needleStage === "down"} accentColor={accent} coverUrl={currentTrack?.albumCover} blurred={!isRevealed} />
                        {manualPlayRequired && isAudioPhase && (
                          <button
                            onClick={handleManualPlay}
                            className="absolute top-[30%] flex h-20 w-20 items-center justify-center rounded-full border-2 border-line bg-paper shadow-[3px_3px_0_rgb(var(--c-shadow))] transition-transform hover:scale-110"
                            title="Lancer la musique"
                          >
                            <Play className="h-10 w-10" style={{ color: accentTexte(accent) }} />
                          </button>
                        )}
                        <div className="text-center">
                          <p className="text-base font-bold uppercase tracking-[0.32em] text-[var(--muted)]">
                            {isPlaying ? "Extrait en cours" : "Réponses verrouillées"}
                          </p>
                          <p className="mt-3 font-display text-6xl font-bold" style={{ color: accentTexte(accent) }}>
                            {displayAnsweredCount} / {playerCount}
                          </p>
                          <p className="mt-2 text-base text-[var(--muted)]">réponses reçues</p>
                        </div>
                        {/* Logo Deezer et usage prive : obligatoires la ou les extraits jouent. */}
                        <DeezerCredit />
                        {/* Player status dots */}
                        <div className="flex flex-wrap justify-center gap-3 max-w-md">
                          {sortedPlayersFixed.map(p => (
                            <div key={p.userId} className="flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-sm"
                              style={{
                                borderColor: p.hasAnswered ? "var(--success)" : "rgb(var(--c-line))",
                                background: p.hasAnswered ? "rgba(125,148,113,0.18)" : "var(--surface-strong)",
                              }}>
                              {p.avatar ? (
                                <img src={p.avatar} alt={p.username ?? "Joueur"} className="h-5 w-5 rounded-full border border-line object-cover" />
                              ) : (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-paper text-[9px] font-bold">
                                  {(p.username || "?")[0].toUpperCase()}
                                </span>
                              )}
                              <span className={p.hasAnswered ? "font-bold text-sage-deep-txt" : "text-[var(--muted)]"}>
                                {p.username || `J${p.userId}`}
                              </span>
                              {p.hasAnswered && <Check className="h-3.5 w-3.5 text-sage-deep-txt" />}
                            </div>
                          ))}
                        </div>
                      </div>
                  </div>
                  )}
                </motion.section>
              ) : isRevealed && currentTrack ? (
                /* ===== Entre deux manches (T38) ===== */
                <motion.div key="reveal" className="flex-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {revealPanel({ meId: user.id })}
                </motion.div>
              ) : (
                /* ===== GUESSING / LOCKED VIEW (form integrated) ===== */
                <motion.section
                  key="guessing"
                  className="flex-1"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className={`${panelClassName} relative overflow-hidden h-full`}>
                    <div className="relative flex flex-col gap-5">
                      {/* Vinyl + status row (friends/streamer) */}
                      {!isEventParticipant && (
                        <div className="relative flex items-center gap-4">
                          <motion.div
                            className="shrink-0"
                            animate={isLocked ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                            transition={isLocked ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
                          >
                            <AnalogVinyl
                              size={isLargeUI ? 140 : 100}
                              spinning={isPlaying && !manualPlayRequired && needleStage === "down"}
                              accentColor={accent}
                              coverUrl={currentTrack?.albumCover}
                              blurred={!isRevealed}
                            />
                          </motion.div>
                          {manualPlayRequired && isAudioPhase && (
                            <button
                              onClick={handleManualPlay}
                              className="absolute left-[50px] top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-line bg-paper shadow-[2px_2px_0_rgb(var(--c-shadow))] transition-transform hover:scale-110"
                              title="Lancer la musique"
                            >
                              <Play className="h-6 w-6" style={{ color: accentTexte(accent) }} />
                            </button>
                          )}
                          <div className="flex flex-1 flex-col gap-2">
                            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                              {isAudioPhase && !manualPlayRequired ? (
                                <>
                                  <WaveformBars active={true} />
                                  <span>Extrait en cours</span>
                                </>
                              ) : manualPlayRequired && isAudioPhase ? (
                                <>
                                  <Play className="h-3 w-3" style={{ color: accentTexte(accent) }} />
                                  <span>Cliquer pour lancer</span>
                                </>
                              ) : isLocked ? (
                                <>
                                  <Lock className="h-3 w-3" style={{ color: accentTexte(accent) }} />
                                  <span>Reveal dans {remaining}s</span>
                                </>
                              ) : (
                                <>
                                  <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                                  <span>Reveal</span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-[var(--muted)]">
                              {displayAnsweredCount}/{playerCount} réponses reçues
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Compact status bar for event participants (no audio, no vinyl).
                          Cache sur mobile : le header affiche deja timer + round (doublon). */}
                      {isEventParticipant && (
                        <div className="hidden items-center justify-between rounded-md border-[1.5px] border-line bg-[var(--surface-strong)] px-4 py-3 sm:flex">
                          <div className="flex items-center gap-3">
                            {isPlaying ? (
                              <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: accent }} />
                            ) : isLocked ? (
                              <Lock className="h-3.5 w-3.5" style={{ color: accentTexte(accent) }} />
                            ) : (
                              <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                            )}
                            <div className="text-sm">
                              <span className="font-display font-bold" style={{ color: isPlaying && remaining <= 5 ? "var(--error)" : "var(--ink)" }}>
                                {isPlaying ? `${remaining}s` : isLocked ? "LOCK" : "REVEAL"}
                              </span>
                              <motion.span
                                key={state?.currentRound ?? 0}
                                initial={{ scale: 1.35, color: accentTexte(accent) }}
                                animate={{ scale: 1, color: "var(--muted)" }}
                                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                                className="ml-2 inline-block text-[var(--muted)]"
                              >
                                Round {state?.currentRound ?? 0}/{state?.totalRounds ?? 0}
                              </motion.span>
                            </div>
                          </div>
                          <span className="text-xs text-[var(--muted)]">
                            {displayAnsweredCount}/{playerCount} réponses
                          </span>
                        </div>
                      )}

                      {/* Answer form */}
                      <div className="relative flex flex-col gap-4">

                        {/* Locked overlay */}
                        {isLocked && (
                          <motion.div
                            className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md"
                            style={{ background: "rgb(var(--c-paper) / 0.92)" }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <motion.div
                              className="flex flex-col items-center gap-3"
                              initial={{ scale: 0.9 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-line" style={{ background: `${accent}22` }}>
                                <Lock className="h-6 w-6" style={{ color: accentTexte(accent) }} />
                              </div>
                              <p className="font-display text-lg font-semibold">C'est noté</p>
                              <p className="text-sm text-[var(--muted)]">Reveal dans {remaining}s</p>
                              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                                {activePlayers.filter(p => !p.hasAnswered).length > 0 && (
                                  <p className="text-xs text-[var(--muted)]">
                                    En attente de : {activePlayers.filter(p => !p.hasAnswered).map(p => p.username || `Joueur ${p.userId}`).join(", ")}
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          </motion.div>
                        )}

                        {/* Form content */}
                        <form
                          className="flex flex-col gap-4"
                          onSubmit={e => {
                            e.preventDefault()
                            handleSubmit()
                          }}
                        >
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-2 text-xs text-[var(--muted)]">
                              <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Titre</span>
                              <div className="relative">
                                <input
                                  value={guessTitle}
                                  onChange={e => setGuessTitle(e.target.value)}
                                  disabled={localHasAnswered || disabled}
                                  {...ANSWER_INPUT_PROPS}
                                  aria-label="Titre du morceau"
                                  className={`w-full rounded-md border-[1.5px] bg-paper px-3 py-3 pr-9 font-display text-lg text-[var(--ink)] outline-none transition-colors placeholder:italic placeholder:text-pale focus:border-[var(--accent)] ${
                                    guessTitle.trim() ? "border-sage" : "border-[rgb(var(--c-line)/.45)]"
                                  }`}
                                  placeholder="Le morceau qui tourne…"
                                />
                                {guessTitle.trim() && (
                                  <Check
                                    className="animate-in zoom-in duration-300 pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                                    style={{ color: SAGE }}
                                  />
                                )}
                              </div>
                            </label>
                            <label className="space-y-2 text-xs text-[var(--muted)]">
                              <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Artiste</span>
                              <div className="relative">
                                <input
                                  value={guessArtist}
                                  onChange={e => setGuessArtist(e.target.value)}
                                  disabled={localHasAnswered || disabled}
                                  {...ANSWER_INPUT_PROPS}
                                  aria-label="Artiste"
                                  className={`w-full rounded-md border-[1.5px] bg-paper px-3 py-3 pr-9 font-display text-lg text-[var(--ink)] outline-none transition-colors placeholder:italic placeholder:text-pale focus:border-[var(--accent)] ${
                                    guessArtist.trim() ? "border-sage" : "border-[rgb(var(--c-line)/.45)]"
                                  }`}
                                  placeholder="Qui chante ?"
                                />
                                {guessArtist.trim() && (
                                  <Check
                                    className="animate-in zoom-in duration-300 pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                                    style={{ color: SAGE }}
                                  />
                                )}
                              </div>
                            </label>
                          </div>

                          {askOwner && (
                          <div className="space-y-2 text-xs text-[var(--muted)]">
                            <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Qui a ajouté ce titre ?</span>
                            <div className="flex flex-wrap gap-2">
                              {pickerPlayers.map(p => (
                                <button
                                  key={p.userId}
                                  type="button"
                                  disabled={localHasAnswered || disabled}
                                  onClick={() => setSourceGuess(sourceGuess === p.userId ? null : p.userId)}
                                  className={`flex items-center gap-2 rounded-full border-2 border-line px-3.5 py-2.5 text-xs font-bold transition-all duration-150 hover:-translate-y-0.5 active:scale-90 disabled:opacity-60 ${
                                    sourceGuess === p.userId ? "-translate-y-0.5 scale-105" : ""
                                  }`}
                                  style={{
                                    color: sourceGuess === p.userId ? "rgb(var(--c-on-ink))" : "var(--ink)",
                                    background: sourceGuess === p.userId ? accent : "rgb(var(--c-paper))",
                                    boxShadow: sourceGuess === p.userId ? "4px 4px 0 rgb(var(--c-shadow))" : "none",
                                  }}
                                >
                                  {p.avatar ? (
                                    <img
                                      src={p.avatar}
                                      alt={p.username ?? "Joueur"}
                                      className="h-5 w-5 rounded-full border border-line object-cover"
                                    />
                                  ) : (
                                    <span
                                      className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                                      style={{
                                        background: sourceGuess === p.userId ? "rgb(var(--c-on-ink))" : "var(--surface)",
                                        color: sourceGuess === p.userId ? accent : "var(--muted)",
                                      }}
                                    >
                                      {(p.username || "?")[0].toUpperCase()}
                                    </span>
                                  )}
                                  {p.username || `Joueur ${p.userId}`}
                                </button>
                              ))}
                            </div>
                          </div>
                          )}

                          {state?.singleContributor && (
                            <p className="text-[11px] italic leading-snug text-[var(--muted)]">
                              Une seule playlist en jeu, pas de point « qui a ajouté » cette partie.
                            </p>
                          )}

                          <motion.button
                            type="submit"
                            disabled={localHasAnswered || disabled}
                            className="relative w-full rounded-md py-3 text-base font-bold transition disabled:opacity-60"
                            style={{
                              background: localHasAnswered ? "var(--surface-strong)" : "rgb(var(--c-ink-block))",
                              color: localHasAnswered ? "var(--muted)" : "rgb(var(--c-on-ink))",
                              border: "2px solid rgb(var(--c-line))",
                              boxShadow: hasInput && !localHasAnswered ? "4px 4px 0 rgb(var(--c-shadow) / .3)" : "none",
                            }}
                            whileTap={!localHasAnswered ? { scale: 0.93 } : undefined}
                            animate={localHasAnswered ? { scale: [1.06, 1], transition: { duration: 0.3 } } : undefined}
                          >
                            {localHasAnswered ? (
                              <span className="flex items-center justify-center gap-2">
                                <Check className="h-4 w-4" style={{ color: accentTexte(accent) }} />
                                Notée
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-2">
                                <Check className="h-4 w-4" />
                                Valider
                              </span>
                            )}
                          </motion.button>
                          {!localHasAnswered && (
                            <button
                              type="button"
                              onClick={handlePass}
                              className="mt-1.5 w-full py-1.5 text-center text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--muted)] underline decoration-dotted underline-offset-4"
                            >
                              Je sais pas, passer
                            </button>
                          )}
                        </form>
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

          </main>

          {/* Sidebar with scoreboard + activity (hidden for event presenter only) */}
          {!isEventPresenter && (
            <motion.aside
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="flex w-full flex-col overflow-hidden rounded-md border-2 border-line bg-[var(--surface)] shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] lg:sticky lg:top-4 lg:h-[calc(100vh-100px)] lg:w-72"
            >
              {/* Scoreboard */}
              <div className="border-b-2 border-line px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: accentTexte(accent) }}>Face B · Classement</p>
                <div className="mt-2 space-y-1">
                  {sortedPlayersFixed.map((p, idx) => (
                    <div
                      key={p.userId}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${idx === 0 ? "border-[1.5px] border-[rgb(var(--c-line)/.35)]" : ""}`}
                      style={idx === 0 ? { background: `${accent}1c` } : undefined}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line font-display text-[11px] font-bold ${idx === 0 ? "text-ink" : "text-[var(--muted)]"}`}
                        style={idx === 0 ? { background: accent } : undefined}
                      >
                        {idx + 1}
                      </span>
                      <span
                        className="min-w-0 truncate font-display text-base font-semibold"
                        style={{ color: p.userId === user.id ? accent : "var(--ink)" }}
                      >
                        {p.username || `J${p.userId}`}
                      </span>
                      {/* Status indicator */}
                      {isPlaying && p.hasAnswered && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      )}
                      {isRevealed && p.isReady && (
                        <Check className="h-3 w-3 shrink-0" style={{ color: "var(--success)" }} />
                      )}
                      <span className="flex-1 border-b-2 border-dotted border-[rgb(var(--c-line)/.35)]" />
                      <motion.span
                        key={`${p.userId}-${p.score}`}
                        initial={{ scale: 1.45 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                        className="font-display text-lg font-bold text-[var(--ink)]"
                      >
                        {p.score}
                      </motion.span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Round status */}
              <div className="border-b-2 border-line px-4 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Round {state?.currentRound ?? 0}/{state?.totalRounds ?? 0}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {isPlaying ? `${answeredCount}/${playerCount} ont répondu` :
                   isLocked ? `${answeredCount}/${playerCount} ont répondu · ${remaining}s` :
                   isRevealed ? "Entre deux manches" : ""}
                </p>
              </div>

              {/* Chat */}
              <div className="flex items-center justify-between border-b-2 border-line px-4 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">Chat</p>
              </div>
              <div ref={chatScrollRef} className="flex-1 space-y-1 overflow-auto px-3 py-2 text-xs">
                {chatMessages.length === 0 && (
                  <div className="px-1 py-1 text-[11px] text-[var(--muted)] italic">
                    Aucun message
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className="px-1 py-0.5 text-[11px]">
                    <span className="font-semibold" style={{ color: msg.userId === user.id ? accent : "var(--muted)" }}>
                      {msg.username}
                    </span>{" "}
                    <span className="text-[var(--ink)]">{msg.message}</span>
                  </div>
                ))}
              </div>
              {onSendChat && (
                <form
                  className="border-t-2 border-line px-3 py-2"
                  onSubmit={e => {
                    e.preventDefault()
                    const text = chatInput.trim()
                    if (!text) return
                    onSendChat(text)
                    setChatInput("")
                  }}
                >
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Message..."
                    maxLength={200}
                    className="w-full rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-[var(--surface-strong)] px-2.5 py-1.5 text-xs text-[var(--ink)] outline-none transition placeholder:italic placeholder:text-pale focus:border-line"
                  />
                </form>
              )}
            </motion.aside>
          )}
        </div>
      </div>
    </div>
  )
}
