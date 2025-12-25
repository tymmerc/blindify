"use client"

import { Waves, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { modeAccent } from "@/lib/uiTokens"
import { ParticipantPanel } from "./LobbyViews"
import type { LobbyRendererProps } from "./lobbyTypes"

function ChatEntry({ onHost }: { onHost: () => void }) {
  const accent = modeAccent("chat")
  return (
    <section
      className="flex flex-col gap-5 rounded-3xl border bg-[var(--ma-surface)] p-10 shadow-[0_30px_70px_rgba(0,0,0,0.45)]"
      style={{ borderColor: accent, boxShadow: `0 20px 60px ${accent}33` }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Mode chat</p>
        <h2 className="text-4xl font-semibold leading-tight" style={{ color: accent }}>
          Ouvre le salon
        </h2>
        <p className="text-sm text-[var(--ma-muted)]">Entrée immédiate, réponses en continu. Pas d’attente.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["Flux continu", "Participation live", "Aucune file"].map(point => (
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
        Ouvrir le salon
      </Button>
    </section>
  )
}

function ChatLobby(props: LobbyRendererProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[var(--ma-surface)] p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white/10 p-3">
              <Waves className="h-5 w-5 text-white" />
            </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Salon live</p>
            <h3 className="text-2xl font-semibold text-white">La partie est en cours</h3>
            <p className="text-sm text-[var(--ma-muted)]">Réponds au vol, les autres aussi.</p>
          </div>
        </div>
        <div className="text-right text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">
          <div>En direct</div>
          <div>{props.participants.length} participant(s)</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <ParticipantPanel
          participants={props.participants}
          scores={props.scores}
          title="Participants en direct"
          compact
          modeConfig={props.modeConfig}
        />
        {props.isHost ? (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-[var(--ma-muted)]">
            Laisse tourner : le flux auto-démarre dès qu’un participant arrive.
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ChatLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return <ChatEntry onHost={props.onHost} />
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <ChatLobby {...props} />
  }

  return null
}
