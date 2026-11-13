"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { api } from "@/lib/api"
import { shareInvite } from "./lobbyKit"

type RecentPlayer = { userId: number; username: string | null; lastPlayed: string }

/**
 * "Rejoue avec" : les joueurs croises lors des 30 derniers jours, avec un bouton
 * pour les reinviter dans la salle courante. Rend null s'il n'y a personne
 * (premiere partie) pour ne pas encombrer le lobby.
 *
 * Depuis le 30/09 il vit dans la banniere de la salle, sous "qui est la" : des
 * places en pointilles, a remplir. Avant, c'etait une carte sous la musique,
 * que Tym trouvait mal amenee.
 *
 * T34 (11/11) : « Inviter » passait par les invitations entre amis, refusees a
 * tous (personne n'a d'amis sur Blindz, et aucun ecran ne les recoit). Il
 * partage maintenant le lien de la salle, comme le gros bouton « Inviter ».
 */
export function RecentPlayers({
  roomCode,
  link,
  accent,
  tone = "light",
  exclude = [],
}: {
  roomCode: string
  /** Lien qui fait entrer dans la salle (le meme que le QR). */
  link: string
  accent: string
  /** Couleur de la banniere : "dark" (encre, a distance) ou "light" (or, table). */
  tone?: "dark" | "light"
  /** Joueurs deja dans la salle : inutile de les reinviter. */
  exclude?: number[]
}) {
  const [players, setPlayers] = useState<RecentPlayer[]>([])
  const [invited, setInvited] = useState<Record<number, "shared" | "copied">>({})
  const [copyFailed, setCopyFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api.recentPlayers()
      .then(res => { if (alive) setPlayers(res.players ?? []) })
      .catch(err => console.error("recent_players_failed", err)) // pas bloquant : le bloc reste masque
    return () => { alive = false }
  }, [])

  const invite = async (userId: number) => {
    const res = await shareInvite(roomCode, link)
    setCopyFailed(res === "failed")
    if (res === "shared" || res === "copied") setInvited(prev => ({ ...prev, [userId]: res }))
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
                onClick={() => void invite(p.userId)}
                className="flex shrink-0 items-center gap-1 rounded-full border-2 border-[#2e2014] px-2.5 py-0.5 text-[11px] font-bold text-[#f4ecdb] transition hover:brightness-110"
                style={{ background: state ? "#7d9471" : btnBg }}
              >
                {state === "copied" ? (<><Check className="h-3 w-3" /> Lien copié</>) :
                 state === "shared" ? (<><Check className="h-3 w-3" /> Envoyé</>) : "Inviter"}
              </button>
            </li>
          )
        })}
      </ul>
      {copyFailed ? (
        <p className="mb-0 mt-2 rounded bg-[#f4ecdb] px-2 py-1 text-xs font-bold text-[#9c2f1d]">
          Copie impossible ici, donne-leur le code {roomCode}.
        </p>
      ) : null}
    </div>
  )
}
