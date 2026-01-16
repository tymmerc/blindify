"use client"

import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { modeAccent } from "@/lib/uiTokens"
import type { LobbyRendererProps } from "./lobbyTypes"

function FriendsEntry({
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
  const accent = modeAccent("friends")
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <SurfaceCard className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
              Mode amis
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-white">Crée une partie privée</h2>
            <p className="text-sm text-white/70">Code unique, rivalité claire dès le lobby.</p>
          </div>
          <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.3em]" style={{ borderColor: accent, color: accent }}>
            Duel
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {["Rivalité directe", "Prêts visibles", "Lancement en un clic"].map(point => (
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
          Créer une partie privée
        </Button>
        <p className="text-xs text-white/60">Partage ton code de room : tout passe par lui.</p>
      </SurfaceCard>

      <div className="space-y-4">
        <SurfaceCard className="space-y-3" style={{ borderColor: accent }}>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.28em]" style={{ color: accent }}>
              Rejoindre avec un code
            </p>
            <p className="text-sm text-white/70">Colle le code reçu et on te connecte à la room.</p>
          </div>
          <form onSubmit={onJoinSubmit} className="space-y-3">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              className="w-full rounded-xl border bg-[#0f0f0f] px-4 py-3 text-sm uppercase tracking-[0.25em] text-white outline-none transition"
              style={{ borderColor: `${accent}33` }}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={joining}
              className="w-full justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
              style={{ borderColor: accent, color: accent }}
            >
              Rejoindre
            </Button>
          </form>
        </SurfaceCard>

        <SurfaceCard className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Prêt à rejoindre ?</h3>
          <p className="text-sm text-white/70">Entre simplement le code reçu pour rejoindre.</p>
          <Link href="/modes" className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:text-white" style={{ color: accent }}>
            Retour aux modes
          </Link>
        </SurfaceCard>
      </div>
    </div>
  )
}

function FriendsLobby({
  participants,
  onStart,
  starting,
  canStart,
  isHost,
  room,
}: LobbyRendererProps) {
  const accent = modeAccent("friends")
  const roomCode = room?.room_code ?? ""

  const copyCode = () => {
    if (!roomCode) return
    navigator.clipboard?.writeText(roomCode).catch(() => {})
  }
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <SurfaceCard className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Rivalité active</p>
            <h3 className="text-2xl font-semibold text-white">Prêts / pas prêts</h3>
            <p className="text-sm text-white/70">On lance dès que vos rivaux sont alignés.</p>
          </div>
          <Button
            variant="outline"
            onClick={onStart}
            disabled={starting || !canStart}
            className="gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: accent, color: accent }}
          >
            {isHost ? <Sparkles className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {isHost ? "Lancer la partie" : "En attente de l’hôte"}
          </Button>
        </div>
        <div className="space-y-3">
          {participants.map(participant => (
            <div
              key={participant.user_id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3"
              style={{ borderColor: accent }}
            >
              <div className="flex flex-col">
                <span className="font-semibold text-white">{participant.username || `Ami ${participant.user_id}`}</span>
                <span className="text-[11px] uppercase tracking-[0.3em] text-white/60">{canStart ? "Prêt" : "En chauffe"}</span>
              </div>
              <span className="text-xs text-white/60">#{participant.user_id}</span>
            </div>
          ))}
          {participants.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-xs uppercase tracking-[0.3em] text-white/60">
              En attente de tes rivaux.
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <div className="space-y-4">
        {roomCode ? (
          <SurfaceCard className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">Code du lobby</p>
              <span className="text-lg font-semibold tracking-[0.25em]" style={{ color: accent }}>
                {roomCode}
              </span>
            </div>
            <Button
              variant="outline"
              onClick={copyCode}
              className="rounded-full border-white/20 px-4 py-2 text-sm font-semibold text-white"
              style={{ borderColor: accent, color: accent }}
            >
              Copier
            </Button>
          </SurfaceCard>
        ) : null}

        <SurfaceCard className="space-y-3">
          <p className="text-sm text-white/70">Les invitations sont coupées pour l’instant. Partage simplement ton code.</p>
        </SurfaceCard>
      </div>
    </section>
  )
}

export function FriendsLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return (
      <FriendsEntry
        onHost={props.onHost}
        onJoinSubmit={props.onJoinSubmit}
        joinCode={props.joinCode}
        setJoinCode={props.setJoinCode}
        joining={props.joining}
      />
    )
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <FriendsLobby {...props} />
  }

  return null
}
