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
    <div className={`rounded-2xl border border-white/10 bg-[#0c0c0c] ${compact ? "p-5" : "p-7"} text-left`}>
      <h3 className={`font-semibold uppercase tracking-[0.3em] text-white/60 ${variant === "large" ? "text-base" : "text-sm"}`}>
        {title}
      </h3>
      <ul className={`mt-4 space-y-3 text-white/85 ${variant === "large" ? "text-base" : "text-sm"}`}>
        {participants.map(participant => (
          <li
            key={participant.user_id}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3"
          >
            <span>{participant.username || `Player #${participant.user_id}`}</span>
            {showScores ? (
              <span className="text-xs uppercase tracking-[0.28em] text-white/60">
                {scores[participant.user_id]?.score ?? 0} pts · {scores[participant.user_id]?.accuracy ?? 0}%
              </span>
            ) : (
              <span className="text-xs uppercase tracking-[0.28em] text-white/60">Présent</span>
            )}
          </li>
        ))}
        {participants.length === 0 && (
          <li className="rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-xs uppercase tracking-[0.28em] text-white/60">
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
  accentColor,
}: {
  leaderboard: Array<{ userId: number; username: string | null; score: number; accuracy: number; avatar?: string | null }>
  tracks: SoloTrack[]
  currentUserId?: number | null
  onReturn: () => void
  onReplay: () => void
  accentColor?: string
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

  const accent = accentColor ?? "#8b5cf6"

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
    <section className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#0c0c0c] p-7 text-center">
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <PartyPopper className="h-5 w-5" style={{ color: accent }} />
          <span>Bravo ! Voici le podium</span>
        </div>
        <h2 className="text-2xl font-semibold text-white">Résumé de la manche</h2>
      </div>

      <div className="flex flex-col items-center">
        <div className="grid w-full max-w-4xl grid-cols-1 items-end gap-4 md:grid-cols-3 md:gap-6">
          {podiumOrdered.map((entry, idx) => {
            const rank = idx === 1 ? 1 : idx === 0 ? 2 : 3
            const height = rank === 1 ? "min-h-[13rem]" : rank === 2 ? "min-h-[11rem]" : "min-h-[10rem]"
            const colOrder = rank === 1 ? "md:col-start-2" : rank === 2 ? "md:col-start-1" : "md:col-start-3"
            const borderColor = rank === 1 ? accent : "rgba(255,255,255,0.2)"
            return (
              <div key={entry!.userId} className={`flex flex-col items-center gap-3 ${colOrder}`}>
                <div
                  className={`relative flex items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-[#0f0f0f] text-xl font-bold text-white ${rank === 1 ? "h-24 w-24" : "h-20 w-20"}`}
                >
                  {rank === 1 && <span className="absolute -top-5 text-2xl">👑</span>}
                  {entry!.avatar ? (
                    <img src={entry!.avatar ?? ""} alt={entry!.username ?? `Joueur ${entry!.userId}`} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials(entry!.username, entry!.userId)}</span>
                  )}
                </div>
                <div
                  className={`flex w-48 flex-col items-center justify-end rounded-2xl border px-4 pb-4 pt-5 text-white ${height}`}
                  style={{ borderColor, backgroundColor: "#0f0f0f" }}
                >
                  <div className="text-4xl font-black" style={{ color: borderColor }}>
                    {rank}
                  </div>
                  <div className="mt-1 text-base font-semibold text-white">{entry!.username || `Joueur ${entry!.userId}`}</div>
                  <div className="text-sm text-white/70">{entry!.score} pts • {entry!.accuracy}%</div>
                </div>
              </div>
            )
          })}
        </div>
        {podium.length === 0 && <div className="text-sm text-white/60">Aucun score.</div>}
      </div>

      {rest.length ? (
        <div className="rounded-2xl border border-white/10 bg-[#0f0f0f]">
          <table className="w-full text-left text-sm text-white/80">
            <thead className="text-xs uppercase tracking-[0.28em] text-white/60">
              <tr>
                <th className="px-6 py-3">Rank</th>
                <th className="px-6 py-3">Player</th>
                <th className="px-6 py-3 text-right">Score</th>
                <th className="px-6 py-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry, index) => (
                <tr key={entry.userId} className="border-t border-white/10">
                  <td className="px-6 py-3">{index + 4}</td>
                  <td className="px-6 py-3">{entry.username || `Player #${entry.userId}`}</td>
                  <td className="px-6 py-3 text-right font-semibold text-white">{entry.score}</td>
                  <td className="px-6 py-3 text-right text-white/70">{entry.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5 text-left">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Titres joués</h3>
            <p className="text-xs uppercase tracking-[0.28em] text-white/60">Joueur source affiché et ajout aux likes</p>
          </div>
          <span className="text-xs uppercase tracking-[0.28em] text-white/60">{tracks.length} titres</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tracks.length === 0 ? (
            <p className="text-sm text-white/60">Aucun titre disponible.</p>
          ) : (
            tracks.map((track, idx) => {
              const owner = resolveContributor(track)
              const id = track.audioSourceId ?? track.track_id
              const isLiking = liking[id ?? ""] || false
              const isLiked = likedIds.has(id ?? "")
              return (
                <div
                  key={`${id}-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm"
                >
                  <div className="flex flex-col gap-1">
                    <div className="font-semibold text-white">{track.title}</div>
                    <div className="text-xs text-white/70">{track.artist}</div>
                    <div className="flex items-center gap-2 text-[11px] text-white/60">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[2px] uppercase tracking-[0.2em] text-[10px] text-white/70">
                        Joueur
                      </span>
                      <span className="text-white/80">{owner ?? "Inconnu"}</span>
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
                    <span className="text-xs text-white/60">#{idx + 1}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={onReturn} className="gap-2 rounded-full border-white/15 px-4 py-2 text-sm text-white">
          <ArrowLeft className="h-4 w-4" />
          Retour modes
        </Button>
        <Button
          variant="outline"
          onClick={onReplay}
          className="gap-2 rounded-full px-4 py-2 text-sm"
          style={{ borderColor: accent, color: accent }}
        >
          <ShieldCheck className="h-4 w-4" />
          Nouveau lobby
        </Button>
      </div>
    </section>
  )
}
