"use client"

// Mode "Un seul tel" : tout le monde pose un doigt sur CE telephone, la musique
// demarre quand toutes les zones sont tenues, et le premier qui lache prend le
// tel, se cache, et tape sa reponse. Faux ? La reponse n'est PAS revelee, le tel
// passe au deuxieme qui a lache. Jeu 100% local : pas de room, pas de sockets.

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import type { SoloTrack } from "@/lib/types"
import { audioManager } from "@/lib/audioManager"
import { useWakeLock } from "@/lib/useWakeLock"
import { evaluateGuess, type GuessVerdict } from "@/lib/guessMatch"
import { publicPath } from "@/lib/publicPath"
import { FingerBoard, type BoardPhase } from "./FingerBoard"

const ZONE_COLORS = ["#c65133", "#e0a32e", "#7d9471", "#5b7d99", "#a06592"]
const MAX_PLAYERS = 5 // limite multi-touch des iPhone
const HOLD_MAX_MS = 30_000
const ANSWER_SECONDS = 25
const LIFT_GRACE_MS = 1300 // apres le 1er lacher, on capte encore l'ordre des suivants
const POINTS = { correct: 3, close: 1 } as const

type Stage = "setup" | "loading" | "playing" | "finished"
type RoundPhase = BoardPhase | "grace" | "handoff" | "answering" | "wrong" | "reveal"

type Player = { name: string; color: string; score: number }

function BuzzerContent() {
  const router = useRouter()
  const tapMode = useSearchParams().has("tap")

  const [stage, setStage] = useState<Stage>("setup")
  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("blindz_buzzer_names") ?? "[]") as string[]
      if (Array.isArray(saved) && saved.length >= 2) {
        return saved.slice(0, MAX_PLAYERS).map((name, i) => ({ name, color: ZONE_COLORS[i], score: 0 }))
      }
    } catch { /* premier lancement */ }
    return [
      { name: "", color: ZONE_COLORS[0], score: 0 },
      { name: "", color: ZONE_COLORS[1], score: 0 },
    ]
  })
  const [roundsWanted, setRoundsWanted] = useState(5)
  const [error, setError] = useState<string | null>(null)

  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const sessionIdRef = useRef<number | null>(null)
  const [round, setRound] = useState(0) // index 0-based dans tracks
  const [phase, setPhase] = useState<RoundPhase>("arming")
  const [countdown, setCountdown] = useState<number | null>(null)
  const [liftQueue, setLiftQueue] = useState<number[]>([])
  const [answerer, setAnswerer] = useState<number | null>(null)
  const [eliminated, setEliminated] = useState<Set<number>>(new Set())
  const [lastVerdict, setLastVerdict] = useState<GuessVerdict | null>(null)
  const [roundWinner, setRoundWinner] = useState<number | null>(null)
  const [guessTitle, setGuessTitle] = useState("")
  const [guessArtist, setGuessArtist] = useState("")
  const [answerLeft, setAnswerLeft] = useState(ANSWER_SECONDS)
  const [correctRounds, setCorrectRounds] = useState(0)

  // Temps de musique deja consomme cette manche (le chrono est en pause pendant
  // qu'on repond : la musique continue mais la manche ne s'ecoule pas).
  const heldElapsedRef = useRef(0)
  const holdStartRef = useRef<number | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<RoundPhase>("arming")
  phaseRef.current = phase

  useWakeLock(stage === "playing")

  const track = tracks[round] ?? null

  const stopMusic = useCallback(() => {
    audioManager.stop("buzzer_phase", "buzzer")
  }, [])

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
  }, [])

  const pauseHoldClock = useCallback(() => {
    clearHoldTimer()
    if (holdStartRef.current !== null) {
      heldElapsedRef.current += Date.now() - holdStartRef.current
      holdStartRef.current = null
    }
  }, [clearHoldTimer])

  // Personne n'a trouve (temps ecoule ou tout le monde elimine) -> reveal sans gagnant.
  const revealNoWinner = useCallback(() => {
    pauseHoldClock()
    stopMusic()
    setRoundWinner(null)
    setLastVerdict(null)
    setPhase("reveal")
  }, [pauseHoldClock, stopMusic])

  const startHolding = useCallback(() => {
    if (!track?.audio_url) { revealNoWinner(); return }
    const seekTo = heldElapsedRef.current > 500 ? heldElapsedRef.current / 1000 : 0
    audioManager.play({ src: track.audio_url, loop: true, volume: 1, owner: "buzzer", seekTo }).catch(() => {
      setError("Impossible de lancer l'audio. Touche l'écran et réessaie.")
    })
    holdStartRef.current = Date.now()
    setPhase("holding")
    const remaining = Math.max(1000, HOLD_MAX_MS - heldElapsedRef.current)
    clearHoldTimer()
    holdTimerRef.current = setTimeout(() => {
      if (phaseRef.current === "holding") revealNoWinner()
    }, remaining)
  }, [track, revealNoWinner, clearHoldTimer])

  // Toutes les zones tenues -> 3-2-1 (doigts obligatoires pendant le decompte) -> musique.
  const handleAllHeld = useCallback(() => {
    setPhase("countdown")
    setCountdown(3)
  }, [])

  useEffect(() => {
    if (phase !== "countdown" || countdown === null) return
    if (countdown <= 0) { setCountdown(null); startHolding(); return }
    const t = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 700)
    return () => clearTimeout(t)
  }, [phase, countdown, startHolding])

  const handleBroken = useCallback(() => {
    setCountdown(null)
    setPhase("arming")
  }, [])

  // Un lacher pendant la musique : le premier fige un court instant de grace
  // pour capter l'ordre des suivants (c'est lui qui prend physiquement le tel).
  const handleLift = useCallback((idx: number) => {
    setLiftQueue(prev => (prev.includes(idx) ? prev : [...prev, idx]))
    if (phaseRef.current === "holding") {
      pauseHoldClock()
      setPhase("grace")
      setTimeout(() => {
        if (phaseRef.current === "grace") setPhase("handoff")
      }, LIFT_GRACE_MS)
    }
  }, [pauseHoldClock])

  // Entree en "handoff" : le prochain de la file devient repondeur.
  useEffect(() => {
    if (phase !== "handoff") return
    setLiftQueue(prev => {
      const [next, ...rest] = prev
      if (next === undefined) return prev
      setAnswerer(next)
      return rest
    })
  }, [phase])

  useEffect(() => {
    if (phase !== "answering") return
    setAnswerLeft(ANSWER_SECONDS)
    const id = setInterval(() => {
      setAnswerLeft(left => {
        if (left <= 1) { clearInterval(id); submitRef.current?.(true) }
        return left - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  const submitRef = useRef<((timeout?: boolean) => void) | null>(null)
  submitRef.current = (timeout = false) => {
    if (phaseRef.current !== "answering" || answerer === null || !track) return
    const verdict = timeout ? "wrong" : evaluateGuess(guessTitle, guessArtist, track).verdict
    setGuessTitle("")
    setGuessArtist("")
    if (verdict === "wrong") {
      const nextEliminated = new Set(eliminated).add(answerer)
      setEliminated(nextEliminated)
      setAnswerer(null)
      setLastVerdict("wrong")
      setPhase("wrong")
      return
    }
    // correct ou close : la manche est gagnee
    setPlayers(prev => prev.map((p, i) => (i === answerer ? { ...p, score: p.score + POINTS[verdict] } : p)))
    setCorrectRounds(c => c + 1)
    setRoundWinner(answerer)
    setLastVerdict(verdict)
    setAnswerer(null)
    stopMusic()
    setPhase("reveal")
  }

  // Apres un "faux" : suivant de la file, sinon on repose les doigts, sinon reveal.
  const continueAfterWrong = useCallback(() => {
    if (liftQueue.length > 0) { setPhase("handoff"); return }
    const stillIn = players.some((_, i) => !eliminated.has(i))
    if (!stillIn || heldElapsedRef.current >= HOLD_MAX_MS - 1500) { revealNoWinner(); return }
    stopMusic()
    setPhase("arming")
  }, [liftQueue.length, players, eliminated, revealNoWinner, stopMusic])

  const nextRound = useCallback(() => {
    heldElapsedRef.current = 0
    holdStartRef.current = null
    clearHoldTimer()
    setEliminated(new Set())
    setLiftQueue([])
    setAnswerer(null)
    setRoundWinner(null)
    setLastVerdict(null)
    if (round + 1 >= tracks.length) {
      stopMusic()
      setStage("finished")
      const sid = sessionIdRef.current
      if (sid) {
        api.recordSoloResult({ sessionId: sid, rounds: tracks.length, correct: correctRounds, bestStreak: 0 }).catch(() => {})
      }
      return
    }
    setRound(r => r + 1)
    setPhase("arming")
  }, [round, tracks.length, correctRounds, clearHoldTimer, stopMusic])

  const startGame = useCallback(async () => {
    const names = players.map(p => p.name.trim()).filter(Boolean)
    if (names.length < 2) { setError("Il faut au moins 2 joueurs (avec un pseudo chacun)."); return }
    setError(null)
    setStage("loading")
    try {
      localStorage.setItem("blindz_buzzer_names", JSON.stringify(names))
    } catch { /* stockage indisponible : pas grave */ }
    try {
      audioManager.warmup()
      // Session invitee si besoin : on peut arriver ici sans etre passe par
      // l'accueil. Et sans musique importee, le serveur sert le fonds commun.
      await api.ensureUserSession(players[0]?.name?.trim() || undefined)
      const res = await api.startSoloGame({ count: roundsWanted, source: "library" })
      const playable = res.tracks.filter(t => Boolean(t.audio_url))
      if (playable.length === 0) {
        setError("Aucun extrait jouable. Importe ta musique depuis l'accueil d'abord.")
        setStage("setup")
        return
      }
      sessionIdRef.current = res.session?.id ?? null
      setTracks(playable)
      setPlayers(prev => prev.filter(p => p.name.trim()).map(p => ({ ...p, score: 0 })))
      setRound(0)
      setCorrectRounds(0)
      setEliminated(new Set())
      setLiftQueue([])
      setPhase("arming")
      setStage("playing")
    } catch (err) {
      console.error("buzzer_start_failed", err)
      setError("Impossible de charger la musique. Importe ta musique depuis l'accueil, puis réessaie.")
      setStage("setup")
    }
  }, [players, roundsWanted])

  useEffect(() => () => { audioManager.stop("buzzer_unmount", "buzzer") }, [])

  // ------------------------------------------------------------------ rendu
  const frame = "min-h-dvh bg-[#f4ecdb] text-[#2e2014]"

  if (stage === "setup" || stage === "loading") {
    return (
      <div className={`${frame} flex flex-col px-6 py-8`}>
        <img src={publicPath("/logo-mark.png")} alt="Blindz" className="mb-4 h-10 w-10 object-contain" />
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#5b7d99]">Un seul tel</p>
        <h1 className="font-display text-3xl font-semibold leading-tight">Tous les doigts sur ce téléphone.</h1>
        <p className="mt-1 text-sm text-[#6b573f]">
          La musique démarre quand tout le monde tient sa zone. Le premier qui lâche prend le tel,
          se cache, et répond. Faux ? Le tel passe au suivant, sans révéler la réponse.
        </p>

        <div className="mt-6 space-y-2">
          {players.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-9 w-9 shrink-0 rounded-md border-2 border-[#2e2014]" style={{ background: p.color }} />
              <input
                value={p.name}
                onChange={e => setPlayers(prev => prev.map((q, j) => (j === i ? { ...q, name: e.target.value.slice(0, 16) } : q)))}
                placeholder={`Joueur ${i + 1}`}
                className="w-full rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-3 py-2 text-base outline-none placeholder:text-[#8a7558]"
              />
              {players.length > 2 && (
                <button
                  type="button"
                  aria-label="Retirer ce joueur"
                  onClick={() => setPlayers(prev => prev.filter((_, j) => j !== i).map((q, j) => ({ ...q, color: ZONE_COLORS[j] })))}
                  className="shrink-0 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-3 py-2 text-sm font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {players.length < MAX_PLAYERS && (
            <button
              type="button"
              onClick={() => setPlayers(prev => [...prev, { name: "", color: ZONE_COLORS[prev.length], score: 0 }])}
              className="w-full rounded-md border-2 border-dashed border-[#8a7558] px-3 py-2 text-sm font-semibold text-[#6b573f]"
            >
              + Ajouter un joueur ({players.length}/{MAX_PLAYERS})
            </button>
          )}
          <p className="text-[11px] text-[#8a7558]">5 joueurs max : la plupart des téléphones ne suivent pas plus de 5 doigts.</p>
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">Manches</p>
          <div className="mt-1 flex gap-2">
            {[5, 10, 15].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRoundsWanted(n)}
                className={`rounded-md border-2 border-[#2e2014] px-4 py-2 font-display text-base font-bold ${roundsWanted === n ? "bg-[#2e2014] text-[#f4ecdb]" : "bg-[#ece1c8]"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 rounded-md border-2 border-[#b3261e] bg-[#b3261e]/10 px-3 py-2 text-sm font-semibold text-[#7a1712]">{error}</p>}

        <div className="mt-auto flex flex-col gap-2 pt-6">
          <button
            type="button"
            onClick={startGame}
            disabled={stage === "loading"}
            className="w-full rounded-md border-2 border-[#2e2014] bg-[#5b7d99] px-5 py-4 font-display text-lg font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:opacity-50"
          >
            {stage === "loading" ? "Chargement de ta musique…" : "Lancer la partie"}
          </button>
          <button type="button" onClick={() => router.push("/modes")} className="text-sm font-semibold text-[#6b573f] underline">
            Retour aux modes
          </button>
        </div>
      </div>
    )
  }

  if (stage === "finished") {
    const ranked = [...players].sort((a, b) => b.score - a.score)
    return (
      <div className={`${frame} flex flex-col items-center px-6 py-10`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#5b7d99]">Fin de la face</p>
        <h1 className="mt-1 font-display text-4xl font-bold">{ranked[0]?.score ? ranked[0].name : "Personne n'a marqué…"}</h1>
        <div className="mt-6 w-full max-w-sm space-y-2">
          {ranked.map((p, i) => (
            <div key={p.name} className="flex items-center justify-between rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-3" style={i === 0 ? { borderColor: "#e0a32e", boxShadow: "4px 4px 0 #e0a32e" } : undefined}>
              <span className="flex items-center gap-3">
                <span className="h-6 w-6 rounded-full border-2 border-[#2e2014]" style={{ background: p.color }} />
                <span className="font-display text-lg font-semibold">{i + 1}. {p.name}</span>
              </span>
              <span className="font-display text-lg font-bold">{p.score} pts</span>
            </div>
          ))}
        </div>
        <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
          <button type="button" onClick={() => { setStage("setup"); setPlayers(prev => prev.map(p => ({ ...p, score: 0 }))) }} className="w-full rounded-md border-2 border-[#2e2014] bg-[#5b7d99] px-5 py-3 font-display text-lg font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014]">
            Rejouer
          </button>
          <button type="button" onClick={() => router.push("/modes")} className="text-center text-sm font-semibold text-[#6b573f] underline">
            Retour aux modes
          </button>
        </div>
      </div>
    )
  }

  // stage === "playing"
  const answeringPlayer = answerer !== null ? players[answerer] : null

  return (
    <div className={`${frame} flex flex-col`}>
      <header className="flex items-center justify-between border-b-2 border-[#2e2014] px-4 py-2">
        <span className="font-display text-sm font-bold">MANCHE {round + 1}/{tracks.length}</span>
        <span className="text-xs font-semibold text-[#6b573f]">
          {players.map(p => `${p.name} ${p.score}`).join(" · ")}
        </span>
      </header>

      <main className="relative flex-1">
        {(phase === "arming" || phase === "countdown" || phase === "holding" || phase === "grace") && (
          <div className="absolute inset-0 flex flex-col">
            <p className="px-4 pt-3 text-center text-sm font-semibold text-[#6b573f]">
              {phase === "holding" || phase === "grace"
                ? "PREMIER QUI LÂCHE RÉPOND !"
                : "Posez tous votre doigt sur votre zone et ne lâchez plus."}
            </p>
            <div className="flex-1">
              <FingerBoard
                players={players.map((p, i) => ({ name: p.name, color: p.color, eliminated: eliminated.has(i) }))}
                phase={phase === "grace" ? "holding" : (phase as BoardPhase)}
                countdown={countdown}
                tapMode={tapMode}
                onAllHeld={handleAllHeld}
                onBroken={handleBroken}
                onLift={handleLift}
              />
            </div>
          </div>
        )}

        {phase === "handoff" && answeringPlayer && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: answeringPlayer.color }}>
            <p className="font-display text-4xl font-bold text-[#f4ecdb]">{answeringPlayer.name} !</p>
            <p className="text-base font-semibold text-[#f4ecdb]">Prends le tel, cache l'écran des autres, et réponds.</p>
            <button
              type="button"
              onClick={() => setPhase("answering")}
              className="rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] px-6 py-4 font-display text-lg font-bold text-[#2e2014] shadow-[4px_4px_0_#2e2014]"
            >
              Je suis caché, je réponds
            </button>
          </div>
        )}

        {phase === "answering" && answeringPlayer && (
          <div className="absolute inset-0 flex flex-col gap-3 px-6 pt-8">
            <div className="flex items-center justify-between">
              <p className="font-display text-xl font-bold">{answeringPlayer.name}, c'est quoi ce son ?</p>
              <span className="rounded-md border-2 border-[#2e2014] px-2 py-1 font-display text-lg font-bold">{answerLeft}s</span>
            </div>
            <input
              autoFocus
              value={guessTitle}
              onChange={e => setGuessTitle(e.target.value)}
              placeholder="Titre du morceau"
              className="w-full rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-3 py-3 text-base outline-none placeholder:text-[#8a7558]"
            />
            <input
              value={guessArtist}
              onChange={e => setGuessArtist(e.target.value)}
              placeholder="Artiste (bonus)"
              className="w-full rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-3 py-3 text-base outline-none placeholder:text-[#8a7558]"
            />
            <button
              type="button"
              onClick={() => submitRef.current?.()}
              className="mt-1 w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-4 font-display text-lg font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014]"
            >
              Valider
            </button>
            <p className="text-center text-xs text-[#8a7558]">Titre trouvé = 3 pts · titre OU artiste = 1 pt · faux = éliminé de la manche</p>
          </div>
        )}

        {phase === "wrong" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#7a1712] px-8 text-center">
            <p className="font-display text-6xl font-bold text-[#f4ecdb]">FAUX.</p>
            <p className="text-base font-semibold text-[#f4ecdb]">
              {liftQueue.length > 0
                ? `Passe le tel à ${players[liftQueue[0]]?.name ?? "au suivant"}, sans rien dire.`
                : players.some((_, i) => !eliminated.has(i))
                  ? "Personne d'autre n'avait lâché. Reposez tous les doigts, la musique reprend."
                  : "Tout le monde s'est planté sur ce son…"}
            </p>
            <button
              type="button"
              onClick={continueAfterWrong}
              className="rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] px-6 py-4 font-display text-lg font-bold text-[#2e2014] shadow-[4px_4px_0_#2e2014]"
            >
              Continuer
            </button>
          </div>
        )}

        {phase === "reveal" && track && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            {track.album_cover && (
              <img src={track.album_cover} alt="" className="h-40 w-40 rounded-md border-2 border-[#2e2014] object-cover shadow-[4px_4px_0_rgba(46,32,20,.18)]" />
            )}
            <p className="font-display text-2xl font-bold leading-tight">{track.title}</p>
            <p className="text-base text-[#6b573f]">{track.artist}</p>
            <p className="mt-2 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-2 font-display text-base font-bold">
              {roundWinner !== null
                ? `${players[roundWinner].name} +${lastVerdict === "correct" ? POINTS.correct : POINTS.close} pt${(lastVerdict === "correct" ? POINTS.correct : POINTS.close) > 1 ? "s" : ""}${lastVerdict === "close" ? " (à moitié !)" : ""}`
                : "Personne n'a trouvé 🙈"}
            </p>
            <button
              type="button"
              onClick={nextRound}
              className="mt-3 rounded-md border-2 border-[#2e2014] bg-[#5b7d99] px-6 py-4 font-display text-lg font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014]"
            >
              {round + 1 >= tracks.length ? "Voir le classement" : "Manche suivante"}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default function BuzzerPage() {
  return (
    <Suspense fallback={null}>
      <BuzzerContent />
    </Suspense>
  )
}
