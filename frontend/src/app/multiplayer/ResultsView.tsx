"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, DoorOpen, Music, RotateCcw, Share2 } from "lucide-react"
import { InstallApp } from "@/components/InstallApp"
import { EndFeedback } from "@/components/game/EndFeedback"
import { DiscordServerLine } from "@/components/game/DiscordServerLine"
import { GamePodium } from "@/components/game/pacing/GamePodium"
import { PlayerAvatar } from "@/components/ui/PlayerAvatar"
import { api } from "@/lib/api"
import { endMoments, type EndMoments } from "@/lib/endMoments"
import type { FeedbackContext } from "@/lib/feedback"
import { placeLabel, playerTone } from "@/lib/roundPacing"
import type { SoloTrack } from "@/lib/types"

export interface ResultsEntry {
  userId: number
  username: string | null
  score: number
  accuracy: number
  avatar?: string | null
  bestStreak?: number
  totalReactionMs?: number
  correct?: number
}

export interface ResultsViewProps {
  leaderboard: ResultsEntry[]
  tracks: SoloTrack[]
  currentUserId?: number | null
  /** Retour au choix des modes. Absent dans l'Activite Discord : il n'y a pas de menu. */
  onReturn?: () => void
  onReplay: () => void
  /** « Revenir à la salle » (T40) : l'hote ramene tout le monde dans la salle d'attente. */
  onBackToLobby?: () => void
  /** Ouvre « Ta musique » par-dessus l'ecran de fin, sans quitter la salle (T7). */
  onEditMusic?: () => void
  accentColor?: string
  isHost?: boolean
  isGuest?: boolean
  /** Code de la salle : sert a recuperer le bilan manche par manche. */
  roomCode?: string | null
  /** Bloc « Ça s'est bien passé ? » ; null sur l'ecran central d'une partie autour d'une table. */
  feedback?: FeedbackContext | null
}

interface Moment {
  key: string
  label: string
  who: ResultsEntry | null
  main: ReactNode
  detail: string
}

const nameOf = (p: ResultsEntry | null | undefined) => p?.username?.trim() || "Un joueur"

const BUTTON = "inline-flex items-center justify-center gap-2 rounded-md border-2 border-line px-4 py-2.5 text-sm font-bold transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
const SECONDARY = "inline-flex items-center gap-2 rounded-full border-[1.5px] border-line bg-transparent px-4 py-2 text-sm font-bold text-ink transition hover:bg-ink-block hover:text-on-ink"

/** Bilan serveur : moments de la partie et temps de reponse moyens. */
function useRoundSummary(roomCode: string | null | undefined, leaderboard: ResultsEntry[]) {
  const [moments, setMoments] = useState<EndMoments>({ wildest: null, missed: null, picker: null })
  const [times, setTimes] = useState<Map<number, number>>(new Map())
  useEffect(() => {
    if (!roomCode) return
    let alive = true
    api.roomRounds(roomCode)
      .then(res => {
        if (!alive) return
        setMoments(endMoments(res.rounds ?? [], res.responses ?? [], leaderboard))
        const next = new Map<number, number>()
        ;(res.players ?? []).forEach(p => {
          if (typeof p.avgMs === "number" && p.answered > 0) next.set(p.userId, p.avgMs)
        })
        setTimes(next)
      })
      .catch(err => console.warn("bilan_de_fin_indisponible", err))
    return () => { alive = false }
    // Le classement ne change plus une fois la partie finie : on ne refait pas l'appel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode])
  return { moments, times }
}

function buildMoments(leaderboard: ResultsEntry[], moments: EndMoments, times: Map<number, number>): Moment[] {
  const byId = (id: number | null | undefined) => leaderboard.find(e => e.userId === id) ?? null
  const out: Moment[] = []
  if (moments.wildest) {
    const w = moments.wildest
    out.push({
      key: "wildest",
      label: "La réponse la plus à côté",
      who: byId(w.userId),
      main: (
        <span className="underline decoration-wavy decoration-rouge-txt decoration-[1.5px] underline-offset-[5px]">
          « {[w.guessTitle, w.guessArtist].filter(Boolean).join(" · ")} »
        </span>
      ),
      detail: `${nameOf(byId(w.userId))}, pour ${w.title}${w.artist ? ` de ${w.artist}` : ""} (manche ${w.round})`,
    })
  }
  if (moments.missed) {
    const m = moments.missed
    const owner = byId(m.ownerUserId)
    out.push({
      key: "missed",
      label: "Personne ne l'a trouvé",
      who: owner,
      main: <>{m.title}{m.artist ? <span className="text-ink-2"> · {m.artist}</span> : null}</>,
      detail: owner ? `Le morceau de ${nameOf(owner)}, manche ${m.round}` : `Manche ${m.round}`,
    })
  }
  if (moments.picker) {
    const p = moments.picker
    out.push({
      key: "picker",
      label: "Ses morceaux, tout le monde les connaît",
      who: byId(p.userId),
      main: nameOf(byId(p.userId)),
      detail: `${p.found} bonne${p.found > 1 ? "s" : ""} réponse${p.found > 1 ? "s" : ""} sur ses ${p.rounds} morceau${p.rounds > 1 ? "x" : ""}`,
    })
  }
  const speedy = [...times.entries()]
    .filter(([id]) => byId(id))
    .sort((a, b) => a[1] - b[1])[0]
  if (speedy) {
    out.push({ key: "speedy", label: "Le plus rapide", who: byId(speedy[0]), main: nameOf(byId(speedy[0])), detail: `${(speedy[1] / 1000).toFixed(1)} s en moyenne pour répondre` })
  }
  const streaky = [...leaderboard].sort((a, b) => (b.bestStreak ?? 0) - (a.bestStreak ?? 0))[0]
  if (streaky && (streaky.bestStreak ?? 0) >= 2) {
    out.push({ key: "streak", label: "La plus belle série", who: streaky, main: nameOf(streaky), detail: `${streaky.bestStreak} manches trouvées d'affilée` })
  }
  return out
}

function MomentRow({ moment }: { moment: Moment }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-line/20 py-3 last:border-b-0" data-testid={`moment-${moment.key}`}>
      {moment.who ? (
        <PlayerAvatar name={moment.who.username} avatarUrl={moment.who.avatar} className="h-10 w-10 border-2 border-line text-sm" style={playerTone(moment.who.userId)} />
      ) : (
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full border-2 border-line bg-well text-lg">?</span>
      )}
      <div className="min-w-0">
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.2em] text-terra-txt">{moment.label}</p>
        <p className="m-0 mt-0.5 break-words font-display text-lg font-semibold italic leading-snug text-ink">{moment.main}</p>
        <p className="m-0 mt-0.5 text-xs text-ink-2">{moment.detail}</p>
      </div>
    </li>
  )
}

function FullRanking({ leaderboard, currentUserId }: { leaderboard: ResultsEntry[]; currentUserId?: number | null }) {
  return (
    <ol className="m-0 list-none p-0" data-testid="classement-final">
      {leaderboard.map((entry, rank) => {
        const me = entry.userId === currentUserId
        return (
          <li
            key={entry.userId}
            className={`grid grid-cols-[2.5rem_auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 ${me ? "rounded-md border-2 border-line bg-paper-deep" : "border-b border-dotted border-line/40"}`}
          >
            <span className="font-display text-base font-bold text-ink-2">{placeLabel(rank)}</span>
            <PlayerAvatar name={entry.username} avatarUrl={entry.avatar} className="h-8 w-8 border-2 border-line text-xs" style={playerTone(entry.userId)} />
            <span className="truncate font-semibold text-ink">
              {nameOf(entry)}
              {me ? <span className="ml-1.5 text-xs font-bold text-ink-2">(toi)</span> : null}
            </span>
            <span className="text-right">
              <b className="font-mono text-base text-ink">{entry.score}</b>
              <span className="ml-1 text-xs text-ink-2">pts</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function PlayedTracks({ tracks, leaderboard }: { tracks: SoloTrack[]; leaderboard: ResultsEntry[] }) {
  const [open, setOpen] = useState(false)
  const ownerOf = (track: SoloTrack): ResultsEntry | string | null => {
    const meta = (track.metadata ?? {}) as Record<string, unknown>
    const raw = meta.owner_user_id ?? meta.user_id
    const id = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : null
    const entry = id ? leaderboard.find(e => e.userId === id) : undefined
    if (entry) return entry
    const name = typeof meta.owner_username === "string" ? meta.owner_username.trim() : ""
    return name || null
  }
  return (
    <div className="rounded-md border-[1.5px] border-line/25 bg-well p-4 text-left">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span className="min-w-0">
          <span className="block font-display text-lg font-semibold text-ink">Les morceaux de la partie</span>
          <span className="block text-xs text-ink-2">{tracks.length} morceau{tracks.length > 1 ? "x" : ""}, et qui les a mis</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-2 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <ol className="m-0 mt-3 list-none space-y-2 p-0">
          {tracks.length === 0 ? <li className="text-sm text-ink-2">Aucun morceau à montrer.</li> : null}
          {tracks.map((track, idx) => {
            const owner = ownerOf(track)
            return (
              <li key={`${track.track_id}-${idx}`} className="flex items-center gap-3 rounded-md border-[1.5px] border-line/25 bg-paper-deep px-3 py-2 text-sm">
                <span className="w-6 shrink-0 font-mono text-xs text-ink-2">{idx + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{track.title}</span>
                  <span className="block truncate text-xs text-ink-2">{track.artist}</span>
                </span>
                {owner && typeof owner !== "string" ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
                    <PlayerAvatar name={owner.username} avatarUrl={owner.avatar} className="h-6 w-6 border-[1.5px] border-line text-[10px]" style={playerTone(owner.userId)} />
                    <span className="max-w-[6rem] truncate">{nameOf(owner)}</span>
                  </span>
                ) : owner ? (
                  <span className="max-w-[6rem] shrink-0 truncate text-xs text-ink-2">{owner}</span>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}

/**
 * L'ecran de fin (T40) : le podium revele place par place, les moments de la
 * partie (la reponse la plus a cote, le morceau que personne n'a trouve...),
 * le classement complet, puis la suite : rejouer ou revenir a la salle.
 */
export function ResultsView({
  leaderboard,
  tracks,
  currentUserId,
  onReturn,
  onReplay,
  onBackToLobby,
  onEditMusic,
  isHost = true,
  isGuest = false,
  roomCode,
  feedback = null,
}: ResultsViewProps) {
  const { moments, times } = useRoundSummary(roomCode, leaderboard)
  const momentRows = useMemo(() => buildMoments(leaderboard, moments, times), [leaderboard, moments, times])
  const myRank = currentUserId ? leaderboard.findIndex(e => e.userId === currentUserId) : -1
  const me = myRank >= 0 ? leaderboard[myRank] : null

  const [shared, setShared] = useState(false)
  const handleShare = async () => {
    const winner = leaderboard[0]
    const text = winner
      ? `${nameOf(winner)} gagne le blind test sur Blindz !${me ? ` Moi : ${placeLabel(myRank)} avec ${me.score} pts.` : ""}`
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

  return (
    <section className="relative flex flex-col gap-6 rounded-md border-2 border-line bg-paper-deep p-4 shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] sm:p-7" data-testid="ecran-fin">
      {leaderboard.length > 0 ? (
        <GamePodium ranked={leaderboard} meId={currentUserId ?? null} />
      ) : (
        <p className="m-0 text-center text-sm text-ink-2">Aucun score.</p>
      )}

      {/* La suite, tout de suite sous le podium : c'est ce que la salle attend. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-y-2 border-line bg-paper px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:justify-center sm:rounded-md sm:border-2" data-testid="fin-suite">
        {isHost ? (
          <>
            <button type="button" onClick={onReplay} className={`${BUTTON} bg-terra text-on-ink shadow-[3px_3px_0_rgb(var(--c-shadow))]`}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Rejouer
            </button>
            {onBackToLobby ? (
              <button type="button" onClick={onBackToLobby} className={`${BUTTON} bg-paper-deep text-ink shadow-[3px_3px_0_rgb(var(--c-shadow)/.25)]`} data-testid="revenir-salle">
                <DoorOpen className="h-4 w-4" aria-hidden />
                Revenir à la salle
              </button>
            ) : null}
          </>
        ) : (
          <button type="button" disabled className={`${BUTTON} bg-paper-deep text-ink`}>
            L&apos;hôte peut relancer ou revenir à la salle
          </button>
        )}
      </div>

      {momentRows.length > 0 ? (
        <div className="text-left">
          <h2 className="m-0 font-display text-2xl font-semibold text-ink">Les moments de la partie</h2>
          <ul className="m-0 mt-1 list-none p-0">
            {momentRows.map(m => <MomentRow key={m.key} moment={m} />)}
          </ul>
        </div>
      ) : null}

      {leaderboard.length > 0 ? (
        <div className="text-left">
          <h2 className="m-0 mb-2 font-display text-2xl font-semibold text-ink">Le classement</h2>
          <FullRanking leaderboard={leaderboard} currentUserId={currentUserId} />
          {me ? (
            <p className="m-0 mt-3 text-sm text-ink-2">
              Toi : <b className="text-ink">{me.correct ?? 0}</b> morceau{(me.correct ?? 0) > 1 ? "x" : ""} trouvé{(me.correct ?? 0) > 1 ? "s" : ""}
              {(me.bestStreak ?? 0) >= 2 ? <>, série de <b className="text-ink">{me.bestStreak}</b></> : null}
              {times.has(me.userId) ? <>, <b className="text-ink">{((times.get(me.userId) ?? 0) / 1000).toFixed(1)} s</b> par réponse en moyenne</> : null}.
            </p>
          ) : null}
        </div>
      ) : null}

      <PlayedTracks tracks={tracks} leaderboard={leaderboard} />

      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={handleShare} className={SECONDARY}>
          <Share2 className="h-4 w-4" aria-hidden />
          {shared ? "Copié !" : "Partager"}
        </button>
        {onEditMusic ? (
          <button type="button" onClick={onEditMusic} data-testid="fin-musique" className={SECONDARY}>
            <Music className="h-4 w-4" aria-hidden />
            Changer la musique
          </button>
        ) : null}
        {onReturn ? (
          <button type="button" onClick={onReturn} className={SECONDARY}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour modes
          </button>
        ) : null}
      </div>

      {isGuest ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-1.5 rounded-md border-2 border-line bg-well px-5 py-4 text-center">
          <p className="m-0 font-display text-base font-semibold text-ink">Garde ton score</p>
          <p className="m-0 text-[13px] text-ink-2">Tes parties sont gardées sur cet appareil. Un pseudo et un mot de passe suffisent pour les retrouver sur ton ordi ou un autre téléphone.</p>
          <Link
            href="/auth/login"
            className="mt-1.5 rounded-full border-2 border-line bg-terra px-5 py-2 text-sm font-bold text-on-ink shadow-[3px_3px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
          >
            Crée un compte
          </Link>
        </div>
      ) : null}

      <div className="mx-auto max-w-md">
        <InstallApp />
      </div>

      {/* Ecran partage (autour d'une table) : pas d'avis, mais le lien du serveur. */}
      {feedback ? <EndFeedback context={feedback} /> : <DiscordServerLine className="mx-auto max-w-sm text-center" />}
    </section>
  )
}
