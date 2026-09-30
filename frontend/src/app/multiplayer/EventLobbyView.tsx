"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Fingerprint, MonitorSpeaker, Smartphone } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useWakeLock } from "@/lib/useWakeLock"
import { MusicLibrary } from "@/components/import/MusicLibrary"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"
import { publicPath } from "@/lib/publicPath"
import type { LobbyRendererProps } from "./lobbyTypes"
import { LobbyRps } from "./LobbyRps"
import { RecentPlayers } from "./RecentPlayers"
import { BLOCK, CARD, ChatDock, Label, LaunchButton, LaunchDock, Panel, RoomCode, Roster, RoundSettings } from "./lobbyKit"

const ACCENT = "#e0a32e"
// Le serveur refuse de lancer sous 2 joueurs qui repondent (roomsController
// need_more_players), meme si la config front du mode dit 1.
const MIN_ANSWERING = 2

/* ─── Entree : l'hote choisit sa facon de jouer ─── */
function Choice({
  tag,
  title,
  desc,
  icon,
  onClick,
}: {
  tag: string
  title: string
  desc: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CARD} group flex h-full flex-col items-start gap-3 p-5 text-left transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]`}
    >
      <span className="flex w-full items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#2e2014]" style={{ background: ACCENT }}>
          {icon}
        </span>
        <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
          {tag}
        </span>
      </span>
      <span className="block font-display text-xl font-semibold text-[#2e2014]">{title}</span>
      <span className="block flex-1 text-sm leading-relaxed text-[#6b573f]">{desc}</span>
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-[#2e2014]">
        Choisir <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
      </span>
    </button>
  )
}

function EventEntry({
  intent,
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: Pick<LobbyRendererProps, "intent" | "onHost" | "onJoinSubmit" | "joinCode" | "setJoinCode" | "joining">) {
  const router = useRouter()
  // L'hote a deja choisi "creer" avant : on ne lui remontre pas "Rejoindre".
  const showJoin = intent !== "host"
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-2">
        <Label dot={ACCENT}>Organiser</Label>
        <h2 className="font-display text-3xl font-semibold leading-tight text-[#2e2014] sm:text-4xl">
          Vous avez combien de <em className="font-medium italic text-[#c65133]">téléphones</em> ?
        </h2>
        <p className="text-sm text-[#6b573f]">Chacun le sien, ou un seul pour toute la table. À toi de choisir.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Choice
          tag="Chacun son tel"
          title="Je joue aussi"
          desc="Tu réponds avec les autres et tu gères la partie."
          icon={<Smartphone className="h-5 w-5 text-[#2e2014]" />}
          onClick={() => onHost(true)}
        />
        <Choice
          tag="Chacun son tel"
          title="Je présente seulement"
          desc="Ton tel au centre de la table : musique et résultats. Tu ne réponds pas."
          icon={<MonitorSpeaker className="h-5 w-5 text-[#2e2014]" />}
          onClick={() => onHost(false)}
        />
        <Choice
          tag="Un seul tel"
          title="Un seul tel, buzzer"
          desc="Tous les doigts sur l'écran, le premier qui lâche répond."
          icon={<Fingerprint className="h-5 w-5 text-[#2e2014]" />}
          onClick={() => router.push("/buzzer")}
        />
      </div>

      {showJoin ? (
        <Panel label="Tu as un code ?" dot={ACCENT}>
          <form onSubmit={onJoinSubmit} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              placeholder="CODE DE LA SALLE"
              aria-label="Code de la salle"
              className="min-w-0 flex-1 rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.25em] text-[#2e2014] outline-none placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
            <button
              type="submit"
              disabled={joining}
              className="rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-5 py-3 text-sm font-bold text-[#f4ecdb] disabled:opacity-50"
            >
              Rejoindre la partie
            </button>
          </form>
          <p className="mb-0 mt-3 text-xs text-[#6b573f]">
            {"Tu répondras depuis ton téléphone, la musique passe sur l'écran de l'hôte."}
          </p>
        </Panel>
      ) : null}
    </div>
  )
}

function Music({ refresh, onImported, intro }: { refresh: number; onImported: () => void; intro: string }) {
  return (
    <Panel label="Ta musique" dot={ACCENT} testId="lobby-musique">
      <p className="-mt-2 mb-3 text-sm text-[#6b573f]">{intro}</p>
      <MusicLibrary accent={ACCENT} refreshSignal={refresh} />
      <div className="mt-4 border-t-2 border-dotted border-[rgba(46,32,20,.35)] pt-4">
        <ProfileImportBlock accent={ACCENT} hideHeader onImported={onImported} />
      </div>
    </Panel>
  )
}

function Rps({ props }: { props: LobbyRendererProps }) {
  const rps = props.rps
  if (!rps) return null
  return (
    <LobbyRps
      players={props.participants.map(p => ({ userId: p.user_id, username: p.username }))}
      currentUserId={props.currentUserId}
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
  )
}

/* ─── Joueur : il a rejoint depuis son telephone ─── */
function EventPlayerLobby(props: LobbyRendererProps) {
  const [libRefresh, setLibRefresh] = useState(0)
  const n = props.participants.length
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-24">
      <section className={`${BLOCK} p-5 text-[#2e2014]`} style={{ background: ACCENT }} data-testid="lobby-salle">
        <Label dot="#f4ecdb">{"Autour d'une table"}</Label>
        <h2 className="mb-1 mt-3 font-display text-3xl font-semibold">Tu es dans la partie</h2>
        <p className="m-0 text-sm">{"L'hôte lance depuis l'écran central. Garde cette page ouverte : c'est ici que tu répondras."}</p>
        <div className="mt-4 border-t-2 border-dashed border-[#2e2014]/40 pt-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]">À table · {n}</p>
          <Roster
            participants={props.participants}
            hostUserId={props.room?.host_user_id ?? null}
            currentUserId={props.currentUserId}
            accent={ACCENT}
            emptyLabel="Les autres arrivent."
          />
        </div>
      </section>
      <Music
        refresh={libRefresh}
        onImported={() => setLibRefresh(x => x + 1)}
        intro="Tes titres cochés passent dans la partie avec ceux des autres. Tu peux encore en ajouter."
      />
      <Rps props={props} />
      {props.onSendChat ? (
        <ChatDock
          messages={props.chatMessages ?? []}
          onSend={props.onSendChat}
          currentUserId={props.currentUserId}
          accent={ACCENT}
          raised={false}
          placeholder="chambre les autres en attendant..."
          emptyLabel="En attendant le lancement... balance un message !"
        />
      ) : null}
    </div>
  )
}

/* ─── Hote : l'ecran central, pose sur la table ou branche a la tele ─── */
function EventHostLobby(props: LobbyRendererProps) {
  const [libRefresh, setLibRefresh] = useState(0)
  // L'ecran central ne doit jamais se mettre en veille (QR affiche / partie a lancer).
  useWakeLock(props.isHost)
  const code = (props.room?.room_code ?? props.joinCode ?? "").toUpperCase()
  // Le QR pointe sur le wizard (/jouer/), la racine etant desormais la landing.
  // publicPath gere le basePath : /blindify/jouer/ sur dev, /jouer/ sur blindz.app.
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = `${origin}${publicPath("/jouer/")}?join=${code}`
  const shortUrl = `${origin.replace(/^https?:\/\//, "")}${publicPath("/jouer/")}`
  const n = props.participants.length
  const presenter = props.room?.host_plays !== true
  const hint =
    n < MIN_ANSWERING
      ? `Il faut au moins ${MIN_ANSWERING} joueurs sur leur téléphone pour lancer.`
      : "Cet écran diffuse la musique et les scores : pose-le au milieu de la table ou branche-le sur une télé."

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 pb-32 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:pb-0">
      <div className="flex min-w-0 flex-col gap-5">
        {/* 1. LA SALLE, en affiche : c'est ce que la table regarde */}
        <section className={`${BLOCK} p-5 text-[#2e2014] sm:p-7`} style={{ background: ACCENT }} data-testid="lobby-salle">
          <Label dot="#f4ecdb">Rejoignez la partie</Label>
          <h2 className="mb-5 mt-3 font-display text-2xl font-semibold leading-tight sm:text-3xl">
            Scannez le QR, ou entrez le code sur vos téléphones.
          </h2>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
            {code ? (
              <div className="w-full max-w-[150px] shrink-0 rounded-md border-2 border-[#2e2014] bg-white p-2.5 shadow-[4px_4px_0_#2e2014] sm:max-w-[200px] sm:p-3">
                <QRCodeSVG value={joinUrl} size={220} bgColor="#ffffff" fgColor="#2e2014" level="M" className="h-auto w-full" />
              </div>
            ) : null}
            <div className="w-full min-w-0 flex-1">
              <RoomCode code={code} size="xl" />
              <p className="mb-0 mt-3 text-center text-[11px] font-bold uppercase tracking-[0.22em]">Code de la salle</p>
              <p className="m-0 mt-1 break-all text-center text-sm">{shortUrl}</p>
            </div>
          </div>
          <div className="mt-6 border-t-2 border-dashed border-[#2e2014]/40 pt-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]">À table · {n}</p>
            <Roster
              participants={props.participants}
              hostUserId={props.room?.host_user_id ?? null}
              currentUserId={props.currentUserId}
              accent={ACCENT}
              big
              emptyLabel="Personne pour l'instant. Les joueurs apparaissent ici dès qu'ils ont scanné."
            />
          </div>
        </section>

        {/* Le chat reste sous l'affiche : la table le voit sur l'ecran central */}
        {props.onSendChat ? (
          <ChatDock
            messages={props.chatMessages ?? []}
            onSend={props.onSendChat}
            currentUserId={props.currentUserId}
            accent={ACCENT}
            raised
            emptyLabel="Le canal est ouvert. Les joueurs peuvent chambrer depuis leur téléphone."
          />
        ) : null}
        <div className="hidden lg:block">
          <Rps props={props} />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {/* 2. LA PARTIE : la regie */}
        <Panel label="La partie" dot={ACCENT} testId="lobby-partie">
          <RoundSettings room={props.room} accent={ACCENT} accentText="#2e2014" />
          <LaunchDock>
            <LaunchButton
              onStart={props.onStart}
              canStart={props.canStart}
              starting={props.starting}
              importing={props.importing}
              hint={hint}
            />
          </LaunchDock>
        </Panel>

        {/* 3. TA MUSIQUE */}
        <Music
          refresh={libRefresh}
          onImported={() => setLibRefresh(x => x + 1)}
          intro={
            presenter
              ? "Tu es le DJ : ta musique passe dans la partie même si tu ne réponds pas, avec celle des joueurs."
              : "La partie pioche dans ta musique et dans celle de chaque joueur à table."
          }
        />
        {code ? <RecentPlayers roomCode={code} accent={ACCENT} /> : null}

        {/* 4. EN ATTENDANT : sur ordinateur, a gauche avec le chat */}
        <div className="lg:hidden">
          <Rps props={props} />
        </div>
      </div>
    </div>
  )
}

function EventWaitingForNextGame({ joinCode }: { joinCode: string }) {
  return (
    <section className={`${BLOCK} mx-auto w-full max-w-xl p-6 text-center text-[#2e2014]`} style={{ background: ACCENT }}>
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]">Salle {joinCode}</p>
      <h2 className="mb-2 mt-3 font-display text-3xl font-semibold leading-tight">La partie est en cours</h2>
      <p className="m-0 text-sm">Reste sur cette page : tu rejoindras automatiquement la table dès la fin de la partie.</p>
      <p className="mb-0 mt-4 inline-flex items-center gap-2 text-sm font-bold">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full border border-[#2e2014] bg-[#f4ecdb]" />
        En attente de la prochaine partie…
      </p>
    </section>
  )
}

export function EventLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    // Retardataire sur une partie en cours : un ecran d'attente clair, pas le
    // bloc "Organiser" qui lui proposait de creer sa propre soiree.
    if (props.errorCode === "room_in_progress" && props.joinCode) {
      return <EventWaitingForNextGame joinCode={props.joinCode} />
    }
    return (
      <EventEntry
        intent={props.intent}
        onHost={props.onHost}
        onJoinSubmit={props.onJoinSubmit}
        joinCode={props.joinCode}
        setJoinCode={props.setJoinCode}
        joining={props.joining}
      />
    )
  }
  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return props.isHost ? <EventHostLobby {...props} /> : <EventPlayerLobby {...props} />
  }
  return null
}
