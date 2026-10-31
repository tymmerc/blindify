"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { io, type Socket } from "socket.io-client"
import { Eye, Loader2, Volume2, VolumeX } from "lucide-react"
import { socketEndpoint } from "@/lib/socket"
import { publicPath } from "@/lib/publicPath"
import { Label } from "@/app/multiplayer/lobbyKit"
import { SpectatorStage, useNow } from "@/components/game/SpectatorStage"
import {
  SPECTATOR_ERROR_TEXT,
  initialSpectatorView,
  spectatorErrorCode,
  spectatorReducer,
  type SpectatorEvent,
  type SpectatorView,
} from "@/lib/spectatorState"
import type { MultiplayerGameState } from "@/lib/types"

const SAGE = "#7d9471"
const MODE_LABEL: Record<string, string> = { friends: "À distance", event: "Autour d'une table", streamer: "Streamer" }

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
            <SpectatorStage game={view.game} members={view.members} clockOffset={view.clockOffset} now={now} />
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
