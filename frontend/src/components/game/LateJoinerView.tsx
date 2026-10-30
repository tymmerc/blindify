"use client"

import { useEffect, useRef, useState } from "react"
import { Hourglass, LogOut, Volume2, VolumeX } from "lucide-react"
import { Label, Panel } from "@/app/multiplayer/lobbyKit"
import { LobbyChat } from "@/app/multiplayer/LobbyChat"
import { SpectatorStage } from "@/components/game/SpectatorStage"
import { audioManager } from "@/lib/audioManager"
import { lateJoinBanner } from "@/lib/lateJoin"
import type { MultiplayerGameState } from "@/lib/types"
import type { ChatMessage } from "./MultiplayerGameClient"

const GOLD = "#e0a32e"
/** Proprietaire de la lecture d'attente : ne coupe jamais la musique du jeu. */
const AUDIO_OWNER = "latejoin"

export interface LateJoinerViewProps {
  state: MultiplayerGameState
  currentUserId: number
  /** Heure du serveur (ms), pour le compte a rebours. */
  serverNow: number
  chatMessages: ChatMessage[]
  onSendChat: (message: string) => void
  onExit: () => void
  /** Renvoie room:join : le serveur ne m'a pas (encore) mis en attente. */
  onRejoin: () => void
  accentColor?: string
}

const REJOIN_AFTER_MS = 3_000

/**
 * Filet : si le serveur ne me compte ni parmi les joueurs ni en attente (join
 * arrive pendant le lancement, avant que la partie existe en memoire), je ne
 * serais jamais promu. On redemande l'entree, une fois par manche.
 */
function useRejoinIfUnknown(state: MultiplayerGameState, userId: number, onRejoin: () => void): void {
  const known = (state.waiting ?? []).some(w => w.userId === userId)
  const round = state.currentRound
  const callback = useRef(onRejoin)
  callback.current = onRejoin
  useEffect(() => {
    if (known) return
    const t = setTimeout(() => callback.current(), REJOIN_AFTER_MS)
    return () => clearTimeout(t)
  }, [known, round])
}

/**
 * L'extrait de la manche, si le joueur l'active. Autour d'une table, la
 * musique passe par l'ecran central : pas de son ici. Le clic qui l'active
 * debloque aussi la lecture automatique pour la suite, sur le meme element
 * audio que le jeu (voir PITFALLS, audio).
 */
function useWaitingPreview(state: MultiplayerGameState, enabled: boolean, serverNow: number): void {
  const url = state.phase === "GUESSING" || state.phase === "REVEAL" ? state.currentTrack?.previewUrl ?? null : null
  const round = state.currentRound
  const startAt = state.timing.startAt
  useEffect(() => {
    if (!enabled || !url) return
    const seekTo = startAt ? Math.max(0, (serverNow - startAt) / 1000) : 0
    audioManager.play({ src: url, loop: true, owner: AUDIO_OWNER, seekTo }).catch(() => {})
    return () => audioManager.stopIfSrc(url, "latejoin", AUDIO_OWNER)
    // serverNow n'est lu qu'au depart de la lecture : pas de relance a chaque seconde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, round, enabled, startAt])
}

/**
 * Arrive en cours de partie (T19) : il regarde la partie comme un spectateur,
 * avec un bandeau qui dit quand il joue. Il peut parler dans le chat. Le
 * passage a l'ecran de jeu se fait tout seul, quand le serveur le range dans
 * les joueurs au debut de la manche suivante.
 */
export function LateJoinerView({ state, currentUserId, serverNow, chatMessages, onSendChat, onExit, onRejoin, accentColor }: LateJoinerViewProps) {
  const [sound, setSound] = useState(false)
  useRejoinIfUnknown(state, currentUserId, onRejoin)
  const withSound = state.mode !== "event"
  useWaitingPreview(state, withSound && sound, serverNow)
  const banner = lateJoinBanner(state)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 text-[#2e2014] sm:px-6 sm:py-8" data-testid="late-joiner-view">
      <section
        role="status"
        className="flex flex-col gap-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-4 shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div className="flex min-w-0 items-start gap-3">
          <Hourglass aria-hidden className="mt-1 h-5 w-5 shrink-0" style={{ color: GOLD }} />
          <div className="min-w-0">
            <p className="m-0 font-display text-lg font-semibold leading-snug sm:text-xl" data-testid="late-joiner-title">{banner.title}</p>
            <p className="m-0 mt-1 text-sm text-[#6b573f]">{banner.body}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {withSound ? (
            <button
              type="button"
              onClick={() => setSound(s => !s)}
              aria-pressed={sound}
              className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            >
              {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              {sound ? "Son activé" : "Écouter"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            <LogOut className="h-3.5 w-3.5" /> Quitter
          </button>
        </div>
      </section>

      <SpectatorStage game={state} members={[]} clockOffset={0} now={serverNow} />

      <Panel label="Le chat de la salle" dot={accentColor ?? "#c65133"}>
        <LobbyChat
          bare
          messages={chatMessages}
          onSend={onSendChat}
          currentUserId={currentUserId}
          accent={accentColor}
          placeholder="un mot pour la table..."
          emptyLabel="Personne n'a encore écrit."
        />
      </Panel>
      <Label dot={GOLD} className="justify-center text-[10px]">Tu regardes en attendant ton tour</Label>
    </div>
  )
}
