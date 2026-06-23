"use client"

import { Waves, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { modeAccent } from "@/lib/uiTokens";
import { ParticipantPanel } from "./LobbyViews";
import type { LobbyRendererProps } from "./lobbyTypes";

function StreamerEntry({
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: {
  onHost: () => void;
  onJoinSubmit: LobbyRendererProps["onJoinSubmit"];
  joinCode: LobbyRendererProps["joinCode"];
  setJoinCode: LobbyRendererProps["setJoinCode"];
  joining: LobbyRendererProps["joining"];
}) {
  const accent = modeAccent("streamer");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <SurfaceCard className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
              Mode Streamer
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-[#2e2014]">Lance le flux interactif</h2>
            <p className="text-sm text-[#6b573f]">Le chat répond via code, tu contrôles le rythme.</p>
          </div>
          <span className="rounded-full border border-[rgba(46,32,20,.22)] px-3 py-1 text-[11px] uppercase tracking-[0.3em]" style={{ borderColor: accent, color: accent }}>
            Live
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {["Compte à rebours clair", "Streamer ≠ fournisseur", "Chat en autonomie"].map(point => (
            <span
              key={point}
              className="rounded-full border border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-3 py-[6px] text-xs font-semibold text-[#6b573f]"
              style={{ borderColor: accent, color: accent }}
            >
              {point}
            </span>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={onHost}
          className="w-full justify-center gap-2 rounded-xl border border-[rgba(46,32,20,.22)] bg-[#ece1c8] px-5 py-3 text-sm font-semibold hover:bg-[#e0d4ba]"
          style={{ borderColor: accent, color: accent }}
        >
          <Sparkles className="h-4 w-4" />
          Ouvrir la room Streamer
        </Button>
        <p className="text-xs text-[#6b573f]">Projette ensuite le code, le chat rejoindra depuis ses téléphones.</p>
      </SurfaceCard>

      <SurfaceCard className="space-y-3">
        <h3 className="text-lg font-semibold text-[#2e2014]">Rejoindre le flux</h3>
        <p className="text-sm text-[#6b573f]">Colle le code projeté, connecte Spotify, tu entres directement.</p>
        <form onSubmit={onJoinSubmit} className="space-y-3">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="w-full rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-4 py-3 text-sm uppercase tracking-[0.25em] text-[#2e2014] outline-none focus:border-[rgba(46,32,20,.22)]"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={joining}
            className="w-full justify-center rounded-xl border-[rgba(46,32,20,.22)] bg-[#ece1c8] px-4 py-2 text-sm font-semibold text-[#2e2014] hover:bg-[#e0d4ba] disabled:opacity-60"
            style={{ borderColor: accent, color: accent }}
          >
            Rejoindre
          </Button>
        </form>
      </SurfaceCard>
    </div>
  );
}

function StreamerLobby(props: LobbyRendererProps) {
  const accent = modeAccent("streamer");
  const room = props.room;
  const roomCode = (room?.room_code ?? props.joinCode ?? "").toUpperCase() || "------";
  const audience = room ? props.participants : props.participants;
  return (
    <SurfaceCard className="space-y-4">
      <div className="rounded-md border-2 border-[#e0a32e] bg-[#efe5d0] px-4 py-3 text-sm font-semibold text-[#a87714]">
        Mode Streamer en cours de développement, le lancement de partie n'est pas
        encore disponible. Reviens bientôt !
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-[#ece1c8] p-3">
            <Waves className="h-5 w-5 text-[#2e2014]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#6b573f]">Flux streamer</p>
            <h3 className="text-2xl font-semibold text-[#2e2014]">Attente des joueurs</h3>
            <p className="text-sm text-[#6b573f]">Projette le code, le chat rejoint et fournit la musique.</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-right text-xs uppercase tracking-[0.3em] text-[#6b573f]">
          {props.hostUser ? (
            <div className="rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-3 py-2 text-right text-[11px] text-[#6b573f]">
              <p className="uppercase tracking-[0.3em] text-[#6b573f]">Hôte</p>
              <p className="text-sm font-semibold text-[#2e2014]">{props.hostUser.username || `#${props.hostUser.user_id}`}</p>
            </div>
          ) : null}
          <div>
            <div>Code</div>
            <div className="text-lg font-semibold tracking-[0.25em]" style={{ color: accent }}>{roomCode}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <SurfaceCard className="space-y-3 border-[rgba(46,32,20,.22)] bg-[#efe5d0]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-[#2e2014]">
              <Waves className="h-4 w-4" />
              <span>Participants</span>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-[#6b573f]">{audience.length} présent(s)</span>
          </div>
          <ParticipantPanel
            participants={audience}
            scores={props.scores}
            title="Public connecté"
            compact
            modeConfig={props.modeConfig}
          />
        </SurfaceCard>

        <SurfaceCard className="space-y-3 border-[rgba(46,32,20,.22)] bg-[#efe5d0]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#6b573f]">Rappel</p>
          <h4 className="text-xl font-semibold text-[#2e2014]">Un seul bouton : lancer</h4>
          <p className="text-sm text-[#6b573f]">Quand tout le monde est prêt, clique sur “Lancer” depuis la vue jeu.</p>
          <div className="rounded-xl border border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-4 py-3 text-sm text-[#6b573f]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b573f]">Code à projeter</p>
            <p className="mt-1 text-3xl font-semibold tracking-[0.24em] text-[#2e2014]" style={{ color: accent }}>
              {roomCode}
            </p>
            <p className="mt-2 text-xs text-[#6b573f]">Les joueurs collent ce code, connectent Spotify et entrent directement.</p>
          </div>
        </SurfaceCard>
      </div>
    </SurfaceCard>
  );
}

export function StreamerLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return (
      <StreamerEntry
        onHost={props.onHost}
        onJoinSubmit={props.onJoinSubmit}
        joinCode={props.joinCode}
        setJoinCode={props.setJoinCode}
        joining={props.joining}
      />
    );
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <StreamerLobby {...props} />;
  }

  return null;
}
