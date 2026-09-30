"use client"

import Link from "next/link"
import { useState } from "react"
import { MusicLibrary } from "@/components/import/MusicLibrary"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"
import { publicPath } from "@/lib/publicPath"
import { GAME_MODES } from "@/lib/gameModes"
import type { LobbyRendererProps } from "./lobbyTypes"
import { LobbyDock } from "./LobbyDock"
import { RecentPlayers } from "./RecentPlayers"
import {
  BLOCK,
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
    // Ossature (30/09) : la salle en banniere pleine largeur, puis la regie a
    // gauche et ta musique a droite. La bulle du chat s'ouvre en bas a droite,
    // au-dessus de la musique : elle ne recouvre jamais le bouton Lancer.
    // pb : place pour la barre Lancer collee en bas sur telephone.
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-32 lg:gap-6 lg:pb-10">
      {/* 1. LA SALLE : le code, le partage, et qui est deja la */}
      <section
        className={`${BLOCK} grid gap-5 p-4 text-[#f4ecdb] sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8 lg:p-7`}
        style={{ background: "#2e2014" }}
        data-testid="lobby-salle"
      >
        <div className="min-w-0">
          <Label dot={ACCENT} className="mb-4">{isHost ? "Invite tes amis" : "Tu es dans la partie"}</Label>
          <RoomCode code={code} size="xl" />
          <p className="mb-3 mt-4 text-center text-sm text-[#e9dcc0]">
            Envoie le lien, ou donne le code à taper sur {shortUrl}
          </p>
          <ShareButtons code={code} link={link} />
        </div>
        <div className="min-w-0 border-t-2 border-dashed border-[#6b573f] pt-4 lg:border-l-2 lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9dcc0]">Dans la salle</p>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9dcc0]">
              {participants.length} / {maxPlayers}
            </span>
          </div>
          <Roster
            participants={participants}
            hostUserId={hostUserId}
            currentUserId={currentUserId}
            accent={ACCENT}
            emptyLabel="Personne pour l'instant."
          />
          {isHost && code ? (
            <RecentPlayers roomCode={code} accent={ACCENT} tone="dark" exclude={participants.map(p => p.user_id)} />
          ) : null}
        </div>
      </section>

      {/* Les deux panneaux ont la meme hauteur : "Lancer" est cale en bas du sien. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-6">
        {/* 2. LA PARTIE : la regie de l'hote, ou ce qu'il a choisi pour l'invite */}
        <Panel fill label="La partie" dot={ACCENT} testId="lobby-partie" className="min-w-0">
          {isHost ? (
            <RoundSettings room={room} accent={ACCENT} accentText="#f4ecdb" />
          ) : (
            <>
              <p className="-mt-2 mb-3 text-sm text-[#6b573f]">Choisi par {hostName ?? "l'hôte"}.</p>
              <RoundSettings room={room} accent={ACCENT} accentText="#f4ecdb" readOnly />
            </>
          )}
          <LaunchDock>
            {isHost ? (
              <LaunchButton
                onStart={props.onStart}
                canStart={props.canStart}
                starting={props.starting}
                importing={props.importing}
                hint={alone ? `Il faut au moins ${MIN_PLAYERS} joueurs : envoie le lien.` : `${participants.length} joueurs dans la salle`}
              />
            ) : (
              <WaitingForHost hostName={hostName} accent={ACCENT} />
            )}
          </LaunchDock>
        </Panel>

        {/* 3. TA MUSIQUE */}
        <Panel fill label="Ta musique" dot={ACCENT} testId="lobby-musique" className="min-w-0">
          <p className="-mt-2 mb-3 text-sm text-[#6b573f]">
            La partie pioche dans la musique de chaque joueur présent. Coche ce que tu amènes ce soir.
          </p>
          {/* Une longue bibliotheque defile ici au lieu d'etirer la page. */}
          <div className="lg:max-h-[240px] lg:overflow-y-auto lg:pr-1">
            <MusicLibrary accent={ACCENT} refreshSignal={libRefresh} />
          </div>
          <div className="mt-4 border-t-2 border-dotted border-[rgba(46,32,20,.35)] pt-4">
            <ProfileImportBlock accent={ACCENT} hideHeader onImported={() => setLibRefresh(n => n + 1)} />
          </div>
        </Panel>
      </div>

      {/* 4. EN ATTENDANT : le chat et pierre-feuille-ciseaux dans la bulle */}
      {onSendChat ? (
        <LobbyDock
          messages={chatMessages}
          onSend={onSendChat}
          currentUserId={currentUserId}
          players={participants.map(p => ({ userId: p.user_id, username: p.username }))}
          rps={rps}
          accent={ACCENT}
          raised
        />
      ) : null}
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
