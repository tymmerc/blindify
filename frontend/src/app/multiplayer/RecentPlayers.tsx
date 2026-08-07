"use client"

import { useEffect, useState } from "react"
import { UserPlus, Check } from "lucide-react"
import { api } from "@/lib/api"

type RecentPlayer = { userId: number; username: string | null; lastPlayed: string }

/**
 * "Rejoue avec" : les joueurs croises lors des 30 derniers jours, avec un bouton
 * pour les reinviter dans la salle courante. Rend null s'il n'y a personne
 * (premiere partie) pour ne pas encombrer le lobby.
 */
export function RecentPlayers({ roomCode, accent }: { roomCode: string; accent: string }) {
  const [players, setPlayers] = useState<RecentPlayer[]>([])
  const [invited, setInvited] = useState<Record<number, "sending" | "done" | "error">>({})

  useEffect(() => {
    let alive = true
    api.recentPlayers()
      .then(res => { if (alive) setPlayers(res.players ?? []) })
      .catch(() => { /* pas bloquant : on masque simplement le bloc */ })
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

  if (players.length === 0) return null

  return (
    <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-4 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
      <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
        <UserPlus className="h-4 w-4" /> Rejoue avec
      </p>
      <div className="flex flex-col gap-2">
        {players.map(p => {
          const state = invited[p.userId]
          return (
            <div key={p.userId} className="flex items-center justify-between gap-2 rounded-md border-[1.5px] border-[rgba(46,32,20,.25)] bg-[#f4ecdb] px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium text-[#2e2014]">
                {p.username || `Joueur ${p.userId}`}
              </span>
              <button
                type="button"
                onClick={() => invite(p.userId)}
                disabled={state === "sending" || state === "done"}
                className="flex shrink-0 items-center gap-1 rounded-full border-2 border-[#2e2014] px-3 py-1 text-xs font-bold text-[#f4ecdb] shadow-[2px_2px_0_#2e2014] transition disabled:opacity-60"
                style={{ background: state === "done" ? "#7d9471" : accent }}
              >
                {state === "done" ? (<><Check className="h-3 w-3" /> Invité</>) :
                 state === "sending" ? "..." :
                 state === "error" ? "Réessayer" : "Inviter"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
