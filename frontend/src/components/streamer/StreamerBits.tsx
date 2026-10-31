"use client"

/**
 * Petites pieces du mode streamer (T5), partagees par la page du streamer,
 * l'overlay OBS et la page viewer : classement en tracklist, carte du reveal,
 * minuteur, podium. Univers Club analogique : papier, encre, ombres dures.
 */
import { useState } from "react"
import { MessageSquare, UserX } from "lucide-react"
import type { StreamerLeaderEntry, StreamerRound } from "@/lib/types"

export const SAGE = "#7d9471"
export const GOLD = "#e0a32e"
export const TERRA = "#c65133"
export const INK = "#2e2014"

export interface LeaderboardProps {
  entries: StreamerLeaderEntry[]
  /** Le viewer qui regarde : sa ligne est soulignee. */
  meId?: string | null
  emptyLabel?: string
  size?: "md" | "lg"
  /** Page du streamer : un bouton « Exclure » par ligne. */
  onKick?: (id: string, pseudo: string) => void
}

/** « Exclure » en deux temps : un clic arme, le second confirme (pas de fenetre du navigateur). */
export function KickButton({ pseudo, onConfirm }: { pseudo: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `Confirmer : exclure ${pseudo}` : `Exclure ${pseudo}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] transition ${armed ? "border-[#9c2f1d] bg-[#9c2f1d] text-[#f4ecdb]" : "border-[#2e2014]/40 text-[#6b573f] hover:border-[#9c2f1d] hover:text-[#9c2f1d]"}`}
    >
      <UserX aria-hidden className="h-3 w-3" /> {armed ? "Confirmer" : "Exclure"}
    </button>
  )
}

/** « Face B · Classement » : rang, pseudo, pointilles, points. */
export function Leaderboard({ entries, meId, emptyLabel = "Personne n'a encore marqué.", size = "md", onKick }: LeaderboardProps) {
  const text = size === "lg" ? "text-xl" : "text-sm"
  if (!entries.length) return <p className={`m-0 text-[#6b573f] ${text}`}>{emptyLabel}</p>
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="streamer-leaderboard">
      {entries.map((e, i) => (
        <li key={e.id} className={`flex items-baseline gap-2 ${text}`}>
          <span className="w-6 shrink-0 font-display font-semibold text-[#8a7558]">{i + 1}</span>
          <span className={`truncate font-semibold text-[#2e2014] ${e.id === meId ? "underline decoration-2 underline-offset-4" : ""}`}>
            {e.pseudo}
          </span>
          {e.source === "chat" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-[#2e2014] px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6b573f]">
              <MessageSquare aria-hidden className="h-3 w-3" /> chat
            </span>
          ) : null}
          <span aria-hidden className="mx-1 min-w-4 flex-1 border-b-2 border-dotted border-[#2e2014]/30" />
          <span className="w-14 shrink-0 text-right font-display font-semibold tabular-nums text-[#2e2014]">{e.score}</span>
          {onKick ? <KickButton pseudo={e.pseudo} onConfirm={() => onKick(e.id, e.pseudo)} /> : null}
        </li>
      ))}
    </ol>
  )
}

/** Pochette, titre, artiste. Seulement apres le reveal : avant, le serveur n'envoie rien. */
export function RevealCard({ track, size = "md" }: { track: StreamerRound | null | undefined; size?: "md" | "lg" }) {
  if (!track?.title) return null
  const cover = size === "lg" ? "h-40 w-40" : "h-20 w-20"
  return (
    <div className="flex items-center gap-4" data-testid="streamer-reveal">
      {track.albumCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.albumCover} alt="" className={`${cover} shrink-0 rounded-md border-2 border-[#2e2014] object-cover shadow-[3px_3px_0_rgba(46,32,20,.25)]`} />
      ) : (
        <div aria-hidden className={`${cover} shrink-0 rounded-md border-2 border-[#2e2014] bg-[#2e2014]`} />
      )}
      <div className="min-w-0">
        <p className={`m-0 font-display font-semibold leading-tight text-[#2e2014] ${size === "lg" ? "text-4xl" : "text-xl"}`}>{track.title}</p>
        <p className={`m-0 mt-1 text-[#6b573f] ${size === "lg" ? "text-2xl" : "text-base"}`}>{track.artist}</p>
      </div>
    </div>
  )
}

/** Barre de temps qui se vide, et les secondes. */
export function TimerBar({ seconds, ratio, accent = SAGE, size = "md" }: { seconds: number; ratio: number; accent?: string; size?: "md" | "lg" }) {
  return (
    <div className="flex items-center gap-3" data-testid="streamer-timer">
      <div className={`relative flex-1 overflow-hidden rounded-full border-2 border-[#2e2014] bg-[#efe5d0] ${size === "lg" ? "h-5" : "h-3"}`}>
        <div className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-linear" style={{ width: `${Math.round((1 - ratio) * 100)}%`, background: accent }} />
      </div>
      <span className={`w-12 shrink-0 text-right font-display font-bold tabular-nums text-[#2e2014] ${size === "lg" ? "text-4xl" : "text-xl"}`}>{seconds}s</span>
    </div>
  )
}

/** Les trois premiers, le premier au centre. */
export function StreamerPodium({ entries, size = "md" }: { entries: StreamerLeaderEntry[]; size?: "md" | "lg" }) {
  const top = entries.slice(0, 3)
  if (!top.length) return <p className="m-0 text-center text-sm text-[#6b573f]">Personne n&apos;a marqué cette fois.</p>
  const colors = [GOLD, "#a8b8c8", TERRA]
  const lg = size === "lg"
  const scale = lg ? 1.6 : 1
  const order = [1, 0, 2].filter(rank => top[rank])
  return (
    <div className={`mx-auto grid w-full items-end gap-3 ${lg ? "max-w-3xl" : "max-w-xl"}`} style={{ gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))` }} data-testid="streamer-podium">
      {order.map(rank => {
        const e = top[rank]
        return (
          <div key={e.id} className="flex flex-col items-center gap-2 text-center">
            <span className={`max-w-full truncate font-display font-semibold ${lg ? "text-3xl" : "text-base"}`}>{e.pseudo}</span>
            <div
              className={`flex w-full items-start justify-center rounded-t-md border-2 border-b-0 border-[#2e2014] pt-2 font-display font-bold ${lg ? "text-5xl" : "text-2xl"}`}
              style={{ height: (rank === 0 ? 112 : rank === 1 ? 84 : 64) * scale, background: colors[rank] }}
            >
              {rank + 1}
            </div>
            <span className={`font-bold tabular-nums text-[#6b573f] ${lg ? "text-2xl" : "text-xs"}`}>{e.score} pts</span>
          </div>
        )
      })}
    </div>
  )
}
