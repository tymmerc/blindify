"use client"

import { accentTexte } from "@/lib/accentText"
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
  bare = false,
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
  /** Sans cadre ni titre : pour vivre dans le panneau de la bulle du lobby. */
  bare?: boolean
}) {
  const nameFor = (id: number): string => {
    if (id === currentUserId) return "Toi"
    const p = players.find(pl => pl.userId === id)
    return p?.username || `Joueur ${id}`
  }
  const opponents = players.filter(p => p.userId !== currentUserId)
  const pendingName = pendingTargetId != null ? nameFor(pendingTargetId) : null

  const card = bare ? "" : "rounded-md border-2 border-line bg-paper-deep p-4 shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]"

  return (
    <div className={card}>
      {!bare && (
      <div className="mb-3 flex items-center justify-between">
        <p className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-ink">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-line" style={{ background: accent }} />
          Pierre, feuille, ciseaux
        </p>
        <Swords aria-hidden className="h-4 w-4 text-ink-2" />
      </div>
      )}

      {/* Revelation du dernier duel */}
      {result ? (
        <div className="mb-3 rounded-md border-[1.5px] border-line bg-paper px-3 py-3 text-center">
          <p className="m-0 font-display text-lg text-ink">
            <span className="font-bold">{nameFor(result.a)}</span>
            <span className="mx-2 text-2xl align-middle">{MOVE_EMOJI[result.aMove]}</span>
            <span className="text-sourd">vs</span>
            <span className="mx-2 text-2xl align-middle">{MOVE_EMOJI[result.bMove]}</span>
            <span className="font-bold">{nameFor(result.b)}</span>
          </p>
          <p className="m-0 mt-1 text-sm font-bold" style={{ color: accentTexte(accent) }}>
            {result.winnerUserId == null ? "Égalité !" : `${nameFor(result.winnerUserId)} gagne 🏆`}
          </p>
        </div>
      ) : null}

      {/* Etat principal */}
      {active ? (
        <div className="text-center">
          <p className="m-0 mb-3 text-sm text-ink-2">
            Duel contre <span className="font-bold text-ink">{nameFor(active.opponentId)}</span>
          </p>
          {active.myMove ? (
            <div className="flex flex-col items-center gap-1 py-2">
              <span className="text-4xl">{MOVE_EMOJI[active.myMove]}</span>
              <p className="m-0 text-sm italic text-sourd">En attente de {nameFor(active.opponentId)}...</p>
            </div>
          ) : (
            <div className="flex justify-center gap-3">
              {MOVES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPlay(m)}
                  aria-label={MOVE_LABEL[m]}
                  className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-line bg-paper text-3xl shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
                >
                  {MOVE_EMOJI[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : incoming ? (
        <div className="text-center">
          <p className="m-0 mb-3 text-sm text-ink">
            <span className="font-bold">{incoming.fromUsername || `Joueur ${incoming.fromUserId}`}</span> te défie !
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="rounded-md border-2 border-line px-4 py-2 font-display text-sm font-bold text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
              style={{ background: accent }}
            >
              Accepter
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="rounded-md border-2 border-line bg-paper px-4 py-2 font-display text-sm font-bold text-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
            >
              Refuser
            </button>
          </div>
        </div>
      ) : pendingName ? (
        <p className="py-2 text-center text-sm italic text-sourd">En attente de la réponse de {pendingName}...</p>
      ) : opponents.length === 0 ? (
        <p className="py-2 text-center text-sm italic text-sourd">{"En attente d'un adversaire pour se défier..."}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-sourd">Défie un joueur en attendant :</p>
          {opponents.map(p => (
            <div key={p.userId} className="flex items-center justify-between rounded-md border-[1.5px] border-[rgb(var(--c-line)/.25)] bg-paper px-3 py-2">
              <span className="truncate text-sm font-medium text-ink">{p.username || `Joueur ${p.userId}`}</span>
              <button
                type="button"
                onClick={() => onChallenge(p.userId)}
                className="shrink-0 rounded-md border-2 border-line px-3 py-1 text-xs font-bold text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
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
        <div className="mt-3 border-t-[1.5px] border-[rgb(var(--c-line)/.2)] pt-2">
          <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sourd">Palmarès</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {scoreboard.map(s => (
              <span key={s.userId} className="text-xs text-ink">
                {s.userId === currentUserId ? "Toi" : s.username || `J${s.userId}`}
                <span className="ml-1 font-bold" style={{ color: accentTexte(accent) }}>{s.wins}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
