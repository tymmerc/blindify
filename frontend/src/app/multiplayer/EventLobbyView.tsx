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
          <p>L'hôte diffuse la musique et affiche les résultats. Les joueurs n'entendent rien de leur côté, tout passe par l'écran principal.</p>
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
  const accent = modeAccent("event") // or #e0a32e
  const filteredParticipants = props.participants
  const filteredScores = props.scores
  const roomCode = (props.room?.room_code ?? props.joinCode ?? "").toUpperCase() || "-----"
  const joinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/blindify/?join=${roomCode}`
  const playerCount = filteredParticipants.length

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
      {/* L'ECRAN CENTRAL : on rejoint ici (QR + code en gros) */}
      <div className="space-y-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Autour d'une table</p>
        <h2 className="font-display text-3xl font-semibold text-[#2e2014]">Rejoignez la partie</h2>
        <p className="text-sm text-[#6b573f]">Scannez le QR, ou entrez le code sur vos téléphones.</p>

        {roomCode !== "-----" && (
          <div className="mx-auto w-fit rounded-md border-2 border-[#2e2014] bg-white p-3 shadow-[3px_3px_0_rgba(46,32,20,.18)]">
            <QRCodeSVG value={joinUrl} size={168} bgColor="#ffffff" fgColor="#2e2014" level="M" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {roomCode.split("").map((char, i) => (
            <span
              key={`${char}-${i}`}
              className="inline-flex h-12 w-9 items-center justify-center rounded-md border-2 border-[#2e2014] bg-[#efe5d0] font-display text-2xl font-bold text-[#2e2014] shadow-[2px_2px_0_rgba(46,32,20,.18)]"
            >
              {char}
            </span>
          ))}
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">Code de la salle</p>
      </div>

      {/* Cote regie : joueurs connectes + lancer */}
      <div className="space-y-4">
        <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
              <Users className="h-4 w-4" /> Joueurs
            </p>
            <span className="font-display text-base font-bold text-[#2e2014]">{playerCount.toString().padStart(2, "0")}</span>
          </div>
          <ParticipantPanel
            participants={filteredParticipants}
            scores={filteredScores}
            title="Connectés"
            compact
            modeConfig={props.modeConfig}
            variant="large"
          />
          {playerCount === 0 && (
            <p className="mt-2 text-center text-sm italic text-[#8a7558]">En attente des joueurs...</p>
          )}
        </div>

        {props.isHost ? (
          <button
            type="button"
            onClick={props.onStart}
            disabled={props.starting || !props.canStart}
            className="w-full rounded-md border-2 border-[#2e2014] text-center font-display text-lg font-bold text-[#2e2014] shadow-[5px_5px_0_#2e2014] transition-all duration-150 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#2e2014] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: accent, padding: "18px 28px" }}
          >
            {props.starting ? (
              <span className="inline-flex items-center gap-0.5">
                Lancement
                <span className="inline-flex">
                  <span className="animate-bounce [animation-delay:-0.3s]">.</span>
                  <span className="animate-bounce [animation-delay:-0.15s]">.</span>
                  <span className="animate-bounce">.</span>
                </span>
              </span>
            ) : (
              "Lancer la partie"
            )}
          </button>
        ) : (
          <p className="rounded-md border-[1.5px] border-[rgba(46,32,20,.25)] bg-[#efe5d0] px-4 py-3 text-center text-sm text-[#6b573f]">
            C'est l'hôte qui lance la partie depuis l'écran central.
          </p>
        )}
        <p className="text-center text-[11px] text-[#8a7558]">
          Cet écran diffuse la musique et les scores. Pose-le au milieu de la table ou branche-le à une TV.
        </p>
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
