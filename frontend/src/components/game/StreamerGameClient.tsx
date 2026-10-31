"use client"

/**
 * Ecran du streamer pendant la partie (T5). Il pilote (manche suivante,
 * finir), voit les reponses arriver (combien, et qui, jamais leur texte) et,
 * en duo ou en solo, repond lui-meme apres le chat.
 *
 * Le son passe par l'overlay OBS. Ici il est coupe par defaut : « Ecouter
 * ici » le rallume, pour un streamer qui ne fait pas le monitoring dans OBS.
 * Cet ecran est souvent capture : aucun titre n'y apparait avant le reveal
 * (le serveur ne l'envoie pas).
 */
import { useEffect, useState, type FormEvent } from "react"
import { Flag, LogOut, Play, Radio, RotateCcw, Volume2, VolumeX } from "lucide-react"
import { audioManager, DEFAULT_AUDIO_VOLUME } from "@/lib/audioManager"
import type { StreamerState } from "@/lib/types"
import { shortGameNotice } from "@/lib/roundCount"
import { REVEALED_PHASES, elapsedRatio, secondsLeft } from "@/lib/streamerLive"
import { Label, Panel } from "@/app/multiplayer/lobbyKit"
import { STREAMER_FORMATS } from "@/app/multiplayer/StreamerLobbyView"
import { Leaderboard, RevealCard, SAGE, StreamerPodium, TimerBar } from "@/components/streamer/StreamerBits"
import { DeezerCredit } from "./SourceCredits"

export type StreamerAnswers = { round: number; count: number; names: string[] } | null

type Props = {
  userId: number
  state: StreamerState | null
  serverNow: number
  viewerCount?: number
  answers?: StreamerAnswers
  onHostGuess: (guess: { title: string; artist: string }) => void
  onHostStart: () => void
  onHostEnd: () => void
  onReplay?: () => void
  onExit?: () => void
  accent?: string
}

const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_#2e2014] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#2e2014] disabled:opacity-40"
const INPUT =
  "w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3 text-base outline-none placeholder:text-[#b3a182] focus:border-[#7d9471]"

const AUDIO_PHASES: ReadonlySet<StreamerState["phase"]> = new Set(["GUESSING_CHAT", "REVEAL_PARTIAL", "GUESSING_STREAMER", "REVEAL_FINAL", "ROUND_ENDED"])

/** Ecoute locale, coupee par defaut : le son du stream vient de l'overlay. */
function useLocalListening(state: StreamerState | null, on: boolean): void {
  const url = state && AUDIO_PHASES.has(state.phase) ? state.currentTrack?.previewUrl ?? null : null
  const round = state?.currentRound ?? 0
  useEffect(() => {
    if (!on || !url) {
      audioManager.stop("streamer_local_off", "streamer")
      return
    }
    audioManager.play({ src: url, loop: true, volume: DEFAULT_AUDIO_VOLUME, owner: "streamer" }).catch(() => {
      // Lecture refusee par le navigateur : le bouton reste la pour reessayer.
    })
  }, [on, url, round])
  useEffect(() => () => audioManager.stop("streamer_unmount", "streamer"), [])
}

function HostGuess({ round, onGuess }: { round: number; onGuess: Props["onHostGuess"] }) {
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  useEffect(() => {
    setTitle("")
    setArtist("")
  }, [round])
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (title.trim() || artist.trim()) onGuess({ title: title.trim(), artist: artist.trim() })
  }
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="streamer-guess">
      <p className="m-0 font-display text-2xl font-semibold">À toi !</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre" aria-label="Titre" autoComplete="off" className={INPUT} autoFocus />
        <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artiste" aria-label="Artiste" autoComplete="off" className={INPUT} />
      </div>
      <button type="submit" disabled={!(title.trim() || artist.trim())} className={`${BUTTON} w-full bg-[#c65133] text-[#f4ecdb]`}>Valider</button>
    </form>
  )
}

function Arrivals({ answers, state }: { answers: StreamerAnswers | undefined; state: StreamerState }) {
  const count = Math.max(state.answersCount ?? 0, answers?.round === state.currentRound ? answers.count : 0)
  const names = answers?.round === state.currentRound ? answers.names : []
  return (
    <div className="space-y-2" data-testid="streamer-arrivals">
      <p className="m-0 text-lg"><b className="tabular-nums">{count}</b> réponse{count > 1 ? "s" : ""}</p>
      {names.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {names.map((n, i) => (
            <li key={`${n}-${i}`} className="rounded-full border-[1.5px] border-[#2e2014] bg-[#efe5d0] px-2.5 py-0.5 text-xs font-semibold">{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function PhasePanel({ state, now, answers, onHostGuess }: { state: StreamerState; now: number; answers: StreamerAnswers | undefined; onHostGuess: Props["onHostGuess"] }) {
  const timer = <TimerBar seconds={secondsLeft(state.timing, now)} ratio={elapsedRatio(state.timing, now)} />
  switch (state.phase) {
    case "LOBBY":
      return <p className="m-0 text-base text-[#6b573f]">Tout est prêt. Lance la première manche quand ton chat est là.</p>
    case "STARTING_ROUND":
      return <p className="m-0 font-display text-3xl font-semibold">Manche {state.currentRound}, ça commence…</p>
    case "GUESSING_CHAT":
      return (
        <div className="space-y-4">
          <p className="m-0 font-display text-2xl font-semibold">Ton chat cherche</p>
          {timer}
          <Arrivals answers={answers} state={state} />
          {state.subMode === "duo" ? <p className="m-0 text-sm text-[#6b573f]">Tu réponds juste après eux.</p> : null}
        </div>
      )
    case "REVEAL_PARTIAL":
    case "GUESSING_STREAMER":
      return (
        <div className="space-y-4">
          {state.subMode === "duo" && state.chatSnapshot ? (
            <p className="m-0 text-base">Le chat a trouvé à <b>{state.chatSnapshot.percentCorrect} %</b>. Feras-tu mieux ?</p>
          ) : null}
          {timer}
          <HostGuess round={state.currentRound} onGuess={onHostGuess} />
        </div>
      )
    default:
      return (
        <div className="space-y-4">
          <RevealCard track={state.currentTrack} size="lg" />
          {/* Sans la mention « ecoute privee » : ici, le son part dans un live. */}
          <DeezerCredit notice={false} />
          {state.subMode !== "solo" && state.chatSnapshot ? (
            <p className="m-0 text-base">
              {state.chatSnapshot.correct} sur {state.chatSnapshot.total} ont trouvé ({state.chatSnapshot.percentCorrect} %).
            </p>
          ) : null}
          {state.subMode !== "viewers_only" ? (
            <p className="m-0 font-display text-xl font-semibold">Toi {state.streamerWins} · {state.chatWins} Chat</p>
          ) : null}
        </div>
      )
  }
}

export function StreamerGameClient({ state, serverNow, viewerCount, answers, onHostGuess, onHostStart, onHostEnd, onReplay, onExit }: Props) {
  const [listening, setListening] = useState(false)
  useLocalListening(state, listening)
  if (!state) return null
  const shortNotice = shortGameNotice(state)
  const format = STREAMER_FORMATS.find(f => f.value === state.subMode)
  const canNext = state.phase === "LOBBY" || state.phase === "ROUND_ENDED"
  const over = state.phase === "GAME_OVER"
  const viewers = viewerCount ?? state.viewerCount ?? 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-6 text-[#2e2014] sm:px-6" data-testid="streamer-host">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#2e2014] pb-3">
        <div>
          <Label dot={SAGE}>{over ? "Partie terminée" : `Manche ${Math.max(1, state.currentRound)} / ${state.totalRounds}`} · {format?.title}</Label>
          <p className="m-0 mt-1 flex items-center gap-2 text-sm text-[#6b573f]"><Radio aria-hidden className="h-4 w-4" /> {viewers} viewer{viewers > 1 ? "s" : ""} sur la page</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setListening(l => !l)} aria-pressed={listening} className={`${BUTTON} bg-[#ece1c8]`}>
            {listening ? <Volume2 aria-hidden className="h-4 w-4" /> : <VolumeX aria-hidden className="h-4 w-4" />}
            {listening ? "Son ici : oui" : "Écouter ici"}
          </button>
          {!over ? (
            <button type="button" onClick={onHostEnd} className={`${BUTTON} bg-[#ece1c8]`} data-testid="streamer-end">
              <Flag aria-hidden className="h-4 w-4" /> Finir la partie
            </button>
          ) : null}
          {onExit ? (
            <button type="button" onClick={onExit} className={`${BUTTON} bg-[#ece1c8]`}>
              <LogOut aria-hidden className="h-4 w-4" /> Quitter
            </button>
          ) : null}
        </div>
      </header>
      {shortNotice?.visible ? <p className="m-0 rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-3 py-2 text-sm" role="status">{shortNotice.text}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <Panel label={over ? "Le podium" : "La manche"} dot={SAGE}>
          {over ? (
            <div className="space-y-5">
              <StreamerPodium entries={state.leaderboard ?? []} />
              {state.subMode !== "viewers_only" ? <p className="m-0 text-center font-display text-xl font-semibold">Toi {state.streamerWins} · {state.chatWins} Chat</p> : null}
              {onReplay ? (
                <button type="button" onClick={onReplay} className={`${BUTTON} w-full bg-[#c65133] text-[#f4ecdb]`}>
                  <RotateCcw aria-hidden className="h-4 w-4" /> Rejouer avec le même overlay
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5">
              <PhasePanel state={state} now={serverNow} answers={answers} onHostGuess={onHostGuess} />
              {canNext ? (
                <button type="button" onClick={onHostStart} className={`${BUTTON} w-full bg-[#c65133] py-3.5 text-base text-[#f4ecdb]`} data-testid="streamer-next">
                  <Play aria-hidden className="h-4 w-4" /> {state.phase === "LOBBY" ? "Lancer la première manche" : "Manche suivante"}
                </button>
              ) : null}
            </div>
          )}
        </Panel>
        <Panel label="Face B · Classement" dot={SAGE}>
          <Leaderboard entries={state.leaderboard ?? []} emptyLabel="Le classement arrive au premier reveal." />
        </Panel>
      </div>
      {!REVEALED_PHASES.has(state.phase) && !over ? (
        <p className="m-0 text-center text-xs text-[#8a7558]">Ton écran peut passer sur le stream : aucun titre ne s&apos;affiche ici avant le reveal.</p>
      ) : null}
    </div>
  )
}
