"use client"

/**
 * Overlay OBS du mode streamer (T5), page /streamer/overlay/?salle=…&jeton=…
 *
 * Source navigateur d'OBS en 1920×1080, fond transparent. Elle montre le code
 * et le QR pour rejoindre, le minuteur, le nombre de reponses, le top 5, le
 * reveal (pochette, titre, artiste) et le podium final. Elle joue l'extrait.
 * Jamais de paroles, jamais le titre avant le reveal (le serveur ne l'envoie pas).
 */
import { useEffect, useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { Volume2 } from "lucide-react"
import { useNow } from "@/components/game/SpectatorStage"
import { Leaderboard, RevealCard, SAGE, StreamerPodium, TimerBar } from "@/components/streamer/StreamerBits"
import {
  LIVE_ERROR_TEXT,
  REVEALED_PHASES,
  answersOf,
  elapsedRatio,
  liveJoinUrl,
  liveLabel,
  secondsLeft,
  type OverlayView,
} from "@/lib/streamerLive"
import { useOverlayAudio, useOverlaySocket } from "./useOverlay"

const STAGE_W = 1920
const STAGE_H = 1080
const CARD = "rounded-lg border-[3px] border-[#2e2014] bg-[#f4ecdb] shadow-[6px_6px_0_rgba(46,32,20,.35)]"

/** La scene garde ses proportions 1920×1080 quelle que soit la taille de la source. */
function useStageScale(): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [])
  return scale
}

function JoinCard({ code, large = false, chat = false }: { code: string; large?: boolean; chat?: boolean }) {
  return (
    <div className={`${CARD} flex items-center gap-6 p-6`} data-testid="overlay-join">
      <div className="rounded-md border-[3px] border-[#2e2014] bg-white p-2">
        <QRCodeSVG value={liveJoinUrl(code)} size={large ? 220 : 150} bgColor="#ffffff" fgColor="#2e2014" level="M" />
      </div>
      <div>
        <p className="m-0 text-xl font-bold uppercase tracking-[0.2em] text-[#6b573f]">Joue sur</p>
        <p className={`m-0 font-display font-semibold ${large ? "text-5xl" : "text-4xl"}`}>{liveLabel()}</p>
        <p className="m-0 mt-3 text-xl font-bold uppercase tracking-[0.2em] text-[#6b573f]">Code</p>
        <p className={`m-0 font-display font-bold tracking-[0.18em] ${large ? "text-8xl" : "text-6xl"}`}>{code}</p>
        {chat ? <p className="m-0 mt-2 text-2xl" data-testid="overlay-chat-hint">ou dans le chat : <b>!b titre - artiste</b></p> : null}
      </div>
    </div>
  )
}

function Corner({ children, className }: { children: ReactNode; className: string }) {
  return <div className={`absolute ${className}`}>{children}</div>
}

function GuessingPanel({ view, now }: { view: OverlayView; now: number }) {
  const game = view.game
  if (!game) return null
  const streamerTurn = game.phase === "GUESSING_STREAMER" || game.phase === "REVEAL_PARTIAL"
  return (
    <div className={`${CARD} w-[640px] space-y-4 p-6`} data-testid="overlay-round">
      <p className="m-0 text-xl font-bold uppercase tracking-[0.2em] text-[#6b573f]">
        Manche {game.currentRound} / {game.totalRounds}
      </p>
      {game.phase === "STARTING_ROUND" ? (
        <p className="m-0 font-display text-5xl font-semibold">Prêts ?</p>
      ) : (
        <>
          <p className="m-0 font-display text-4xl font-semibold">{streamerTurn ? "Au tour du streamer" : "Qui reconnaît ce morceau ?"}</p>
          <TimerBar size="lg" seconds={secondsLeft(game.timing, now, view.clockOffset)} ratio={elapsedRatio(game.timing, now, view.clockOffset)} />
          {streamerTurn && game.chatSnapshot ? (
            <p className="m-0 text-2xl">Le chat a trouvé à <b>{game.chatSnapshot.percentCorrect} %</b></p>
          ) : (
            <p className="m-0 text-2xl" data-testid="overlay-answers"><b className="tabular-nums">{answersOf(view)}</b> réponse{answersOf(view) > 1 ? "s" : ""}</p>
          )}
        </>
      )}
    </div>
  )
}

function Stage({ view, now }: { view: OverlayView; now: number }) {
  const game = view.game
  const code = view.roomCode ?? ""
  if (!game || game.phase === "LOBBY") {
    return (
      <Corner className="bottom-12 left-12">
        <div className="space-y-4">
          <JoinCard code={code} large chat={Boolean(game?.twitchChannel)} />
          <p className={`${CARD} m-0 inline-block px-5 py-3 text-2xl font-semibold`}>{view.viewerCount} joueur{view.viewerCount > 1 ? "s" : ""} prêt{view.viewerCount > 1 ? "s" : ""}</p>
        </div>
      </Corner>
    )
  }
  if (game.phase === "GAME_OVER") {
    return (
      <div className="absolute inset-0 grid place-items-center">
        <div className={`${CARD} w-[1100px] space-y-8 p-10`} data-testid="overlay-podium">
          <p className="m-0 text-center font-display text-6xl font-semibold">Le podium du chat</p>
          <StreamerPodium entries={game.leaderboard ?? []} size="lg" />
        </div>
      </div>
    )
  }
  const revealed = REVEALED_PHASES.has(game.phase)
  return (
    <>
      <Corner className="right-12 top-12">
        {revealed ? (
          <div className={`${CARD} w-[640px] p-6`}>
            <p className="m-0 mb-4 text-xl font-bold uppercase tracking-[0.2em] text-[#6b573f]">Manche {game.currentRound} / {game.totalRounds}</p>
            <RevealCard track={game.currentTrack} size="lg" />
          </div>
        ) : (
          <GuessingPanel view={view} now={now} />
        )}
      </Corner>
      <Corner className="right-12 top-[420px]">
        <div className={`${CARD} w-[640px] p-6`}>
          <p className="m-0 mb-3 text-xl font-bold uppercase tracking-[0.2em] text-[#6b573f]">Face B · Classement</p>
          <Leaderboard entries={game.leaderboard ?? []} size="lg" emptyLabel="Le classement arrive au premier reveal." />
        </div>
      </Corner>
      <Corner className="bottom-12 left-12">
        <JoinCard code={code} chat={Boolean(game.twitchChannel)} />
      </Corner>
    </>
  )
}

export function OverlayClient() {
  const params = useSearchParams()
  const view = useOverlaySocket(params.get("salle"), params.get("jeton"))
  const scale = useStageScale()
  const ticking = Boolean(view.game?.timing?.endAt)
  const now = useNow(ticking)
  const { blocked, unlock } = useOverlayAudio(view.game)

  return (
    <div className="fixed inset-0 overflow-hidden" data-testid="overlay-view">
      <div
        className="absolute left-0 top-0 origin-top-left text-[#2e2014]"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        {view.status === "error" && view.error ? (
          <Corner className="left-12 top-12">
            <p className={`${CARD} m-0 max-w-[900px] p-6 text-3xl font-semibold`} role="alert">{LIVE_ERROR_TEXT[view.error]}</p>
          </Corner>
        ) : view.status === "live" ? (
          <Stage view={view} now={now} />
        ) : null}
        {blocked ? (
          <Corner className="left-12 top-12">
            <button type="button" onClick={unlock} className={`${CARD} flex items-center gap-3 px-6 py-4 text-2xl font-bold`} style={{ background: SAGE }}>
              <Volume2 aria-hidden className="h-7 w-7" /> Activer le son
            </button>
          </Corner>
        ) : null}
      </div>
    </div>
  )
}
