"use client"

import { Sparkles, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { modeAccent } from "@/lib/uiTokens"
import { ParticipantPanel } from "./LobbyViews"
import type { LobbyRendererProps } from "./lobbyTypes"

function EventEntry({
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
  const accent = modeAccent("event")
  const points = ["Affichage lisible", "Un seul hôte", "Rythme constant"]
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <SurfaceCard className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
              Mode événement
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-white">Démarre la projection</h2>
            <p className="text-sm text-white/70">Un écran principal, un tempo clair. Les participants suivent en direct.</p>
          </div>
          <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.3em]" style={{ borderColor: accent, color: accent }}>
            Collectif
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {points.map(point => (
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
          Démarrer l’événement
        </Button>
        <p className="text-xs text-white/60">Lisible à distance, les participants suivent ton rythme.</p>
        </SurfaceCard>

      <div className="space-y-4">
        <SurfaceCard className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Rejoindre une projection</h3>
          <p className="text-sm text-white/70">Colle le code projeté pour entrer dans le lobby.</p>
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

        <SurfaceCard className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Brief rapide</h3>
          <p className="text-sm text-white/70">Un seul hôte contrôle le tempo, les autres rejoignent via l’écran principal.</p>
          <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4 text-sm text-white/70">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Code de salle</p>
            <p className="mt-1 text-2xl font-semibold tracking-[0.18em] text-white">
              {joinCode ? joinCode : "-----"}
            </p>
            <p className="mt-2 text-xs text-white/55">Projette ce code pour que les joueurs rejoignent depuis leur téléphone.</p>
          </div>
        </SurfaceCard>
      </div>
    </div>
  )
}

function EventLobby(props: LobbyRendererProps) {
  const accent = modeAccent("event")
  const filteredParticipants = props.participants
  const filteredScores = props.scores
  const roomCode = (props.room?.room_code ?? props.joinCode ?? "").toUpperCase() || "-----"
  const host = props.hostUser
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <SurfaceCard className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Projection</p>
            <h3 className="text-2xl font-semibold text-white">En scène</h3>
            <p className="text-sm text-white/70">Lisible de loin. Le host contrôle le rythme.</p>
            {props.isGuest ? <p className="text-xs text-white/60">Invité : visionnage sans audio, participation autorisée.</p> : null}
          </div>
          {host ? (
            <div className="rounded-xl border border-white/15 bg-[#0f0f0f] px-3 py-2 text-right text-xs text-white/70">
              <p className="uppercase tracking-[0.3em] text-white/50">Hôte</p>
              <p className="text-sm font-semibold text-white">{host.username || `#${host.user_id}`}</p>
            </div>
          ) : null}
          <Button
            variant="outline"
            onClick={props.onStart}
            disabled={props.starting || !props.canStart}
            className="gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: accent, color: accent }}
          >
            <Sparkles className="h-4 w-4" />
            {props.isHost ? "Lancer" : "Hôte requis"}
          </Button>
        </div>
        <SurfaceCard className="space-y-3 border-white/10 bg-[#0f0f0f]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-white">
              <Users className="h-4 w-4" />
              <span>Participants</span>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-white/60">{filteredParticipants.length} présent(s)</span>
          </div>
          <ParticipantPanel
            participants={filteredParticipants}
            scores={filteredScores}
            title="Public connecté"
            compact
            modeConfig={props.modeConfig}
            variant="large"
          />
        </SurfaceCard>
      </SurfaceCard>

      <SurfaceCard className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-white/60">Rappel</p>
        <h4 className="text-xl font-semibold text-white">Projette le code</h4>
        <p className="text-sm text-white/70">Les invités rejoignent via ce code. Tu contrôles le démarrage.</p>
        <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">Code salle</p>
          <p className="mt-1 text-3xl font-semibold tracking-[0.24em] text-white">{roomCode}</p>
          <p className="mt-2 text-xs text-white/55">Partage ce code sur l’écran principal pour que les joueurs rejoignent avec Spotify.</p>
        </div>
      </SurfaceCard>
    </section>
  )
}

export function EventLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return (
      <EventEntry
        onHost={props.onHost}
        onJoinSubmit={props.onJoinSubmit}
        joinCode={props.joinCode}
        setJoinCode={props.setJoinCode}
        joining={props.joining}
      />
    )
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <EventLobby {...props} />
  }

  return null
}
