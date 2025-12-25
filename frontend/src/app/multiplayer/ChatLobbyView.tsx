"use client"

import { Waves, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { modeAccent } from "@/lib/uiTokens"
import { ParticipantPanel } from "./LobbyViews"
import type { LobbyRendererProps } from "./lobbyTypes"

function ChatEntry({
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: {
  onHost: () => void
  onJoinSubmit: LobbyRendererProps["onJoinSubmit"]
  joinCode: LobbyRendererProps["joinCode"]
  setJoinCode: LobbyRendererProps["setJoinCode"]
  joining: LobbyRendererProps["joining"]
}) {
  const accent = modeAccent("chat")
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <SurfaceCard className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
              Mode chat
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-white">Ouvre le salon</h2>
            <p className="text-sm text-white/70">Entrée immédiate, réponses en continu. Pas d’attente.</p>
          </div>
          <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.3em]" style={{ borderColor: accent, color: accent }}>
            Live
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {["Flux continu", "Participation live", "Aucune file"].map(point => (
            <span
              key={point}
              className="rounded-full border border-white/10 bg-[#0f0f0f] px-3 py-[6px] text-xs font-semibold text-white/80"
              style={{ borderColor: accent, color: accent }}
            >
              {point}
            </span>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={onHost}
          className="w-full justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15"
          style={{ borderColor: accent, color: accent }}
        >
          <Sparkles className="h-4 w-4" />
          Ouvrir le salon
        </Button>
        <p className="text-xs text-white/60">Le salon reste ouvert, les nouveaux participants entrent sans friction.</p>
      </SurfaceCard>

      <SurfaceCard className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Rejoindre un salon</h3>
        <p className="text-sm text-white/70">Colle le code du flux ou attends une auto-connexion.</p>
        <form onSubmit={onJoinSubmit} className="space-y-3">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="w-full rounded-xl border border-white/15 bg-[#0f0f0f] px-4 py-3 text-sm uppercase tracking-[0.25em] text-white outline-none focus:border-white/30"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={joining}
            className="w-full justify-center rounded-xl border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            style={{ borderColor: accent, color: accent }}
          >
            Rejoindre
          </Button>
        </form>
      </SurfaceCard>
    </div>
  )
}

function ChatLobby(props: LobbyRendererProps) {
  return (
    <SurfaceCard className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/10 p-3">
            <Waves className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">Salon live</p>
            <h3 className="text-2xl font-semibold text-white">La partie est en cours</h3>
            <p className="text-sm text-white/70">Réponds au vol, les autres aussi.</p>
            {props.isGuest ? <p className="text-xs text-white/60">Invité : participation sans audio.</p> : null}
          </div>
        </div>
        <div className="text-right text-xs uppercase tracking-[0.3em] text-white/60">
          <div>En direct</div>
          <div>{props.participants.length} participant(s)</div>
        </div>
      </div>

      <div className="grid gap-4">
        <ParticipantPanel
          participants={props.participants}
          scores={props.scores}
          title="Participants en direct"
          compact
          modeConfig={props.modeConfig}
        />
        {props.isHost ? (
          <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-sm text-white/70">
            Laisse tourner : le flux auto-démarre dès qu’un participant arrive.
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  )
}

export function ChatLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return (
      <ChatEntry
        onHost={props.onHost}
        onJoinSubmit={props.onJoinSubmit}
        joinCode={props.joinCode}
        setJoinCode={props.setJoinCode}
        joining={props.joining}
      />
    )
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <ChatLobby {...props} />
  }

  return null
}
