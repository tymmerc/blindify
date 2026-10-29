"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { io, type Socket } from "socket.io-client"
import { Eye, Loader2, Volume2, VolumeX } from "lucide-react"
import { socketEndpoint } from "@/lib/socket"
import { publicPath } from "@/lib/publicPath"
import { Label, Panel } from "@/app/multiplayer/lobbyKit"
import { VinylDisc } from "@/components/game/VinylDisc"
import {
  SPECTATOR_ERROR_TEXT,
  initialSpectatorView,
  rankedPlayers,
  secondsLeft,
  spectatorErrorCode,
  spectatorReducer,
  type SpectatorEvent,
  type SpectatorView,
} from "@/lib/spectatorState"
import type { MultiplayerGameState, MultiplayerPlayerState } from "@/lib/types"

const TERRA = "#c65133"
const GOLD = "#e0a32e"
const SAGE = "#7d9471"
const MODE_LABEL: Record<string, string> = { friends: "À distance", event: "Autour d'une table", streamer: "Streamer" }
const VERDICT: Record<string, { text: string; color: string }> = {
  correct: { text: "trouvé", color: SAGE },
  close: { text: "presque", color: GOLD },
  wrong: { text: "raté", color: "#9c2f1d" },
}

/** Les trames que la page ecoute. Aucune n'est emise vers le serveur, sauf la resynchro. */
const FORWARDED = ["game:state", "game:round:start", "game:round:reveal", "game:over", "room:presence"] as const

function useSpectatorSocket(salle: string | null, jeton: string | null): SpectatorView {
  const [view, dispatch] = useReducer(spectatorReducer, initialSpectatorView)

  useEffect(() => {
    if (!salle || !jeton) {
      dispatch({ type: "error", code: "lien_incomplet" })
      return
    }
    const { origin, path } = socketEndpoint()
    // Pas de cookie : le spectateur n'a pas de compte, seul le jeton du lien compte.
    const socket: Socket = io(origin, {
      path,
      withCredentials: false,
      transports: ["polling", "websocket"],
      auth: { spectateur: { salle, jeton } },
    })
    socket.on("spectator:init", payload => dispatch({ type: "init", payload, now: Date.now() }))
    for (const event of FORWARDED) {
      socket.on(event, (payload: unknown) => dispatch({ type: event, payload } as SpectatorEvent))
    }
    socket.on("spectator:expired", () => {
      dispatch({ type: "error", code: "spectateur_expire" })
      socket.close()
    })
    socket.on("connect_error", err => {
      const code = spectatorErrorCode(err?.message)
      // Refus du serveur : definitif. Reseau : socket.io reessaie seul.
      if (code !== "reseau" || !socket.active) dispatch({ type: "error", code })
    })
    // Retour au premier plan : relire l'etat (minuteries du navigateur ralenties en fond).
    const onVisible = () => {
      if (document.visibilityState === "visible" && socket.connected) socket.emit("spectator:sync")
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      socket.close()
    }
  }, [salle, jeton])

  return view
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [active])
  return now
}

/** Son optionnel : le meme extrait que les joueurs, coupe par defaut (lecture auto bloquee). */
function usePreview(game: MultiplayerGameState | null, enabled: boolean): void {
  const audio = useRef<HTMLAudioElement | null>(null)
  const url = game && (game.phase === "GUESSING" || game.phase === "REVEAL") ? game.currentTrack?.previewUrl ?? null : null
  const round = game?.currentRound ?? 0
  useEffect(() => {
    if (!audio.current) audio.current = new Audio()
    const el = audio.current
    if (!enabled || !url) {
      el.pause()
      return
    }
    if (el.src !== url) el.src = url
    void el.play().catch(() => {})
    return () => el.pause()
  }, [url, round, enabled])
}

function name(p: { username: string | null } | undefined): string {
  return p?.username?.trim() || "Joueur"
}

function Scoreboard({ players, phase }: { players: MultiplayerPlayerState[]; phase: MultiplayerGameState["phase"] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {players.map((p, i) => {
        const verdict = phase !== "GUESSING" && p.lastVerdict ? VERDICT[p.lastVerdict] : null
        return (
          <li key={p.userId} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 font-display font-semibold text-[#8a7558]">{i + 1}</span>
            <span className={`truncate font-semibold ${p.disconnected ? "text-[#8a7558] line-through" : "text-[#2e2014]"}`}>{name(p)}</span>
            <span aria-hidden className="mx-1 min-w-4 flex-1 border-b-2 border-dotted border-[#2e2014]/30" />
            {phase === "GUESSING" ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8a7558]">{p.hasAnswered ? "a répondu" : "cherche…"}</span>
            ) : verdict ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: verdict.color }}>
                {verdict.text}
                {p.lastGained ? ` +${p.lastGained}` : ""}
              </span>
            ) : null}
            <span className="w-14 shrink-0 text-right font-display font-semibold tabular-nums text-[#2e2014]">{p.score ?? 0}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Podium({ players }: { players: MultiplayerPlayerState[] }) {
  const top = players.slice(0, 3)
  const colors = [GOLD, "#a8b8c8", TERRA]
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {[1, 0, 2].map(rank => {
        const p = top[rank]
        if (!p) return <div key={rank} />
        return (
          <div key={p.userId} className="flex flex-col items-center gap-2 text-center">
            <span className="max-w-full truncate font-display text-base font-semibold">{name(p)}</span>
            <div
              className="flex w-full items-start justify-center rounded-t-md border-2 border-b-0 border-[#2e2014] pt-2 font-display text-2xl font-bold"
              style={{ height: rank === 0 ? 112 : rank === 1 ? 84 : 64, background: colors[rank] }}
            >
              {rank + 1}
            </div>
            <span className="text-xs font-bold tabular-nums text-[#6b573f]">{p.score ?? 0} pts</span>
          </div>
        )
      })}
    </div>
  )
}

function Stage({ view, now }: { view: SpectatorView; now: number }) {
  const game = view.game
  if (!game || game.phase === "LOBBY") {
    return (
      <Panel label="Salle d'attente" dot={TERRA}>
        <p className="m-0 mb-4 text-sm text-[#6b573f]">La partie n'a pas encore commencé. Elle s'affichera ici dès le lancement.</p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {view.members.map(m => (
            <li key={m.userId} className="flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#efe5d0] px-3 py-1 text-sm font-semibold">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: m.status === "active" ? SAGE : m.status === "away" ? GOLD : "#8a7558" }} />
              {name(m)}
            </li>
          ))}
          {view.members.length === 0 ? <li className="text-sm text-[#8a7558]">Personne pour l'instant.</li> : null}
        </ul>
      </Panel>
    )
  }

  const ranked = rankedPlayers(game)
  if (game.phase === "FINISHED") {
    return (
      <div className="flex flex-col gap-5">
        <Panel label="Podium" dot={GOLD}>
          <Podium players={ranked} />
        </Panel>
        <Panel label="Face B · Classement final" dot={TERRA}>
          <Scoreboard players={ranked} phase={game.phase} />
        </Panel>
      </div>
    )
  }

  const left = secondsLeft(game, now, view.clockOffset)
  const revealed = game.phase === "REVEAL"
  const track = game.currentTrack
  const answered = ranked.filter(p => p.hasAnswered && !p.disconnected).length
  const present = ranked.filter(p => !p.disconnected).length
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className="flex flex-col items-center gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <div className="flex w-full items-center justify-between gap-3">
          <Label dot={revealed ? SAGE : TERRA}>Manche {game.currentRound} / {game.totalRounds}</Label>
          <span className="font-display text-2xl font-bold tabular-nums" style={{ color: left !== null && left <= 5 ? TERRA : "#2e2014" }}>
            {game.paused ? "Pause" : revealed ? "Révélation" : left !== null ? `${left} s` : ""}
          </span>
        </div>
        <VinylDisc size={220} spinning={!revealed && !game.paused} coverUrl={revealed ? track?.albumCover ?? null : null} />
        {revealed && track?.title ? (
          <div className="text-center">
            <p className="m-0 font-display text-2xl font-semibold">{track.title}</p>
            <p className="m-0 mt-1 text-sm font-semibold text-[#6b573f]">{track.artist}</p>
          </div>
        ) : (
          <p className="m-0 text-sm font-semibold text-[#6b573f]">
            {answered} / {present} ont répondu
          </p>
        )}
      </section>
      <Panel label="Face B · Classement" dot={TERRA}>
        <Scoreboard players={ranked} phase={game.phase} />
      </Panel>
    </div>
  )
}

export function SpectatorClient() {
  const params = useSearchParams()
  const salle = params.get("salle")
  const jeton = params.get("jeton")
  const view = useSpectatorSocket(salle, jeton)
  const [sound, setSound] = useState(false)
  const now = useNow(view.status === "live" && view.game?.phase === "GUESSING")
  usePreview(view.game, sound && view.status === "live")

  const mode = view.discord ? "Discord" : MODE_LABEL[view.mode ?? ""] ?? ""
  const until = view.expiresAt
    ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(view.expiresAt))
    : null

  return (
    <main className="min-h-screen bg-[#f4ecdb] text-[#2e2014]" data-testid="spectator-view">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#2e2014] pb-3 sm:pb-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicPath("/logo-mark.png")} alt="blindz.app" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" />
            <div className="min-w-0">
              <Label dot={SAGE} className="text-[10px] sm:text-[11px]">
                <Eye aria-hidden className="h-3.5 w-3.5" /> Mode spectateur
              </Label>
              <h1 className="m-0 mt-0.5 truncate font-display text-xl font-semibold sm:text-2xl">
                {view.roomCode ? `Salle ${view.roomCode}` : "Blindz"}
                {mode ? <span className="font-normal italic text-[#6b573f]"> · {mode}</span> : null}
              </h1>
            </div>
          </div>
          {view.status === "live" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSound(s => !s)}
                className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
                aria-pressed={sound}
              >
                {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {sound ? "Son activé" : "Activer le son"}
              </button>
            </div>
          ) : null}
        </header>

        {view.status === "connecting" ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#c65133]" aria-label="Connexion" />
          </div>
        ) : view.status === "error" && view.error ? (
          <div className="grid flex-1 place-items-center">
            <div className="max-w-sm space-y-2 text-center" role="alert">
              <p className="m-0 font-display text-xl font-semibold">{SPECTATOR_ERROR_TEXT[view.error].title}</p>
              <p className="m-0 text-sm text-[#6b573f]">{SPECTATOR_ERROR_TEXT[view.error].body}</p>
            </div>
          </div>
        ) : (
          <>
            <Stage view={view} now={now} />
            <p className="m-0 text-center text-xs text-[#8a7558]">
              Lecture seule : tu ne joues pas et rien n'est enregistré. Les joueurs voient « 👀 1 spectateur ».
              {until ? ` Lien valable jusqu'à ${until}.` : ""}
            </p>
          </>
        )}
      </div>
    </main>
  )
}
