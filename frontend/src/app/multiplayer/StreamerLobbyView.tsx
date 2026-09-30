"use client"

import type { LobbyRendererProps } from "./lobbyTypes"
import { BLOCK, Label, Panel, RoomCode, Roster } from "./lobbyKit"

const ACCENT = "#7d9471"

function StreamerEntry({
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: Pick<LobbyRendererProps, "onJoinSubmit" | "joinCode" | "setJoinCode" | "joining"> & { onHost: () => void }) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Panel label="Streamer" dot={ACCENT}>
        <h2 className="mb-2 font-display text-3xl font-semibold leading-tight">Lance le flux interactif</h2>
        <p className="mb-5 text-sm text-[#6b573f]">
          Ton chat rejoint avec un code et répond pendant que tu gardes la main sur le rythme.
        </p>
        <button
          type="button"
          onClick={onHost}
          className="w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
        >
          Ouvrir la salle streamer
        </button>
      </Panel>
      <Panel label="Rejoindre le flux" dot={ACCENT}>
        <p className="mb-3 text-sm text-[#6b573f]">Entre le code affiché sur le live.</p>
        <form onSubmit={onJoinSubmit} className="space-y-2">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            aria-label="Code de la salle"
            className="w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.25em] text-[#2e2014] outline-none placeholder:text-[#b3a182] focus:border-[#c65133]"
          />
          <button
            type="submit"
            disabled={joining}
            className="w-full rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-4 py-3 text-sm font-bold text-[#f4ecdb] disabled:opacity-50"
          >
            Rejoindre
          </button>
        </form>
      </Panel>
    </div>
  )
}

function StreamerLobby(props: LobbyRendererProps) {
  const code = (props.room?.room_code ?? props.joinCode ?? "").toUpperCase()
  const n = props.participants.length
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
      <section className={`${BLOCK} p-5 text-[#2e2014] sm:p-7`} style={{ background: ACCENT }} data-testid="lobby-salle">
        <Label dot="#f4ecdb">Code à afficher sur le live</Label>
        <div className="my-5">
          <RoomCode code={code} size="xl" />
        </div>
        <div className="border-t-2 border-dashed border-[#2e2014]/40 pt-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]">Public connecté · {n}</p>
          <Roster
            participants={props.participants}
            hostUserId={props.room?.host_user_id ?? null}
            currentUserId={props.currentUserId}
            accent={ACCENT}
            emptyLabel="Personne pour l'instant."
          />
        </div>
      </section>
      <Panel label="La partie" dot={ACCENT}>
        <p className="m-0 rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3 text-sm font-semibold text-[#2e2014]">
          {"Le mode streamer est en cours de développement : le lancement de partie n'est pas encore disponible. Reviens bientôt !"}
        </p>
        {props.hostUser ? (
          <p className="mb-0 mt-4 text-sm text-[#6b573f]">
            Hôte : <b className="text-[#2e2014]">{props.hostUser.username || `#${props.hostUser.user_id}`}</b>
          </p>
        ) : null}
      </Panel>
    </div>
  )
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
    )
  }
  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <StreamerLobby {...props} />
  }
  return null
}
