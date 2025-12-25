"use client"

import { useCallback, useMemo, useState } from "react"
import { ArrowLeft, Heart, PartyPopper, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GameModeConfig } from "@/lib/gameModes"
import { api } from "@/lib/api"
import type { MultiplayerParticipant, SoloTrack } from "@/lib/types"

export function ParticipantPanel({
  participants,
  scores,
  title,
  compact,
  modeConfig,
  variant = "default",
}: {
  participants: MultiplayerParticipant[]
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  title: string
  compact?: boolean
  modeConfig: GameModeConfig
  variant?: "default" | "large"
}) {
  const showScores = modeConfig.game.scoring !== false
  return (
    <div className={`rounded-3xl border border-white/10 bg-black/60 ${compact ? "p-6" : "p-8"} text-left backdrop-blur`}>
      <h3 className={`font-semibold uppercase tracking-[0.4em] text-slate-400 ${variant === "large" ? "text-base" : "text-sm"}`}>
        {title}
      </h3>
      <ul className={`mt-4 space-y-3 text-slate-200 ${variant === "large" ? "text-base" : "text-sm"}`}>
        {participants.map(participant => (
          <li
            key={participant.user_id}
            className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
          >
            <span>{participant.username || `Player #${participant.user_id}`}</span>
            {showScores ? (
              <span className="text-xs uppercase tracking-[0.4em] text-slate-400">
                {scores[participant.user_id]?.score ?? 0} pts · {scores[participant.user_id]?.accuracy ?? 0}%
              </span>
            ) : (
              <span className="text-xs uppercase tracking-[0.4em] text-slate-400">Présent</span>
            )}
          </li>
        ))}
        {participants.length === 0 && (
          <li className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.4em] text-slate-400">
            On arrive…
          </li>
        )}
      </ul>
    </div>
  )
}

export function ResultsView({
  leaderboard,
  tracks,
  currentUserId,
  onReturn,
  onReplay,
}: {
  leaderboard: Array<{ userId: number; username: string | null; score: number; accuracy: number; avatar?: string | null }>
  tracks: SoloTrack[]
  currentUserId?: number | null
  onReturn: () => void
  onReplay: () => void
}) {
  const [liking, setLiking] = useState<Record<string, boolean>>({})
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())

  const podium = leaderboard.slice(0, 3)
  const podiumOrdered = [podium[1], podium[0], podium[2]].filter(Boolean)
  const rest = leaderboard.slice(3)

  const contributorById = useMemo(() => {
    const map = new Map<number, string>()
    leaderboard.forEach(entry => {
      const displayName = entry.username?.trim() || `Joueur ${entry.userId}`
      map.set(entry.userId, displayName)
    })
    return map
  }, [leaderboard])

  const resolveContributor = useCallback(
    (track: SoloTrack) => {
      const meta = (track.metadata ?? {}) as Record<string, unknown>
      const ownerUsername = (meta.owner_username as string | undefined)?.trim()
      const ownerIdRaw = (meta.owner_user_id as number | string | undefined) ?? (meta.user_id as number | string | undefined)
      const ownerId = typeof ownerIdRaw === "string" ? Number(ownerIdRaw) : ownerIdRaw
      if (ownerUsername) return ownerUsername
      if (ownerId) return contributorById.get(ownerId) ?? `Joueur ${ownerId}`
      return null
    },
    [contributorById]
  )

  const initials = (name: string | null | undefined, id: number) => {
    const safe = name?.trim()
    if (safe) {
      const parts = safe.split(" ").filter(Boolean)
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      return safe.slice(0, 2).toUpperCase()
    }
    return `#${id}`.slice(0, 2)
  }

  const handleLike = async (track: SoloTrack) => {
    const id = track.audioSourceId ?? track.track_id
    if (!id || liking[id]) return
    setLiking(prev => ({ ...prev, [id]: true }))
    try {
      await api.addLike(currentUserId, track.audioSourceId ?? track.track_id)
      setLikedIds(prev => new Set(prev).add(id))
    } catch (err) {
      console.error("like_track_failed", err)
    } finally {
      setLiking(prev => ({ ...prev, [id]: false }))
    }
  }

  return (
    <section className="surface flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/60 p-7 text-center shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <PartyPopper className="h-5 w-5 text-neon" />
          <span>Bravo ! Voici le podium</span>
        </div>
        <h2 className="text-2xl font-semibold text-white">Résumé de la manche</h2>
      </div>

      <div className="flex flex-col items-center">
        <div className="grid w-full max-w-4xl grid-cols-1 items-end gap-4 md:grid-cols-3 md:gap-6">
          {podiumOrdered.map((entry, idx) => {
            const rank = idx === 1 ? 1 : idx === 0 ? 2 : 3
            const height = rank === 1 ? "h-56" : rank === 2 ? "h-44" : "h-40"
            const gradient =
              rank === 1
                ? "from-amber-400 via-yellow-300 to-orange-400"
                : rank === 2
                  ? "from-slate-200 via-blue-200 to-indigo-400"
                  : "from-amber-700 via-amber-600 to-amber-500"
            const colOrder = rank === 1 ? "md:col-start-2" : rank === 2 ? "md:col-start-1" : "md:col-start-3"
            return (
              <div key={entry!.userId} className={`flex flex-col items-center gap-3 ${colOrder}`}>
                <div
                  className={`relative flex items-center justify-center overflow-hidden rounded-full border-4 border-white/20 bg-white text-xl font-bold text-black shadow-[0_15px_35px_rgba(0,0,0,0.35)] ${rank === 1 ? "h-24 w-24" : "h-20 w-20"}`}
                >
                  {rank === 1 && <span className="absolute -top-5 text-2xl">👑</span>}
                  {entry!.avatar ? (
                    <img src={entry!.avatar ?? ""} alt={entry!.username ?? `Joueur ${entry!.userId}`} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials(entry!.username, entry!.userId)}</span>
                  )}
                </div>
                <div
                  className={`flex w-48 flex-col items-center justify-end rounded-3xl border border-white/10 bg-gradient-to-b ${gradient} px-4 pb-4 pt-6 text-black shadow-[0_25px_70px_rgba(0,0,0,0.35)] ${height}`}
                >
                  <div className="text-4xl font-black drop-shadow-sm text-black/80">{rank}</div>
                  <div className="mt-1 text-base font-semibold text-black">{entry!.username || `Joueur ${entry!.userId}`}</div>
                  <div className="text-sm font-semibold text-black/80">{entry!.score} pts • {entry!.accuracy}%</div>
                </div>
              </div>
            )
          })}
        </div>
        {podium.length === 0 && <div className="text-sm text-slate-400">Aucun score.</div>}
      </div>

      {rest.length ? (
        <div className="rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="text-xs uppercase tracking-[0.4em] text-slate-400">
              <tr>
                <th className="px-6 py-3">Rank</th>
                <th className="px-6 py-3">Player</th>
                <th className="px-6 py-3 text-right">Score</th>
                <th className="px-6 py-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry, index) => (
                <tr key={entry.userId} className="border-t border-white/5">
                  <td className="px-6 py-3">{index + 4}</td>
                  <td className="px-6 py-3">{entry.username || `Player #${entry.userId}`}</td>
                  <td className="px-6 py-3 text-right font-semibold">{entry.score}</td>
                  <td className="px-6 py-3 text-right">{entry.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Titres joués</h3>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Joueur source affiché et ajout aux likes</p>
          </div>
          <span className="text-xs uppercase tracking-[0.35em] text-slate-400">{tracks.length} titres</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tracks.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun titre disponible.</p>
          ) : (
            tracks.map((track, idx) => {
              const owner = resolveContributor(track)
              const id = track.audioSourceId ?? track.track_id
              const isLiking = liking[id ?? ""] || false
              const isLiked = likedIds.has(id ?? "")
              return (
                <div
                  key={`${id}-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex flex-col gap-1">
                    <div className="font-semibold text-white">{track.title}</div>
                    <div className="text-xs text-slate-400">{track.artist}</div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[2px] uppercase tracking-[0.2em] text-[10px] text-slate-300">
                        Joueur
                      </span>
                      <span className="text-slate-200">{owner ?? "Inconnu"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={!id || isLiking}
                      onClick={() => handleLike(track)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 transition hover:border-rose-400/60 hover:text-rose-300 ${isLiked ? "bg-rose-500/20 text-rose-200" : "bg-white/5 text-white"}`}
                      title="Ajouter aux likes"
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                    </button>
                    <span className="text-xs text-slate-400">#{idx + 1}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={onReturn} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to menu
        </Button>
        <Button onClick={onReplay} className="gap-2">
          <ShieldCheck className="h-4 w-4" />
          New lobby
        </Button>
      </div>
    </section>
  )
}
