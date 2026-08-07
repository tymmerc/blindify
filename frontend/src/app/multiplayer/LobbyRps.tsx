"use client"

import { Swords } from "lucide-react"
import type { RpsMove, RpsScoreEntry, RpsIncoming, RpsActive, RpsResult } from "./hooks/useLobbyRps"

const MOVE_EMOJI: Record<RpsMove, string> = { rock: "✊", paper: "✋", scissors: "✌️" }
const MOVE_LABEL: Record<RpsMove, string> = { rock: "Pierre", paper: "Feuille", scissors: "Ciseaux" }
const MOVES: RpsMove[] = ["rock", "paper", "scissors"]

type Player = { userId: number; username: string | null }

export function LobbyRps({
  players,
  currentUserId,
  accent,
  scoreboard,
  incoming,
  active,
  pendingTargetId,
  result,
  onChallenge,
  onAccept,
  onDecline,
  onPlay,
}: {
  players: Player[]
  currentUserId: number
  accent: string
  scoreboard: RpsScoreEntry[]
  incoming: RpsIncoming | null
  active: RpsActive | null
  pendingTargetId: number | null
  result: RpsResult | null
  onChallenge: (targetUserId: number) => void
  onAccept: () => void
  onDecline: () => void
  onPlay: (move: RpsMove) => void
}) {
  const nameFor = (id: number): string => {
    if (id === currentUserId) return "Toi"
    const p = players.find(pl => pl.userId === id)
    return p?.username || `Joueur ${id}`
  }
  const opponents = players.filter(p => p.userId !== currentUserId)
  const pendingName = pendingTargetId != null ? nameFor(pendingTargetId) : null

  const card = "rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-4 shadow-[4px_4px_0_rgba(46,32,20,.18)]"

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <p className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
          <Swords className="h-4 w-4" /> Pierre · Feuille · Ciseaux
        </p>
      </div>

      {/* Revelation du dernier duel */}
      {result ? (
        <div className="mb-3 rounded-md border-[1.5px] border-[#2e2014] bg-[#f4ecdb] px-3 py-3 text-center">
          <p className="m-0 font-display text-lg text-[#2e2014]">
            <span className="font-bold">{nameFor(result.a)}</span>
            <span className="mx-2 text-2xl align-middle">{MOVE_EMOJI[result.aMove]}</span>
            <span className="text-[#8a7558]">vs</span>
            <span className="mx-2 text-2xl align-middle">{MOVE_EMOJI[result.bMove]}</span>
            <span className="font-bold">{nameFor(result.b)}</span>
          </p>
          <p className="m-0 mt-1 text-sm font-bold" style={{ color: accent }}>
            {result.winnerUserId == null ? "Égalité !" : `${nameFor(result.winnerUserId)} gagne 🏆`}
          </p>
        </div>
      ) : null}

      {/* Etat principal */}
      {active ? (
        <div className="text-center">
          <p className="m-0 mb-3 text-sm text-[#6b573f]">
            Duel contre <span className="font-bold text-[#2e2014]">{nameFor(active.opponentId)}</span>
          </p>
          {active.myMove ? (
            <div className="flex flex-col items-center gap-1 py-2">
              <span className="text-4xl">{MOVE_EMOJI[active.myMove]}</span>
              <p className="m-0 text-sm italic text-[#8a7558]">En attente de {nameFor(active.opponentId)}...</p>
            </div>
          ) : (
            <div className="flex justify-center gap-3">
              {MOVES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPlay(m)}
                  aria-label={MOVE_LABEL[m]}
                  className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] text-3xl shadow-[2px_2px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]"
                >
                  {MOVE_EMOJI[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : incoming ? (
        <div className="text-center">
          <p className="m-0 mb-3 text-sm text-[#2e2014]">
            <span className="font-bold">{incoming.fromUsername || `Joueur ${incoming.fromUserId}`}</span> te défie !
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="rounded-md border-2 border-[#2e2014] px-4 py-2 font-display text-sm font-bold text-[#f4ecdb] shadow-[2px_2px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]"
              style={{ background: accent }}
            >
              Accepter
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] px-4 py-2 font-display text-sm font-bold text-[#2e2014] shadow-[2px_2px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]"
            >
              Refuser
            </button>
          </div>
        </div>
      ) : pendingName ? (
        <p className="py-2 text-center text-sm italic text-[#8a7558]">En attente de la réponse de {pendingName}...</p>
      ) : opponents.length === 0 ? (
        <p className="py-2 text-center text-sm italic text-[#8a7558]">En attente d'un adversaire pour se défier...</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-[#8a7558]">Défie un joueur en attendant :</p>
          {opponents.map(p => (
            <div key={p.userId} className="flex items-center justify-between rounded-md border-[1.5px] border-[rgba(46,32,20,.25)] bg-[#f4ecdb] px-3 py-2">
              <span className="truncate text-sm font-medium text-[#2e2014]">{p.username || `Joueur ${p.userId}`}</span>
              <button
                type="button"
                onClick={() => onChallenge(p.userId)}
                className="shrink-0 rounded-md border-2 border-[#2e2014] px-3 py-1 text-xs font-bold text-[#f4ecdb] shadow-[2px_2px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]"
                style={{ background: accent }}
              >
                Défier
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Palmares de la soiree */}
      {scoreboard.length > 0 ? (
        <div className="mt-3 border-t-[1.5px] border-[rgba(46,32,20,.2)] pt-2">
          <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a7558]">Palmarès</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {scoreboard.map(s => (
              <span key={s.userId} className="text-xs text-[#2e2014]">
                {s.userId === currentUserId ? "Toi" : s.username || `J${s.userId}`}
                <span className="ml-1 font-bold" style={{ color: accent }}>{s.wins}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
