"use client"

import { useState } from "react"
import { Users, CheckCircle2, SlidersHorizontal } from "lucide-react"
import { api } from "@/lib/api"
import { useWakeLock } from "@/lib/useWakeLock"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"
import { modeAccent } from "@/lib/uiTokens"
import { ParticipantPanel } from "./LobbyViews"
import { LobbyChat } from "./LobbyChat"
import { LobbyRps } from "./LobbyRps"
import { RecentPlayers } from "./RecentPlayers"
import type { LobbyRendererProps } from "./lobbyTypes"

function EventEntry({
  intent,
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: {
  intent?: string | null
  onHost: (hostPlays?: boolean) => void
  onJoinSubmit: LobbyRendererProps["onJoinSubmit"]
  joinCode: LobbyRendererProps["joinCode"]
  setJoinCode: LobbyRendererProps["setJoinCode"]
  joining: LobbyRendererProps["joining"]
}) {
  const accent = modeAccent("event")
  // L'hote a deja choisi "creer" avant : on ne lui remontre pas "Rejoindre".
  const showJoin = intent !== "host"
  return (
    <div className={`grid w-full gap-4 ${showJoin ? "lg:grid-cols-2" : "mx-auto max-w-2xl"}`}>
      {/* Organiser : l'hote choisit son role */}
      <SurfaceCard className="flex flex-col gap-4 sm:gap-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
            Organiser
          </p>
          <h2 className="text-3xl font-semibold leading-tight text-[#2e2014]">Lancer une partie</h2>
          <p className="text-sm text-[#6b573f]">
            Choisis ton rôle. Dans les deux cas, c'est ton téléphone qui diffuse la musique pour toute la table.
          </p>
        </div>
        <div className={`grid gap-2 ${!showJoin ? "sm:grid-cols-2" : ""}`}>
          <button
            type="button"
            onClick={() => onHost(true)}
            className="flex flex-col items-start gap-0.5 rounded-xl border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-3 text-left transition hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-[#e0d4ba]"
          >
            <span className="font-semibold text-[#2e2014]">Je joue aussi</span>
            <span className="text-xs text-[#6b573f]">Tu réponds avec les autres et tu gères la partie.</span>
          </button>
          <button
            type="button"
            onClick={() => onHost(false)}
            className="flex flex-col items-start gap-0.5 rounded-xl border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-3 text-left transition hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-[#e0d4ba]"
          >
            <span className="font-semibold text-[#2e2014]">Je présente seulement</span>
            <span className="text-xs text-[#6b573f]">Ton tel au centre de la table : musique et résultats. Tu ne réponds pas.</span>
          </button>
        </div>
      </SurfaceCard>

      {/* Rejoindre une salle (participant) — cache si l'hote heberge deja */}
      {showJoin && (
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
            onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
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
      )}
    </div>
  )
}

function EventLobby(props: LobbyRendererProps) {
  const accent = modeAccent("event") // or #e0a32e
  const filteredParticipants = props.participants
  const filteredScores = props.scores
  // L'ecran central ne doit jamais se mettre en veille (QR affiche / partie a lancer).
  useWakeLock(props.isHost)
  // Reglages hote : nombre de manches + duree d'un round (sauves direct au clic)
  const [rounds, setRounds] = useState<number>(props.room?.question_count ?? 10)
  const [roundSec, setRoundSec] = useState<number>(Math.round((props.room?.round_duration_ms ?? 20000) / 1000))
  const saveConfig = (payload: { questionCount?: number; roundSeconds?: number }) => {
    if (!props.room) return
    void api.updateRoomConfig(props.room.room_code, payload).catch(() => {})
  }
  const roomCode = (props.room?.room_code ?? props.joinCode ?? "").toUpperCase() || "-----"
  const joinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/blindify/?join=${roomCode}`
  const playerCount = filteredParticipants.length
  const rpsPlayers = filteredParticipants.map(p => ({ userId: p.user_id, username: p.username }))
  const rps = props.rps

  // VUE JOINER : il a deja rejoint, pas besoin du QR ni du gros code (c'est l'ecran central de l'hote).
  // On lui montre juste une confirmation + la liste des joueurs connectes.
  if (!props.isHost) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        {/* Bandeau confirmation compact */}
        <div className="flex items-center gap-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-3 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#2e2014] bg-white shadow-[2px_2px_0_rgba(46,32,20,.18)]">
            <CheckCircle2 className="h-5 w-5" style={{ color: accent }} />
          </div>
          <div className="min-w-0 text-left">
            <p className="m-0 flex items-center gap-2 font-display text-lg font-semibold text-[#2e2014]">
              Tu es dans la partie
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8a7558]">
                <Users className="h-3.5 w-3.5" />{playerCount.toString().padStart(2, "0")}
              </span>
            </p>
            <p className="m-0 text-[13px] text-[#6b573f]">En attente que l'hôte lance depuis l'écran central.</p>
          </div>
        </div>

        {/* Mini-jeu d'attente : pierre-feuille-ciseaux */}
        {rps ? (
          <LobbyRps
            players={rpsPlayers}
            currentUserId={props.currentUserId}
            accent={accent}
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

        {/* Chat pour discuter en attendant le lancement */}
        {props.onSendChat ? (
          <div className="h-[38vh] min-h-[300px]">
            <LobbyChat
              messages={props.chatMessages ?? []}
              onSend={props.onSendChat}
              currentUserId={props.currentUserId}
              accent={accent}
              placeholder="chambre les autres en attendant..."
              emptyLabel="En attendant le lancement... balance un message !"
            />
          </div>
        ) : null}
      </section>
    )
  }

  return (
    // Mobile : une seule pile (ordre via order-*). Desktop : 2 colonnes independantes
    // etirees a la meme hauteur, le chat absorbe le reste -> pas de trou sous "Lancer".
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-stretch">
      {/* Colonne gauche : QR + mini-jeu */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
        {/* L'ECRAN CENTRAL : on rejoint ici (QR + code en gros). Hauteur NATURELLE :
            surtout pas flex-1 sinon la carte s'etire et cache le mini-jeu dessous. */}
        <div className="order-1 flex flex-col justify-center space-y-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Autour d'une table</p>
          <h2 className="font-display text-3xl font-semibold text-[#2e2014]">Rejoignez la partie</h2>
          <p className="text-sm text-[#6b573f]">Scannez le QR, ou entrez le code sur vos téléphones.</p>

          {roomCode !== "-----" && (
            // QR responsive : compact sur telephone (evite qu'il pousse le mini-jeu
            // hors ecran), plus grand sur l'ecran central / TV.
            <div className="mx-auto w-full max-w-[132px] rounded-md border-2 border-[#2e2014] bg-white p-2.5 shadow-[3px_3px_0_rgba(46,32,20,.18)] sm:max-w-[184px] sm:p-3">
              <QRCodeSVG value={joinUrl} size={200} bgColor="#ffffff" fgColor="#2e2014" level="M" className="h-auto w-full" />
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

        {/* Mini-jeu d'attente sous le QR */}
        {rps ? (
          <div className="order-3">
            <LobbyRps
              players={rpsPlayers}
              currentUserId={props.currentUserId}
              accent={accent}
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
          </div>
        ) : null}
      </div>

      {/* Colonne droite : régie (joueurs + lancer) + chat qui remplit */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
        <div className="order-2 flex flex-col gap-4">
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

          {/* Relancer une partie avec les potes des dernieres soirees */}
          {roomCode !== "-----" && <RecentPlayers roomCode={roomCode} accent={accent} />}

          {/* Reglages de la partie (hote) : sauves au clic, appliques au lancement */}
          <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-4 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
              <SlidersHorizontal className="h-4 w-4" /> Réglages
            </p>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">Manches</p>
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 15, 20].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => { setRounds(n); saveConfig({ questionCount: n }) }}
                      className={`rounded-full border-[1.5px] border-[#2e2014] px-3.5 py-1.5 text-sm font-bold transition ${
                        rounds === n ? "text-[#2e2014]" : "bg-[#f4ecdb] text-[#6b573f] hover:bg-[#e0d4ba]"
                      }`}
                      style={rounds === n ? { background: accent } : undefined}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">Durée d'une manche</p>
                <div className="flex flex-wrap gap-1.5">
                  {[10, 15, 20, 30].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setRoundSec(s); saveConfig({ roundSeconds: s }) }}
                      className={`rounded-full border-[1.5px] border-[#2e2014] px-3.5 py-1.5 text-sm font-bold transition ${
                        roundSec === s ? "text-[#2e2014]" : "bg-[#f4ecdb] text-[#6b573f] hover:bg-[#e0d4ba]"
                      }`}
                      style={roundSec === s ? { background: accent } : undefined}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

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
          <p className="text-center text-[11px] text-[#8a7558]">
            Cet écran diffuse la musique et les scores. Pose-le au milieu de la table ou branche-le à une TV.
          </p>
        </div>

        {/* Chat : remplit l'espace restant de la colonne sur desktop */}
        {props.onSendChat ? (
          <div className="order-4 h-[42vh] min-h-[300px] lg:h-auto lg:min-h-[320px] lg:flex-1">
            <LobbyChat
              messages={props.chatMessages ?? []}
              onSend={props.onSendChat}
              currentUserId={props.currentUserId}
              accent={accent}
              emptyLabel="Le canal est ouvert. Les joueurs peuvent chambrer depuis leur téléphone."
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function EventWaitingForNextGame({ joinCode }: { joinCode: string }) {
  const accent = modeAccent("event")
  return (
    <SurfaceCard className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
      <p className="text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
        Salle {joinCode}
      </p>
      <h2 className="text-3xl font-semibold leading-tight text-[#2e2014]">La partie est en cours</h2>
      <p className="text-sm text-[#6b573f]">
        Reste sur cette page : tu rejoindras automatiquement la table dès la fin de la partie.
      </p>
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
        <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: accent }} />
        En attente de la prochaine partie…
      </div>
    </SurfaceCard>
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
    return <EventLobby {...props} />
  }

  return null
}
