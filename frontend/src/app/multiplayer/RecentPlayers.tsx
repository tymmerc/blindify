"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { api } from "@/lib/api"

type RecentPlayer = { userId: number; username: string | null; lastPlayed: string }

/**
 * "Rejoue avec" : les joueurs croises lors des 30 derniers jours, avec un bouton
 * pour les reinviter dans la salle courante. Rend null s'il n'y a personne
 * (premiere partie) pour ne pas encombrer le lobby.
 *
 * Depuis le 30/09 il vit dans la banniere de la salle, sous "qui est la" : des
 * places en pointilles, a remplir. Avant, c'etait une carte sous la musique,
 * que Tym trouvait mal amenee.
 */
export function RecentPlayers({
  roomCode,
  accent,
  tone = "light",
  exclude = [],
}: {
  roomCode: string
  accent: string
  /** Couleur de la banniere : "dark" (encre, a distance) ou "light" (or, table). */
  tone?: "dark" | "light"
  /** Joueurs deja dans la salle : inutile de les reinviter. */
  exclude?: number[]
}) {
  const [players, setPlayers] = useState<RecentPlayer[]>([])
  const [invited, setInvited] = useState<Record<number, "sending" | "done" | "error">>({})

  useEffect(() => {
    let alive = true
    api.recentPlayers()
      .then(res => { if (alive) setPlayers(res.players ?? []) })
      .catch(err => console.error("recent_players_failed", err)) // pas bloquant : le bloc reste masque
    return () => { alive = false }
  }, [])

  const invite = async (userId: number) => {
    setInvited(prev => ({ ...prev, [userId]: "sending" }))
    try {
      await api.sendInvitation(userId, roomCode)
      setInvited(prev => ({ ...prev, [userId]: "done" }))
    } catch {
      setInvited(prev => ({ ...prev, [userId]: "error" }))
    }
  }

  const shown = players.filter(p => !exclude.includes(p.userId)).slice(0, 6)
  if (shown.length === 0) return null

  const dark = tone === "dark"
  const line = dark ? "#6b573f" : "rgba(46,32,20,.4)"
  const chipBorder = dark ? "#e9dcc0" : "#2e2014"
  // Sur l'or de la table, un bouton or disparaitrait : il passe a l'encre.
  const btnBg = dark ? accent : "#2e2014"

  return (
    <div className="mt-4 border-t-2 border-dashed pt-3" style={{ borderColor: line }}>
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em]">Rejoue avec</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {shown.map(p => {
          const state = invited[p.userId]
          const name = p.username || `Joueur ${p.userId}`
          return (
            <li
              key={p.userId}
              className="flex max-w-full items-center gap-2 rounded-full border-2 border-dashed py-1 pl-1 pr-1"
              style={{ borderColor: chipBorder }}
            >
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed font-display text-sm font-bold"
                style={{ borderColor: chipBorder }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 truncate font-display text-[15px] font-semibold">{name}</span>
              <button
                type="button"
                onClick={() => invite(p.userId)}
                disabled={state === "sending" || state === "done"}
                className="flex shrink-0 items-center gap-1 rounded-full border-2 border-[#2e2014] px-2.5 py-0.5 text-[11px] font-bold text-[#f4ecdb] transition hover:brightness-110 disabled:opacity-80"
                style={{ background: state === "done" ? "#7d9471" : btnBg }}
              >
                {state === "done" ? (<><Check className="h-3 w-3" /> Invité</>) :
                 state === "sending" ? "…" :
                 state === "error" ? "Réessayer" : "Inviter"}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
