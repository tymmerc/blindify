"use client"

import { Sparkles, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { modeAccent } from "@/lib/uiTokens"
import { ParticipantPanel } from "./LobbyViews"
import type { LobbyRendererProps } from "./lobbyTypes"

function EventEntry({ onHost }: { onHost: () => void }) {
  const accent = modeAccent("event")
  return (
    <section
      className="flex flex-col gap-5 rounded-3xl border bg-[var(--ma-surface)] p-10 shadow-[0_30px_70px_rgba(0,0,0,0.45)]"
      style={{ borderColor: accent, boxShadow: `0 20px 60px ${accent}33` }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Mode événement</p>
        <h2 className="text-4xl font-semibold leading-tight" style={{ color: accent }}>
          Démarre la projection
        </h2>
        <p className="text-sm text-[var(--ma-muted)]">Un écran principal, un tempo clair. Les participants suivent en direct.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["Affichage lisible", "Un seul hôte", "Rythme constant"].map(point => (
          <span
            key={point}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-[6px] text-xs font-semibold text-slate-100"
            style={{ borderColor: accent, color: accent }}
          >
            {point}
          </span>
        ))}
      </div>
      <Button onClick={onHost} className="ma-btn-primary gap-2 self-start rounded-xl px-5 py-3 text-sm shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
        <Sparkles className="h-4 w-4" />
        Démarrer l’événement
      </Button>
    </section>
  )
}

function EventLobby(props: LobbyRendererProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="rounded-3xl border border-white/10 bg-[var(--ma-surface)] p-10">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Projection</p>
            <h3 className="text-2xl font-semibold text-white">En scène</h3>
            <p className="text-sm text-[var(--ma-muted)]">Lisible de loin. Le host contrôle le rythme.</p>
          </div>
          <Button
            onClick={props.onStart}
            disabled={props.starting || !props.canStart}
            className="ma-btn-primary gap-2 rounded-xl px-5 py-3 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {props.isHost ? "Lancer" : "Hôte requis"}
          </Button>
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-white">
              <Users className="h-4 w-4" />
              <span>Participants</span>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">{props.participants.length} présent(s)</span>
          </div>
          <ParticipantPanel
            participants={props.participants}
            scores={props.scores}
            title="Public connecté"
            compact
            modeConfig={props.modeConfig}
            variant="large"
          />
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/60 p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Rappel</p>
        <h4 className="text-xl font-semibold text-white">Aucun code, juste l’écran principal</h4>
        <p className="mt-2 text-sm text-[var(--ma-muted)]">Les invités rejoignent via l’écran principal. Tu contrôles le démarrage.</p>
      </div>
    </section>
  )
}

export function EventLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return <EventEntry onHost={props.onHost} />
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <EventLobby {...props} />
  }

  return null
}
