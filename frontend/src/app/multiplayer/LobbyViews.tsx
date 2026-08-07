"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, PartyPopper, ShieldCheck, Share2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfettiBurst } from "@/components/game/ConfettiBurst"
import { InstallApp } from "@/components/InstallApp"
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
  isGuest = false,
  roomCode,
}: {
  leaderboard: Array<{
    userId: number
    username: string | null
    score: number
    accuracy: number
    avatar?: string | null
    bestStreak?: number
    totalReactionMs?: number
    correct?: number
  }>
  tracks: SoloTrack[]
  currentUserId?: number | null
  onReturn: () => void
  onReplay: () => void
  accentColor?: string
  isHost?: boolean
  isGuest?: boolean
  /** Code de la salle : sert a recuperer le bilan manche par manche. */
  roomCode?: string | null
}) {

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

  // "Titres de la soiree" : de quoi se chambrer meme quand on finit dernier.
  // Bilan serveur : piege de la soiree + vrais temps de reponse par joueur.
  // Declare avant les awards, qui s'en servent.
  const [trap, setTrap] = useState<{ title: string | null; artist: string | null } | null>(null)
  const [serverTimes, setServerTimes] = useState<Map<number, number>>(new Map())

  const awards = useMemo(() => {
    const named = (id: number) => leaderboard.find(e => e.userId === id)?.username || `Joueur ${id}`
    const out: Array<{ emoji: string; label: string; who: string; detail: string }> = []

    // Le plus rapide : moyenne REELLE des temps de reponse (source serveur).
    // Sans ca on divisait le temps total, penalites de non-reponse comprises,
    // par le nombre de manches parfaites -> des "40s" sur une manche de 20s.
    const speedy = [...serverTimes.entries()]
      .filter(([id]) => leaderboard.some(e => e.userId === id))
      .map(([id, avg]) => ({ id, avg }))
      .sort((a, b) => a.avg - b.avg)[0]
    if (speedy) out.push({ emoji: "⚡", label: "Le plus rapide", who: named(speedy.id), detail: `${(speedy.avg / 1000).toFixed(1)}s en moyenne` })

    // Meilleure serie de bonnes reponses d'affilee.
    const streaky = [...leaderboard].sort((a, b) => (b.bestStreak ?? 0) - (a.bestStreak ?? 0))[0]
    if (streaky && (streaky.bestStreak ?? 0) >= 2) {
      out.push({ emoji: "🔥", label: "Meilleure série", who: named(streaky.userId), detail: `${streaky.bestStreak} d'affilée` })
    }

    // Le DJ : celui qui a ramene le plus de titres joues ce soir.
    const counts = new Map<number, number>()
    tracks.forEach(t => {
      const meta = (t.metadata ?? {}) as Record<string, unknown>
      const raw = (meta.owner_user_id as number | string | undefined) ?? undefined
      const id = typeof raw === "string" ? Number(raw) : raw
      if (id && leaderboard.some(e => e.userId === id)) counts.set(id, (counts.get(id) ?? 0) + 1)
    })
    const dj = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (dj && dj[1] > 0) out.push({ emoji: "🎧", label: "DJ de la soirée", who: named(dj[0]), detail: `${dj[1]} titre${dj[1] > 1 ? "s" : ""}` })

    return out
  }, [leaderboard, tracks, serverTimes])

  // Le piege (titre que personne n'a trouve) a exactement le meme format qu'une
  // distinction : on le met dans la meme rangee plutot que dans un bloc a part.
  const highlights = useMemo(
    () =>
      trap?.title
        ? [
            ...awards,
            {
              emoji: "🙈",
              label: "Le piège de la soirée",
              who: trap.title,
              detail: `${trap.artist ?? ""} · personne ne l'a trouvé`,
            },
          ]
        : awards,
    [awards, trap]
  )

  // Ta ligne perso : indispensable quand on finit hors du podium.
  const myRank = currentUserId ? leaderboard.findIndex(e => e.userId === currentUserId) : -1
  const me = myRank >= 0 ? leaderboard[myRank] : null

  useEffect(() => {
    if (!roomCode) return
    let alive = true
    api.roomRounds(roomCode)
      .then(res => {
        if (!alive) return
        // "correct" = au moins 1 point marque (et non titre+artiste parfaits),
        // "answers" = reponses reellement tapees. Le piege, c'est une manche
        // que des gens ont tentee sans que personne ne marque quoi que ce soit.
        const missed = (res.rounds ?? []).filter(r => r.answers > 0 && r.correct === 0)
        if (missed.length) setTrap({ title: missed[0].title, artist: missed[0].artist })
        const times = new Map<number, number>()
        ;(res.players ?? []).forEach(p => {
          if (typeof p.avgMs === "number" && p.answered > 0) times.set(p.userId, p.avgMs)
        })
        setServerTimes(times)
      })
      .catch(() => { /* pas bloquant */ })
    return () => { alive = false }
  }, [roomCode])

  // Recap perso de la partie (visible seulement si on a joue).
  const myStats = me
    ? [
        { label: "Bonnes réponses", value: `${me.correct ?? 0}` },
        ...((me.bestStreak ?? 0) >= 2 ? [{ label: "Meilleure série", value: `${me.bestStreak}` }] : []),
        // Temps moyen : valeur serveur (vraies manches repondues), pas un ratio bancal.
        ...(serverTimes.has(me.userId)
          ? [{ label: "Temps moyen", value: `${((serverTimes.get(me.userId) ?? 0) / 1000).toFixed(1)}s` }]
          : []),
      ]
    : []

  const [tracksOpen, setTracksOpen] = useState(false)

  const [shared, setShared] = useState(false)
  const handleShare = async () => {
    const winner = podium[0]
    const text = winner
      ? `${winner.username || "Le vainqueur"} remporte le blind test sur Blindz ! ${me ? `Moi : ${myRank + 1}e avec ${me.score} pts.` : ""}`
      : "On vient de faire un blind test sur Blindz !"
    const url = "https://blindz.app"
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Blindz", text, url })
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        setShared(true)
        setTimeout(() => setShared(false), 2500)
      }
    } catch { /* partage annule : rien a faire */ }
  }

  const initials = (name: string | null | undefined, id: number) => {
    const safe = name?.trim()
    if (safe) {
      const parts = safe.split(" ").filter(Boolean)
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      return safe.slice(0, 2).toUpperCase()
    }
    return `#${id}`.slice(0, 2)
  }


  return (
    <section className="relative flex flex-col gap-5 overflow-hidden rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-4 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:p-7">
      <ConfettiBurst />
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
              {/* score = des POINTS (2 par manche parfaite), pas un nombre de bonnes reponses */}
              {podium[0].score > 0
                ? `${podium[0].score} ${podium[0].score > 1 ? "points" : "point"} · ${podium[0].accuracy}% de précision · disque d'or de la session`
                : "Personne n'a marqué. On rejoue ?"}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col items-center">
        {/* Desktop : rangee centree. La grille en 3 colonnes fixes laissait un trou
            beant des qu'on n'etait pas exactement 3 joueurs. */}
        <div className="flex w-full max-w-4xl flex-col gap-4 md:flex-row md:items-end md:justify-center md:gap-6">
          {podiumOrdered.map((entry, idx) => {
            const rank = idx === 1 ? 1 : idx === 0 ? 2 : 3
            // Mobile : marches basses et pastilles reduites (le podium empile
            // prenait presque un ecran entier). Desktop garde la hauteur d'origine.
            const height = rank === 1 ? "min-h-[5rem] md:min-h-[13rem]" : rank === 2 ? "min-h-[4.5rem] md:min-h-[11rem]" : "min-h-[4.5rem] md:min-h-[10rem]"
            const colOrder = rank === 1 ? "md:order-2" : rank === 2 ? "md:order-1" : "md:order-3"
            const borderColor = rank === 1 ? accent : "#2e2014"
            return (
              <div key={entry!.userId} className={`res-rise flex flex-row items-center gap-3 md:flex-col ${colOrder}`} style={{ animationDelay: `${0.75 + idx * 0.15}s` }}>
                <div
                  className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] font-bold text-[#2e2014] ${rank === 1 ? "h-14 w-14 text-base md:h-24 md:w-24 md:text-xl" : "h-12 w-12 text-sm md:h-20 md:w-20 md:text-xl"}`}
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
                  className={`flex w-full flex-row items-center gap-3 rounded-md border-2 px-4 py-3 text-left text-[#2e2014] md:w-48 md:flex-col md:justify-end md:px-4 md:pb-4 md:pt-5 md:text-center ${height}`}
                  style={{ borderColor, backgroundColor: "#f4ecdb", boxShadow: rank === 1 ? `4px 4px 0 ${accent}` : "4px 4px 0 rgba(46,32,20,.18)" }}
                >
                  <div className="font-display text-2xl font-black md:text-4xl" style={{ color: rank === 1 ? accent : "#8a7558" }}>
                    {rank}
                  </div>
                  <div className="min-w-0 flex-1 md:flex-none">
                    <div className="truncate text-base font-semibold text-[#2e2014] md:mt-1">{entry!.username || `Joueur ${entry!.userId}`}</div>
                    <div className="text-sm text-[#6b573f]">{entry!.score} pts • {entry!.accuracy}%</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {podium.length === 0 && <div className="text-sm text-[#8a7558]">Aucun score.</div>}
      </div>

      {/* Titres de la soiree : chacun repart avec quelque chose. Le piege est du
          meme format, il tient donc dans la meme rangee au lieu de trainer tout
          seul en bandeau pleine largeur plus bas. */}
      {highlights.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {highlights.map(a => (
            <div
              key={a.label}
              className="res-rise flex items-center gap-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-3 py-2.5 text-left sm:min-w-[14rem] sm:max-w-sm sm:flex-1"
              style={{ animationDelay: "1.1s" }}
            >
              <span className="text-xl leading-none">{a.emoji}</span>
              <div className="min-w-0">
                <p className="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">{a.label}</p>
                <p className="m-0 truncate font-display text-sm font-semibold text-[#2e2014]">{a.who}</p>
                <p className="m-0 truncate text-[11px] text-[#6b573f]">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ta place, quand tu n'es pas sur le podium */}
      {me && myRank >= 3 && (
        <div
          className="flex items-center justify-between gap-3 rounded-md border-2 px-4 py-3 text-left"
          style={{ borderColor: accent, background: `${accent}14` }}
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#2e2014] font-display text-sm font-bold text-[#2e2014]" style={{ background: accent }}>
              {myRank + 1}
            </span>
            <div>
              <p className="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">Ta place</p>
              <p className="m-0 font-display text-base font-semibold text-[#2e2014]">{me.username || "Toi"}</p>
            </div>
          </div>
          <p className="m-0 font-display text-lg font-bold text-[#2e2014]">{me.score} pts</p>
        </div>
      )}

      {rest.length ? (
        <div className="overflow-x-auto rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0]">
          <table className="w-full text-left text-sm text-[#2e2014]">
            <thead className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              <tr>
                <th className="px-6 py-3">Place</th>
                <th className="px-6 py-3">Joueur</th>
                <th className="px-6 py-3 text-right">Score</th>
                <th className="px-6 py-3 text-right">Précision</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry, index) => (
                <tr
                  key={entry.userId}
                  className="border-t border-dotted border-[rgba(46,32,20,.45)]"
                  style={entry.userId === currentUserId ? { background: `${accent}12` } : undefined}
                >
                  <td className="px-6 py-3">{index + 4}</td>
                  <td className="px-6 py-3">{entry.username || `Joueur ${entry.userId}`}</td>
                  <td className="px-6 py-3 text-right font-semibold text-[#2e2014]">{entry.score}</td>
                  <td className="px-6 py-3 text-right text-[#6b573f]">{entry.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Recap perso de la partie */}
      {myStats.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {myStats.map(s => (
            <div key={s.label} className="rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] px-2 py-2.5 text-center">
              <p className="m-0 font-display text-xl font-bold text-[#2e2014]">{s.value}</p>
              <p className="m-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[#8a7558]">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Titres joues : replies par defaut (la liste mangeait tout l'ecran) */}
      <div className="rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0] p-4 text-left sm:p-5">
        <button
          type="button"
          onClick={() => setTracksOpen(o => !o)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={tracksOpen}
        >
          <div className="min-w-0">
            <h3 className="m-0 font-display text-lg font-semibold text-[#2e2014]">Titres joués</h3>
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">{tracks.length} titre(s) · qui les a ramenés</p>
          </div>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-[#6b573f] transition-transform ${tracksOpen ? "rotate-180" : ""}`}
          />
        </button>
        <div className={`grid gap-2 sm:grid-cols-2 ${tracksOpen ? "mt-4" : "hidden"}`}>
          {tracks.length === 0 ? (
            <p className="text-sm text-[#8a7558]">Aucun titre disponible.</p>
          ) : (
            tracks.map((track, idx) => {
              const owner = resolveContributor(track)
              const id =
                track.audioSourceId ?? (UUID_LIKE_REGEX.test(track.track_id) ? track.track_id : null)
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
                    <span className="text-xs text-[#8a7558]">#{idx + 1}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {isGuest && (
        <div className="mx-auto mb-5 flex max-w-md flex-col items-center gap-1.5 rounded-2xl border-2 border-[#2e2014] bg-[#efe5d0] px-5 py-4 text-center shadow-[4px_4px_0_rgba(46,32,20,.14)]">
          <p className="m-0 font-display text-base font-semibold text-[#2e2014]">Garde ton score</p>
          <p className="m-0 text-[13px] text-[#6b573f]">Tes parties sont gardées sur cet appareil. Un pseudo et un mot de passe suffisent pour les retrouver sur ton ordi ou un autre téléphone.</p>
          <Link
            href="/auth/login"
            className="mt-1.5 rounded-full border-2 border-[#2e2014] bg-[#c65133] px-5 py-2 text-sm font-bold text-[#f4ecdb] shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]"
          >
            Crée un compte
          </Link>
        </div>
      )}

      {/* Fin de partie = le meilleur moment pour proposer l'install (les gens viennent de jouer) */}
      <div className="mx-auto mb-5 max-w-md">
        <InstallApp />
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button
          variant="outline"
          onClick={handleShare}
          className="gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-sm font-bold text-[#2e2014] hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          <Share2 className="h-4 w-4" />
          {shared ? "Copié !" : "Partager"}
        </Button>
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
