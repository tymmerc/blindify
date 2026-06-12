"use client"

import { Sparkles, Users } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"
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
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Créer une salle (host) */}
      <SurfaceCard className="flex flex-col gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
            Organiser
          </p>
          <h2 className="text-3xl font-semibold leading-tight text-[#2e2014]">Créer une salle</h2>
          <p className="text-sm text-[#6b573f]">
            Tu seras l'hôte : la musique joue sur ton écran, les joueurs répondent depuis leur téléphone.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onHost}
          className="w-full justify-center gap-2 rounded-xl border border-[rgba(46,32,20,.22)] bg-[#ece1c8] px-5 py-3 text-sm font-semibold hover:bg-[#e0d4ba]"
          style={{ borderColor: accent, color: accent }}
        >
          <Sparkles className="h-4 w-4" />
          Créer la salle
        </Button>
        <div className="rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] p-3 text-xs text-[#6b573f]">
          <p>L'hôte diffuse la musique et affiche les résultats. Les joueurs n'entendent rien de leur côté — tout passe par l'écran principal.</p>
        </div>
      </SurfaceCard>

      {/* Rejoindre une salle (participant) */}
      <SurfaceCard className="flex flex-col gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
            Participer
          </p>
          <h2 className="text-3xl font-semibold leading-tight text-[#2e2014]">Rejoindre</h2>
          <p className="text-sm text-[#6b573f]">
            Entre le code affiché sur l'écran principal pour rejoindre la partie.
          </p>
        </div>
        <form onSubmit={onJoinSubmit} className="space-y-3">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE DE LA SALLE"
            className="w-full rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-4 py-3 text-sm uppercase tracking-[0.25em] text-[#2e2014] outline-none focus:border-[rgba(46,32,20,.22)]"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={joining}
            className="w-full justify-center rounded-xl border-[rgba(46,32,20,.22)] bg-[#ece1c8] px-4 py-2 text-sm font-semibold text-[#2e2014] hover:bg-[#e0d4ba] disabled:opacity-60"
            style={{ borderColor: accent, color: accent }}
          >
            Rejoindre la partie
          </Button>
        </form>
        <div className="rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] p-3 text-xs text-[#6b573f]">
          <p>Tu répondras depuis ton téléphone. La musique est diffusée sur l'écran de l'hôte.</p>
        </div>
      </SurfaceCard>
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
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b573f]">Projection</p>
            <h3 className="text-2xl font-semibold text-[#2e2014]">En scène</h3>
            <p className="text-sm text-[#6b573f]">Lisible de loin. Le host contrôle le rythme.</p>
          </div>
          {host ? (
            <div className="rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-3 py-2 text-right text-xs text-[#6b573f]">
              <p className="uppercase tracking-[0.3em] text-[#6b573f]">Hôte</p>
              <p className="text-sm font-semibold text-[#2e2014]">{host.username || `#${host.user_id}`}</p>
            </div>
          ) : null}
          <Button
            variant="outline"
            onClick={props.onStart}
            disabled={props.starting || !props.canStart}
            className="gap-2 rounded-xl border border-[rgba(46,32,20,.22)] bg-[#ece1c8] px-5 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: accent, color: accent }}
          >
            <Sparkles className="h-4 w-4" />
            {props.isHost ? "Lancer" : "Hôte requis"}
          </Button>
        </div>
        <SurfaceCard className="space-y-3 border-[rgba(46,32,20,.22)] bg-[#efe5d0]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-[#2e2014]">
              <Users className="h-4 w-4" />
              <span>Participants</span>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-[#6b573f]">{filteredParticipants.length} présent(s)</span>
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

      <div className="space-y-4">
      <SurfaceCard className="space-y-3">
        <ProfileImportBlock
          accent={accent}
          initialUrl={props.initialProfileUrl ?? undefined}
          autoStart={Boolean(props.initialProfileUrl)}
          onImportingChange={props.onImportingChange}
        />
      </SurfaceCard>

      <SurfaceCard className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-[#6b573f]">Rappel</p>
        <h4 className="text-xl font-semibold text-[#2e2014]">Projette le code</h4>
        <p className="text-sm text-[#6b573f]">Les invités rejoignent via ce code. Tu contrôles le démarrage.</p>
        <div className="rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.35em] text-[#6b573f]">Code salle</p>
          <p className="mt-1 text-3xl font-semibold tracking-[0.24em] text-[#2e2014]">{roomCode}</p>
          <p className="mt-2 text-xs text-[#6b573f]">Projette ce QR code ou dicte le code pour que les joueurs rejoignent.</p>
          {roomCode !== "-----" && (
            <div className="mt-3 flex justify-center rounded-lg bg-white p-3">
              <QRCodeSVG
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/multiplayer?mode=event&code=${roomCode}`}
                size={140}
                bgColor="#ffffff"
                fgColor="#0b0710"
                level="M"
              />
            </div>
          )}
        </div>
      </SurfaceCard>
      </div>
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
