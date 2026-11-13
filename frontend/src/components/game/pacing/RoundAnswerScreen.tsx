"use client"

import { motion, useReducedMotion } from "framer-motion"
import { PlayerAvatar } from "@/components/ui/PlayerAvatar"
import { answerRows, playerTone, trackOwner, VERDICT_LABEL, type AnswerRow } from "@/lib/roundPacing"
import type { MultiplayerGameState, MultiplayerPlayerState } from "@/lib/types"
import { DeezerCredit, SpotifyTrackLink } from "../SourceCredits"

export interface RoundAnswerScreenProps {
  track: MultiplayerGameState["currentTrack"]
  /** Joueurs de la manche (presentateur d'un event deja retire). */
  players: MultiplayerPlayerState[]
  /** Le joueur de cet ecran ; null sur l'ecran central et chez un spectateur. */
  meId: number | null
  /** Ecran central d'une partie autour d'une table : deux colonnes, plus grand. */
  large?: boolean
}

const VERDICT_PILL: Record<AnswerRow["verdict"], string> = {
  correct: "bg-sage text-on-accent",
  close: "bg-gold text-on-accent",
  wrong: "bg-rouge text-on-ink",
}

/** Le titre ou l'artiste tape : souligne en vague rouge quand c'etait faux. */
function GuessPart({ text, ok }: { text: string; ok: boolean | null }) {
  if (!text) return <span className="font-sans text-[0.8em] not-italic text-sourd">rien</span>
  return (
    <span className={ok === false ? "underline decoration-wavy decoration-rouge-txt decoration-[1.5px] underline-offset-[5px]" : undefined}>
      {text}
    </span>
  )
}

function Row({ row, me, index, reduce }: { row: AnswerRow; me: boolean; index: number; reduce: boolean }) {
  const tag = row.isOwner ? (me ? "toi · ton morceau" : "son morceau") : me ? "toi" : null
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : 0.7 + index * 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-line/20 px-2 py-2.5 ${
        me ? "rounded-md border-2 border-line bg-paper-deep" : ""
      }`}
      data-testid="reponse-joueur"
    >
      <PlayerAvatar name={row.username} avatarUrl={row.avatar} className="h-9 w-9 border-2 border-line text-sm" style={playerTone(row.userId)} />
      <div className="min-w-0">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-bold text-ink">{row.username}</span>
          {tag ? (
            <span className="rounded border-[1.5px] border-line/60 px-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-2">{tag}</span>
          ) : null}
          {row.bet ? (
            <span className="text-xs text-ink-2">
              a misé sur {row.bet.name}
              <span className={row.bet.ok ? "ml-0.5 font-bold text-sage-deep-txt" : "ml-0.5 font-bold text-rouge-txt"} aria-label={row.bet.ok ? "bon pari" : "raté"}>
                {row.bet.ok ? "✓" : "✗"}
              </span>
            </span>
          ) : null}
        </p>
        <p className="m-0 mt-0.5 break-words font-display text-base italic leading-snug text-ink sm:text-lg">
          {row.empty ? (
            <span className="font-sans text-sm text-ink-2">{row.answered ? "a passé" : "pas de réponse"}</span>
          ) : (
            <>
              «&nbsp;<GuessPart text={row.title} ok={row.titleOk} />
              <span className="mx-1.5 not-italic text-sourd">·</span>
              <GuessPart text={row.artist} ok={row.artistOk} />&nbsp;»
            </>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`font-mono text-lg font-bold tabular-nums ${row.gained > 0 ? "text-ink" : "text-sourd"}`}>+{row.gained}</span>
        <span className={`whitespace-nowrap rounded-full border-[1.5px] border-line px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${VERDICT_PILL[row.verdict]}`}>
          {VERDICT_LABEL[row.verdict]}
        </span>
      </div>
    </motion.li>
  )
}

/**
 * Premier ecran apres une manche (T38) : la reponse en grand, de qui vient le
 * morceau, puis ce que chacun a tape, telles quelles, fausses comprises.
 * C'est le moment drole de la soiree.
 */
export function RoundAnswerScreen({ track, players, meId, large = false }: RoundAnswerScreenProps) {
  const reduce = useReducedMotion() === true
  const owner = trackOwner(track, players)
  const rows = answerRows(track, players)
  const ownerIsMe = owner?.userId != null && owner.userId === meId

  const head = (
    <div className="flex flex-col gap-4">
      <div className={`flex gap-4 ${large ? "flex-col" : "items-center"}`}>
        <div className={`relative shrink-0 ${large ? "h-48 w-48" : "h-24 w-24 sm:h-28 sm:w-28"}`}>
          <span aria-hidden className="absolute inset-y-[6%] -right-[22%] aspect-square rounded-full border-2 border-line bg-ink-block" />
          {track?.albumCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.albumCover} alt="" className="relative h-full w-full rounded-sm border-2 border-line object-cover shadow-[4px_4px_0_rgb(var(--c-shadow)/.2)]" />
          ) : (
            <span aria-hidden className="relative block h-full w-full rounded-sm border-2 border-line bg-terra shadow-[4px_4px_0_rgb(var(--c-shadow)/.2)]" />
          )}
        </div>
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.3em] text-terra-txt">La réponse</p>
          <h2 className={`m-0 mt-1 break-words font-display font-semibold leading-tight text-ink ${large ? "text-5xl" : "text-2xl sm:text-3xl"}`}>
            {track?.title}
          </h2>
          <p className={`m-0 mt-1 font-display italic text-ink-2 ${large ? "text-2xl" : "text-lg"}`}>{track?.artist}</p>
          <SpotifyTrackLink provider={track?.provider} trackId={track?.trackId} className="mt-2" />
        </div>
      </div>
      {owner ? (
        <div className="flex items-center gap-3 rounded-md border-2 border-line bg-paper-deep px-3 py-2.5 shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]" data-testid="morceau-de">
          <PlayerAvatar
            name={owner.name}
            avatarUrl={owner.avatar}
            className={`border-2 border-line ${large ? "h-14 w-14 text-xl" : "h-11 w-11 text-base"}`}
            style={playerTone(owner.userId ?? 0)}
          />
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.24em] text-ink-2">Le morceau de</p>
            <p className={`m-0 truncate font-display font-semibold text-ink ${large ? "text-3xl" : "text-xl"}`}>
              {owner.name}
              {ownerIsMe ? <span className="ml-1.5 font-sans text-sm font-bold">(toi)</span> : null}
            </p>
          </div>
          {owner.question && owner.asked > 0 ? (
            <p className="m-0 ml-auto shrink-0 text-right text-xs text-ink-2">
              <b className="block font-mono text-lg text-ink">{owner.guessed}/{owner.asked}</b>
              l&apos;ont deviné
            </p>
          ) : null}
        </div>
      ) : null}
      <DeezerCredit notice={false} />
    </div>
  )

  const list = (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="m-0 font-display text-lg font-semibold text-ink sm:text-xl">Qui a répondu quoi</h3>
        <span className="text-xs text-ink-2">titre · artiste</span>
      </div>
      <ol className="m-0 list-none p-0">
        {rows.map((row, i) => (
          <Row key={row.userId} row={row} me={row.userId === meId} index={i} reduce={reduce} />
        ))}
      </ol>
    </div>
  )

  return large ? (
    <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
      {head}
      {list}
    </div>
  ) : (
    <div className="flex w-full flex-col gap-5">
      {head}
      {list}
    </div>
  )
}
