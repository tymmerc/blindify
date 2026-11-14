"use client"

import { useState } from "react"
import type { GameHistoryEntry } from "@/lib/types"
import { formatGameDate, gameResultLine, modeLabel } from "@/lib/accountView"

const FIRST_SHOWN = 5
const COVERS_SHOWN = 6

// Dernieres parties du joueur (20 au plus cote serveur). Les titres d'une partie
// ne sont donnes par le serveur qu'une fois la partie finie (anti-triche).
export function RecentGames({ games }: { games: GameHistoryEntry[] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? games : games.slice(0, FIRST_SHOWN)

  return (
    <div>
      <ul className="divide-y divide-dotted divide-[rgb(var(--c-line)/.35)] border-y border-dotted border-[rgb(var(--c-line)/.35)]">
        {shown.map(game => (
          <GameRow key={game.id} game={game} />
        ))}
      </ul>
      {games.length > FIRST_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="mt-3 text-sm font-semibold text-ink underline decoration-[rgb(var(--c-ink)/.35)] underline-offset-4 hover:decoration-ink"
        >
          {showAll ? "Voir moins" : `Voir les ${games.length}`}
        </button>
      )}
    </div>
  )
}

function GameRow({ game }: { game: GameHistoryEntry }) {
  const [open, setOpen] = useState(false)
  const hasTracks = game.tracks.length > 0
  const covers = game.tracks.filter(t => t.album_cover).slice(0, COVERS_SHOWN)

  const head = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-display text-base font-semibold text-ink">{modeLabel(game.mode)}</span>
        <span className="shrink-0 font-mono text-[13px] text-ink">{gameResultLine(game)}</span>
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-3 text-xs text-sourd">
        <span>{formatGameDate(game.createdAt)}</span>
        {hasTracks && <span>{open ? "Masquer les titres" : "Voir les titres"}</span>}
      </span>
      {covers.length > 0 && (
        <span className="mt-2 flex" aria-hidden="true">
          {covers.map((track, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${track.title}-${i}`}
              src={track.album_cover ?? ""}
              alt=""
              className="h-7 w-7 rounded-sm border-[1.5px] border-on-ink object-cover"
              style={{ marginLeft: i > 0 ? -6 : 0 }}
            />
          ))}
        </span>
      )}
    </>
  )

  return (
    <li className="py-3">
      {hasTracks ? (
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="block w-full text-left">
          {head}
        </button>
      ) : (
        <div>{head}</div>
      )}
      {open && (
        <ol className="mt-2 space-y-1 pl-1 text-sm">
          {game.tracks.map((track, i) => (
            <li key={`${track.title}-${track.artist}-${i}`} className="flex gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-xs text-sourd">{i + 1}</span>
              <span className="min-w-0 truncate text-ink">
                {track.title} <span className="text-sourd">· {track.artist}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}
