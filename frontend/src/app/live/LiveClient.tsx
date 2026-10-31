"use client"

/**
 * Page des viewers d'un live (T5) : blindz.app/live. Le viewer entre le code
 * affiche sur le stream et un pseudo, sans compte et sans son (la musique
 * passe dans le stream). Une reponse par manche, puis le reveal et sa place.
 * Pensee telephone d'abord.
 */
import { useEffect, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Check, Headphones, Loader2, Radio } from "lucide-react"
import { publicPath } from "@/lib/publicPath"
import { Label } from "@/app/multiplayer/lobbyKit"
import { useNow } from "@/components/game/SpectatorStage"
import { Leaderboard, RevealCard, SAGE, StreamerPodium, TimerBar } from "@/components/streamer/StreamerBits"
import {
  LIVE_CODE_FORMAT,
  LIVE_ERROR_TEXT,
  REVEALED_PHASES,
  VERDICT_TEXT,
  canAnswer,
  cleanLiveCode,
  elapsedRatio,
  secondsLeft,
  type LiveView,
} from "@/lib/streamerLive"
import { PSEUDO_STORAGE, useLiveSocket } from "./useLiveSocket"

const INPUT =
  "w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3 text-base text-[#2e2014] outline-none placeholder:text-[#b3a182] focus:border-[#7d9471]"
const PRIMARY =
  "w-full rounded-md border-2 border-[#2e2014] px-5 py-3.5 font-display text-lg font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition-all duration-150 active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40"

function JoinForm({ view, onJoin }: { view: LiveView; onJoin: (code: string, pseudo: string) => void }) {
  const params = useSearchParams()
  const [code, setCode] = useState(() => cleanLiveCode(params.get("code") ?? ""))
  const [pseudo, setPseudo] = useState("")
  useEffect(() => {
    try {
      setPseudo(p => p || window.localStorage.getItem(PSEUDO_STORAGE) || "")
    } catch {
      // Stockage bloque : le champ reste vide.
    }
  }, [])
  const ready = LIVE_CODE_FORMAT.test(code) && pseudo.trim().length >= 2
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (ready) onJoin(code, pseudo.trim())
  }
  const error = view.error && view.error !== "reseau" ? LIVE_ERROR_TEXT[view.error] : null
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="live-join">
      <div>
        <label htmlFor="live-code" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b573f]">Code du live</label>
        <input
          id="live-code"
          value={code}
          onChange={e => setCode(cleanLiveCode(e.target.value))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="AB12CD"
          className={`${INPUT} font-display text-xl font-bold uppercase tracking-[0.3em]`}
        />
      </div>
      <div>
        <label htmlFor="live-pseudo" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b573f]">Ton pseudo</label>
        <input id="live-pseudo" value={pseudo} onChange={e => setPseudo(e.target.value.slice(0, 20))} autoComplete="nickname" placeholder="Celui du chat, par exemple" className={INPUT} />
      </div>
      {error ? <p role="alert" className="m-0 rounded-md border-2 border-[#9c2f1d] bg-[#efe5d0] px-3 py-2 text-sm font-semibold text-[#9c2f1d]">{error}</p> : null}
      <button type="submit" disabled={!ready || view.status === "connecting"} className={PRIMARY} style={{ background: SAGE }}>
        {view.status === "connecting" ? "Connexion…" : "Rejoindre le live"}
      </button>
      <p className="m-0 flex items-start gap-2 text-sm text-[#6b573f]">
        <Headphones aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        Pas de son ici : la musique passe sur le stream. Garde-le ouvert à côté.
      </p>
    </form>
  )
}

function AnswerForm({ view, onAnswer }: { view: LiveView; onAnswer: (title: string, artist: string) => void }) {
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const round = view.game?.currentRound ?? 0
  useEffect(() => {
    setTitle("")
    setArtist("")
  }, [round])
  const open = canAnswer(view)
  const sent = view.answeredRound >= round
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (open && (title.trim() || artist.trim())) onAnswer(title.trim(), artist.trim())
  }
  if (sent) {
    return (
      <div className="flex items-center gap-3 rounded-md border-2 border-[#2e2014] bg-[#7d9471] px-4 py-3 font-semibold text-[#2e2014]" data-testid="live-sent">
        <Check aria-hidden className="h-5 w-5" /> Réponse envoyée, verdict au reveal.
      </div>
    )
  }
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="live-answer">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre" aria-label="Titre" autoComplete="off" className={INPUT} disabled={!open} />
      <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artiste" aria-label="Artiste" autoComplete="off" className={INPUT} disabled={!open} />
      <button type="submit" disabled={!open || !(title.trim() || artist.trim())} className={PRIMARY} style={{ background: "#c65133" }}>
        {view.sendingRound === round ? "Envoi…" : "Envoyer ma réponse"}
      </button>
      <p className="m-0 text-xs text-[#8a7558]">Une seule réponse par manche. Plus tu réponds vite, plus tu gagnes de points.</p>
      {view.lastAck === "limite" ? <p role="alert" className="m-0 text-sm text-[#9c2f1d]">Doucement, réessaie dans quelques secondes.</p> : null}
    </form>
  )
}

function MyResult({ view }: { view: LiveView }) {
  const r = view.lastResult
  if (!r || r.round !== view.game?.currentRound) {
    return view.answeredRound >= (view.game?.currentRound ?? 1) ? null : <p className="m-0 text-sm text-[#6b573f]">Tu n&apos;as pas répondu à cette manche.</p>
  }
  return (
    <div className="rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3" data-testid="live-result">
      <p className="m-0 font-display text-lg font-semibold">{VERDICT_TEXT[r.verdict]}{r.points ? ` +${r.points}` : ""}</p>
      {r.rank ? <p className="m-0 mt-1 text-sm text-[#6b573f]">Tu es {r.rank === 1 ? "1er" : `${r.rank}e`} sur {r.total}, avec {r.score} points.</p> : null}
    </div>
  )
}

function Stage({ view, now, onAnswer }: { view: LiveView; now: number; onAnswer: (title: string, artist: string) => void }) {
  const game = view.game
  if (!game || game.phase === "LOBBY") {
    return <p className="m-0 text-base text-[#6b573f]">Tu es dans la partie. Le streamer va lancer la première manche, reste là.</p>
  }
  const head = <Label dot={SAGE}>Manche {game.currentRound} / {game.totalRounds}</Label>
  if (game.phase === "GAME_OVER") {
    return (
      <div className="space-y-5">
        <Label dot={SAGE}>Fin de la partie</Label>
        <StreamerPodium entries={game.leaderboard ?? []} />
        {view.me?.rank ? <p className="m-0 text-center font-semibold">Tu finis {view.me.rank === 1 ? "1er" : `${view.me.rank}e`} avec {view.me.score} points.</p> : null}
        <Leaderboard entries={game.leaderboard ?? []} meId={view.me?.id} />
      </div>
    )
  }
  if (REVEALED_PHASES.has(game.phase)) {
    return (
      <div className="space-y-4">
        {head}
        <RevealCard track={game.currentTrack} />
        <MyResult view={view} />
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b573f]">Face B · Classement</p>
          <Leaderboard entries={game.leaderboard ?? []} meId={view.me?.id} />
        </div>
      </div>
    )
  }
  if (game.phase === "STARTING_ROUND") {
    return <div className="space-y-3">{head}<p className="m-0 font-display text-2xl font-semibold">Ça commence, tends l&apos;oreille…</p></div>
  }
  if (game.phase === "GUESSING_CHAT") {
    return (
      <div className="space-y-4">
        {head}
        <TimerBar seconds={secondsLeft(game.timing, now, view.clockOffset)} ratio={elapsedRatio(game.timing, now, view.clockOffset)} />
        <AnswerForm view={view} onAnswer={onAnswer} />
      </div>
    )
  }
  const solo = game.subMode === "solo"
  return (
    <div className="space-y-3">
      {head}
      <p className="m-0 font-display text-2xl font-semibold">{solo ? "Le streamer devine seul cette manche." : "Au tour du streamer de deviner…"}</p>
      {game.chatSnapshot && !solo ? <p className="m-0 text-sm text-[#6b573f]">Le chat a trouvé à {game.chatSnapshot.percentCorrect} %.</p> : null}
    </div>
  )
}

export function LiveClient() {
  const { view, join, answer, leave } = useLiveSocket()
  const ticking = view.status === "live" && view.game?.phase === "GUESSING_CHAT"
  const now = useNow(ticking)
  return (
    <main className="min-h-screen bg-[#f4ecdb] text-[#2e2014]" data-testid="live-view">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-5">
        <header className="flex items-center justify-between gap-3 border-b-2 border-[#2e2014] pb-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicPath("/logo-mark.png")} alt="blindz.app" className="h-10 w-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <Label dot={SAGE} className="text-[10px]"><Radio aria-hidden className="h-3.5 w-3.5" /> En live</Label>
              <h1 className="m-0 mt-0.5 truncate font-display text-xl font-semibold">
                {view.status === "live" && view.me ? view.me.pseudo : "Joue avec le stream"}
              </h1>
            </div>
          </div>
          {view.status === "live" && view.me ? (
            <div className="text-right">
              <p className="m-0 font-display text-2xl font-bold tabular-nums">{view.me.score}</p>
              <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b573f]">points</p>
            </div>
          ) : null}
        </header>

        {view.status === "form" || view.status === "connecting" ? (
          <JoinForm view={view} onJoin={join} />
        ) : view.status === "error" && view.error ? (
          <div className="space-y-4" role="alert">
            <p className="m-0 font-display text-xl font-semibold">{LIVE_ERROR_TEXT[view.error]}</p>
            <button type="button" onClick={leave} className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-2 font-semibold">Changer de code</button>
          </div>
        ) : (
          <>
            {view.error === "reseau" ? (
              <p className="m-0 flex items-center gap-2 text-sm text-[#9c2f1d]"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> {LIVE_ERROR_TEXT.reseau}</p>
            ) : null}
            <Stage view={view} now={now} onAnswer={answer} />
            <p className="m-0 mt-auto pt-6 text-center text-xs text-[#8a7558]">Code {view.roomCode} · le son passe sur le stream, pas ici.</p>
          </>
        )}
      </div>
    </main>
  )
}
