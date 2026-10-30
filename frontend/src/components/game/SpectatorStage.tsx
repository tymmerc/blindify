"use client"

import { useEffect, useState } from "react"
import { Label, Panel } from "@/app/multiplayer/lobbyKit"
import { VinylDisc } from "@/components/game/VinylDisc"
import { rankedPlayers, secondsLeft, type SpectatorMember } from "@/lib/spectatorState"
import type { MultiplayerGameState, MultiplayerPlayerState } from "@/lib/types"

const TERRA = "#c65133"
const GOLD = "#e0a32e"
const SAGE = "#7d9471"
const VERDICT: Record<string, { text: string; color: string }> = {
  correct: { text: "trouvé", color: SAGE },
  close: { text: "presque", color: GOLD },
  wrong: { text: "raté", color: "#9c2f1d" },
}

/** Horloge locale rafraichie 4 fois par seconde, pour le compte a rebours. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [active])
  return now
}

function name(p: { username: string | null } | undefined): string {
  return p?.username?.trim() || "Joueur"
}

function Scoreboard({ players, phase }: { players: MultiplayerPlayerState[]; phase: MultiplayerGameState["phase"] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {players.map((p, i) => {
        const verdict = phase !== "GUESSING" && p.lastVerdict ? VERDICT[p.lastVerdict] : null
        return (
          <li key={p.userId} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 font-display font-semibold text-[#8a7558]">{i + 1}</span>
            <span className={`truncate font-semibold ${p.disconnected ? "text-[#8a7558] line-through" : "text-[#2e2014]"}`}>{name(p)}</span>
            <span aria-hidden className="mx-1 min-w-4 flex-1 border-b-2 border-dotted border-[#2e2014]/30" />
            {phase === "GUESSING" ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8a7558]">{p.hasAnswered ? "a répondu" : "cherche…"}</span>
            ) : verdict ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: verdict.color }}>
                {verdict.text}
                {p.lastGained ? ` +${p.lastGained}` : ""}
              </span>
            ) : null}
            <span className="w-14 shrink-0 text-right font-display font-semibold tabular-nums text-[#2e2014]">{p.score ?? 0}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Podium({ players }: { players: MultiplayerPlayerState[] }) {
  const top = players.slice(0, 3)
  const colors = [GOLD, "#a8b8c8", TERRA]
  // 2e, 1er, 3e : le premier au centre. Seulement les marches occupees, pour
  // qu'un podium a deux ne laisse pas une colonne vide.
  const order = [1, 0, 2].filter(rank => top[rank])
  return (
    <div className="mx-auto grid w-full max-w-xl items-end gap-3" style={{ gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))` }}>
      {order.map(rank => {
        const p = top[rank]
        return (
          <div key={p.userId} className="flex flex-col items-center gap-2 text-center">
            <span className="max-w-full truncate font-display text-base font-semibold">{name(p)}</span>
            <div
              className="flex w-full items-start justify-center rounded-t-md border-2 border-b-0 border-[#2e2014] pt-2 font-display text-2xl font-bold"
              style={{ height: rank === 0 ? 112 : rank === 1 ? 84 : 64, background: colors[rank] }}
            >
              {rank + 1}
            </div>
            <span className="text-xs font-bold tabular-nums text-[#6b573f]">{p.score ?? 0} pts</span>
          </div>
        )
      })}
    </div>
  )
}

export interface SpectatorStageProps {
  game: MultiplayerGameState | null
  /** Membres du lobby, montres avant le lancement. */
  members: SpectatorMember[]
  /** Decalage horloge serveur - horloge locale (ms). */
  clockOffset: number
  now: number
}

/**
 * La partie vue de l'exterieur : salle d'attente, manche en cours (caviardee
 * tant qu'elle n'est pas revelee, comme pour les joueurs), classement, podium.
 * Sert au lien spectateur (T18) et au joueur arrive en cours de partie (T19).
 */
export function SpectatorStage({ game, members, clockOffset, now }: SpectatorStageProps) {
  if (!game || game.phase === "LOBBY") {
    return (
      <Panel label="Salle d'attente" dot={TERRA}>
        <p className="m-0 mb-4 text-sm text-[#6b573f]">La partie n'a pas encore commencé. Elle s'affichera ici dès le lancement.</p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {members.map(m => (
            <li key={m.userId} className="flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#efe5d0] px-3 py-1 text-sm font-semibold">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: m.status === "active" ? SAGE : m.status === "away" ? GOLD : "#8a7558" }} />
              {name(m)}
            </li>
          ))}
          {members.length === 0 ? <li className="text-sm text-[#8a7558]">Personne pour l'instant.</li> : null}
        </ul>
      </Panel>
    )
  }

  const ranked = rankedPlayers(game)
  if (game.phase === "FINISHED") {
    return (
      <div className="flex flex-col gap-5">
        <Panel label="Podium" dot={GOLD}>
          <Podium players={ranked} />
        </Panel>
        <Panel label="Face B · Classement final" dot={TERRA}>
          <Scoreboard players={ranked} phase={game.phase} />
        </Panel>
      </div>
    )
  }

  const left = secondsLeft(game, now, clockOffset)
  const revealed = game.phase === "REVEAL"
  const track = game.currentTrack
  const answered = ranked.filter(p => p.hasAnswered && !p.disconnected).length
  const present = ranked.filter(p => !p.disconnected).length
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className="flex flex-col items-center gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <div className="flex w-full items-center justify-between gap-3">
          <Label dot={revealed ? SAGE : TERRA}>Manche {game.currentRound} / {game.totalRounds}</Label>
          <span className="font-display text-2xl font-bold tabular-nums" style={{ color: left !== null && left <= 5 ? TERRA : "#2e2014" }}>
            {game.paused ? "Pause" : revealed ? "Révélation" : left !== null ? `${left} s` : ""}
          </span>
        </div>
        <VinylDisc size={220} spinning={!revealed && !game.paused} coverUrl={revealed ? track?.albumCover ?? null : null} />
        {revealed && track?.title ? (
          <div className="text-center">
            <p className="m-0 font-display text-2xl font-semibold">{track.title}</p>
            <p className="m-0 mt-1 text-sm font-semibold text-[#6b573f]">{track.artist}</p>
          </div>
        ) : (
          <p className="m-0 text-sm font-semibold text-[#6b573f]">
            {answered} / {present} ont répondu
          </p>
        )}
      </section>
      <Panel label="Face B · Classement" dot={TERRA}>
        <Scoreboard players={ranked} phase={game.phase} />
      </Panel>
    </div>
  )
}
