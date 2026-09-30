"use client"

import Link from "next/link"
import { useState } from "react"
import { MusicLibrary } from "@/components/import/MusicLibrary"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"
import { publicPath } from "@/lib/publicPath"
import { GAME_MODES } from "@/lib/gameModes"
import type { LobbyRendererProps } from "./lobbyTypes"
import { LobbyRps } from "./LobbyRps"
import {
  BLOCK,
  ChatDock,
  Label,
  LaunchButton,
  LaunchDock,
  Panel,
  RoomCode,
  Roster,
  RoundSettings,
  ShareButtons,
  WaitingForHost,
} from "./lobbyKit"

const ACCENT = "#c65133"
const MIN_PLAYERS = GAME_MODES.friends.lobby.minPlayers

/* Arrivee directe sur /multiplayer?mode=friends sans code ni intention. */
function FriendsEntry({
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: Pick<LobbyRendererProps, "onJoinSubmit" | "joinCode" | "setJoinCode" | "joining"> & { onHost: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <div className="space-y-2 text-center">
        <h2 className="font-display text-3xl font-semibold text-[#2e2014]">
          Une partie <em className="font-medium italic text-[#c65133]">à distance</em>
        </h2>
        <p className="text-sm text-[#6b573f]">{"Crée une salle, ou entre le code qu'on t'a envoyé."}</p>
      </div>
      <Panel dot={ACCENT}>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={onHost}
            className="w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
          >
            Créer une partie
          </button>
          <form onSubmit={onJoinSubmit} className="flex gap-2">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              placeholder="CODE"
              aria-label="Code de la salle"
              className="min-w-0 flex-1 rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.25em] text-[#2e2014] outline-none placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
            <button
              type="submit"
              disabled={joining}
              className="rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-5 py-3 text-sm font-bold text-[#f4ecdb] disabled:opacity-50"
            >
              Rejoindre
            </button>
          </form>
        </div>
      </Panel>
      <p className="text-center">
        <Link href="/friends" className="text-xs text-[#6b573f] underline hover:text-[#2e2014]">Retour</Link>
      </p>
    </div>
  )
}

function FriendsLobby(props: LobbyRendererProps) {
  const { participants, room, isHost, currentUserId, rps, chatMessages = [], onSendChat } = props
  const [libRefresh, setLibRefresh] = useState(0)
  const code = room?.room_code ?? ""
  const hostUserId = room?.host_user_id ?? null
  const maxPlayers = room?.max_players ?? 12
  const hostName = participants.find(p => p.user_id === hostUserId)?.username ?? null
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const link = `${origin}${publicPath("/friends/")}?join=${code}`
  const shortUrl = `${origin.replace(/^https?:\/\//, "")}${publicPath("/jouer/")}`
  const alone = participants.length < MIN_PLAYERS

  return (
    // pb : place pour la barre Lancer collee en bas sur telephone
    <div className="mx-auto grid w-full max-w-6xl gap-5 pb-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-6 lg:pb-0">
      <div className="flex min-w-0 flex-col gap-5">
        {/* 1. LA SALLE : le code, le partage, et qui est deja la */}
        <section className={`${BLOCK} p-4 text-[#f4ecdb] sm:p-6`} style={{ background: "#2e2014" }} data-testid="lobby-salle">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Label dot={ACCENT}>{isHost ? "Invite tes amis" : "Tu es dans la partie"}</Label>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9dcc0]">
              {participants.length} / {maxPlayers}
            </span>
          </div>
          <RoomCode code={code} size="xl" />
          <p className="mb-3 mt-4 text-center text-sm text-[#e9dcc0]">
            Envoie le lien, ou donne le code à taper sur {shortUrl}
          </p>
          <ShareButtons code={code} link={link} />
          <div className="mt-5 border-t-2 border-dashed border-[#6b573f] pt-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9dcc0]">Dans la salle</p>
            <Roster
              participants={participants}
              hostUserId={hostUserId}
              currentUserId={currentUserId}
              accent={ACCENT}
              emptyLabel="Personne pour l'instant."
            />
          </div>
        </section>

        {/* 3. TA MUSIQUE */}
        <Panel label="Ta musique" dot={ACCENT} testId="lobby-musique">
          <p className="-mt-2 mb-3 text-sm text-[#6b573f]">
            La partie pioche dans la musique de chaque joueur présent. Coche ce que tu amènes ce soir.
          </p>
          <MusicLibrary accent={ACCENT} refreshSignal={libRefresh} />
          <div className="mt-4 border-t-2 border-dotted border-[rgba(46,32,20,.35)] pt-4">
            <ProfileImportBlock accent={ACCENT} hideHeader onImported={() => setLibRefresh(n => n + 1)} />
          </div>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {/* 2. LA PARTIE : la regie de l'hote, ou qui va lancer */}
        {isHost ? (
          <Panel label="La partie" dot={ACCENT} testId="lobby-partie">
            <RoundSettings room={room} accent={ACCENT} accentText="#f4ecdb" />
            <LaunchDock>
              <LaunchButton
                onStart={props.onStart}
                canStart={props.canStart}
                starting={props.starting}
                importing={props.importing}
                hint={alone ? `Il faut au moins ${MIN_PLAYERS} joueurs : envoie le lien.` : `${participants.length} joueurs dans la salle`}
              />
            </LaunchDock>
          </Panel>
        ) : (
          <LaunchDock flush>
            <WaitingForHost hostName={hostName} accent={ACCENT} />
          </LaunchDock>
        )}

        {/* 4. EN ATTENDANT */}
        {rps ? (
          <LobbyRps
            players={participants.map(p => ({ userId: p.user_id, username: p.username }))}
            currentUserId={currentUserId}
            accent={ACCENT}
            scoreboard={rps.scoreboard}
            incoming={rps.incoming}
            active={rps.active}
            pendingTargetId={rps.pendingTargetId}
            result={rps.result}
            onChallenge={rps.challenge}
            onAccept={rps.accept}
            onDecline={rps.decline}
            onPlay={rps.play}
          />
        ) : null}
        {onSendChat ? (
          <ChatDock messages={chatMessages} onSend={onSendChat} currentUserId={currentUserId} accent={ACCENT} raised />
        ) : null}
      </div>
    </div>
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
