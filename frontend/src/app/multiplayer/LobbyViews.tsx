"use client"

import { useCallback, useMemo, useState } from "react"
import { ArrowLeft, Heart, PartyPopper, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GameModeConfig } from "@/lib/gameModes"

const UUID_LIKE_REGEX = /^[0-9a-fA-F-]{10,}$/
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
  const showScores = modeConfig.game.scoring
  return (
    <div className={`rounded-md border-2 border-[#2e2014] bg-[#ece1c8] shadow-[4px_4px_0_rgba(46,32,20,.18)] ${compact ? "p-5" : "p-7"} text-left`}>
      <h3 className={`font-bold uppercase tracking-[0.22em] text-[#8a7558] ${variant === "large" ? "text-sm" : "text-[11px]"}`}>
        {title}
      </h3>
      <ul className={`mt-4 space-y-3 text-[#2e2014] ${variant === "large" ? "text-base" : "text-sm"}`}>
        {participants.map(participant => (
          <li
            key={participant.user_id}
            className="flex items-baseline gap-2 px-1 py-1"
          >
            <span className="font-semibold">{participant.username || `Player #${participant.user_id}`}</span>
            <span aria-hidden className="flex-1 border-b-2 border-dotted border-[rgba(46,32,20,.45)]" />
            {showScores ? (
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b573f]">
                {scores[participant.user_id]?.score ?? 0} pts · {scores[participant.user_id]?.accuracy ?? 0}%
              </span>
            ) : (
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#7d9471]">Présent</span>
            )}
          </li>
        ))}
        {participants.length === 0 && (
          <li className="rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
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
  isHost = true,
}: {
  leaderboard: Array<{ userId: number; username: string | null; score: number; accuracy: number; avatar?: string | null }>
  tracks: SoloTrack[]
  currentUserId?: number | null
  onReturn: () => void
  onReplay: () => void
  accentColor?: string
  isHost?: boolean
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

  const accent = accentColor ?? "#c65133"

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
    // likes.audio_source_id est un UUID FK : ne liker QUE si on a un vrai
    // audioSourceId (un track_id Spotify ferait planter l'INSERT en 500).
    const uuid =
      track.audioSourceId ??
      (UUID_LIKE_REGEX.test(track.track_id) ? track.track_id : null)
    if (!uuid || liking[uuid]) return
    setLiking(prev => ({ ...prev, [uuid]: true }))
    try {
      await api.addLike(currentUserId, uuid)
      setLikedIds(prev => new Set(prev).add(uuid))
    } catch (err) {
      console.error("like_track_failed", err)
    } finally {
      setLiking(prev => ({ ...prev, [uuid]: false }))
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-4 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:p-7">
      <style>{`
        @keyframes res-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes res-pop { from { opacity: 0; transform: scale(.4) rotate(-90deg) } to { opacity: 1; transform: scale(1) rotate(0) } }
        .res-rise { animation: res-rise .55s cubic-bezier(.22,1,.36,1) backwards }
        .res-pop { animation: res-pop .6s cubic-bezier(.22,1,.36,1) backwards }
      `}</style>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="res-rise flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: accent, animationDelay: "0.05s" }}>
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: accent }} />
          Fin de la face · Résultats
        </p>
        {podium[0] && (
          <>
            <div
              className="res-pop relative grid h-28 w-28 place-items-center rounded-full border-[3px] border-[#2e2014] shadow-[5px_5px_0_rgba(46,32,20,.18)]"
              style={{
                background: "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)",
                animation: "res-pop .6s cubic-bezier(.22,1,.36,1) backwards, vinyl-spin 9s linear 0.6s infinite",
                animationDelay: "0.2s",
              }}
            >
              <span className="absolute inset-[30%] grid place-items-center rounded-full border-[3px] border-[#2e2014] bg-[#e0a32e] font-display text-2xl font-bold text-[#2e2014]">
                {initials(podium[0].username, podium[0].userId)}
              </span>
              <span className="absolute inset-[46%] z-10 rounded-full border-2 border-[#2e2014] bg-[#f4ecdb]" />
            </div>
            <h2 className="res-rise font-display text-4xl font-bold leading-tight text-[#2e2014]" style={{ animationDelay: "0.45s" }}>
              {podium[0].username || `Joueur ${podium[0].userId}`}
            </h2>
            <p className="res-rise text-sm text-[#6b573f]" style={{ animationDelay: "0.6s" }}>
              {podium[0].score > 0
                ? `${podium[0].score} ${podium[0].score > 1 ? "bonnes réponses" : "bonne réponse"} · ${podium[0].accuracy}% de précision · disque d'or de la session`
                : "Personne n'a marqué. On rejoue ?"}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col items-center">
        <div className="grid w-full max-w-4xl grid-cols-1 items-end gap-4 md:grid-cols-3 md:gap-6">
          {podiumOrdered.map((entry, idx) => {
            const rank = idx === 1 ? 1 : idx === 0 ? 2 : 3
            const height = rank === 1 ? "min-h-[13rem]" : rank === 2 ? "min-h-[11rem]" : "min-h-[10rem]"
            const colOrder = rank === 1 ? "md:col-start-2" : rank === 2 ? "md:col-start-1" : "md:col-start-3"
            const borderColor = rank === 1 ? accent : "#2e2014"
            return (
              <div key={entry!.userId} className={`res-rise flex flex-col items-center gap-3 ${colOrder}`} style={{ animationDelay: `${0.75 + idx * 0.15}s` }}>
                <div
                  className={`relative flex items-center justify-center overflow-hidden rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] text-xl font-bold text-[#2e2014] ${rank === 1 ? "h-24 w-24" : "h-20 w-20"}`}
                >
                  {rank === 1 && (
                    <span
                      aria-hidden
                      className="absolute -top-2 -right-2 z-10 grid h-7 w-7 place-items-center rounded-full border-2 border-[#2e2014] bg-[#e0a32e] text-[9px] font-bold text-[#2e2014]"
                    >
                      N°1
                    </span>
                  )}
                  {entry!.avatar ? (
                    <img src={entry!.avatar ?? ""} alt={entry!.username ?? `Joueur ${entry!.userId}`} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials(entry!.username, entry!.userId)}</span>
                  )}
                </div>
                <div
                  className={`flex w-48 flex-col items-center justify-end rounded-md border-2 px-4 pb-4 pt-5 text-[#2e2014] ${height}`}
                  style={{ borderColor, backgroundColor: "#f4ecdb", boxShadow: rank === 1 ? `4px 4px 0 ${accent}` : "4px 4px 0 rgba(46,32,20,.18)" }}
                >
                  <div className="font-display text-4xl font-black" style={{ color: rank === 1 ? accent : "#8a7558" }}>
                    {rank}
                  </div>
                  <div className="mt-1 text-base font-semibold text-[#2e2014]">{entry!.username || `Joueur ${entry!.userId}`}</div>
                  <div className="text-sm text-[#6b573f]">{entry!.score} pts • {entry!.accuracy}%</div>
                </div>
              </div>
            )
          })}
        </div>
        {podium.length === 0 && <div className="text-sm text-[#8a7558]">Aucun score.</div>}
      </div>

      {rest.length ? (
        <div className="rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0]">
          <table className="w-full text-left text-sm text-[#2e2014]">
            <thead className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              <tr>
                <th className="px-6 py-3">Rank</th>
                <th className="px-6 py-3">Player</th>
                <th className="px-6 py-3 text-right">Score</th>
                <th className="px-6 py-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry, index) => (
                <tr key={entry.userId} className="border-t border-dotted border-[rgba(46,32,20,.45)]">
                  <td className="px-6 py-3">{index + 4}</td>
                  <td className="px-6 py-3">{entry.username || `Player #${entry.userId}`}</td>
                  <td className="px-6 py-3 text-right font-semibold text-[#2e2014]">{entry.score}</td>
                  <td className="px-6 py-3 text-right text-[#6b573f]">{entry.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] p-5 text-left">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#2e2014]">Titres joués</h3>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Joueur source affiché et ajout aux likes</p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">{tracks.length} titre(s)</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tracks.length === 0 ? (
            <p className="text-sm text-[#8a7558]">Aucun titre disponible.</p>
          ) : (
            tracks.map((track, idx) => {
              const owner = resolveContributor(track)
              const id =
                track.audioSourceId ?? (UUID_LIKE_REGEX.test(track.track_id) ? track.track_id : null)
              const isLiking = liking[id ?? ""] || false
              const isLiked = likedIds.has(id ?? "")
              return (
                <div
                  key={`${id}-${idx}`}
                  className="flex items-center justify-between rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] px-4 py-3 text-sm"
                >
                  <div className="flex flex-col gap-1">
                    <div className="font-semibold text-[#2e2014]">{track.title}</div>
                    <div className="text-xs text-[#6b573f]">{track.artist}</div>
                    <div className="flex items-center gap-2 text-[11px] text-[#8a7558]">
                      <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#f4ecdb] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b573f]">
                        Joueur
                      </span>
                      <span className="text-[#2e2014]">{owner ?? "Inconnu"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={!id || isLiking}
                      onClick={() => handleLike(track)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] transition ${isLiked ? "border-[#c65133] bg-[#c65133] text-[#f4ecdb]" : "border-[rgba(46,32,20,.35)] bg-[#f4ecdb] text-[#2e2014] hover:border-[#c65133] hover:text-[#c65133]"}`}
                      title="Ajouter aux likes"
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                    </button>
                    <span className="text-xs text-[#8a7558]">#{idx + 1}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          onClick={onReturn}
          className="gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-sm font-bold text-[#2e2014] hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour modes
        </Button>
        <Button
          variant="outline"
          onClick={onReplay}
          disabled={!isHost}
          className="gap-2 rounded-full border-2 bg-transparent px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: accent, color: accent }}
        >
          <ShieldCheck className="h-4 w-4" />
          {isHost ? "Rejouer" : "L'hôte peut relancer"}
        </Button>
      </div>
    </section>
  )
}
