"use client"

import type { GameModeConfig } from "@/lib/gameModes"
import type { MultiplayerParticipant } from "@/lib/types"

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
    <div className={`rounded-md border-2 border-line bg-paper-deep shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] ${compact ? "p-5" : "p-7"} text-left`}>
      <h3 className={`font-bold uppercase tracking-[0.22em] text-sourd ${variant === "large" ? "text-sm" : "text-[11px]"}`}>
        {title}
      </h3>
      <ul className={`mt-4 space-y-3 text-ink ${variant === "large" ? "text-base" : "text-sm"}`}>
        {participants.map(participant => (
          <li
            key={participant.user_id}
            className="flex items-baseline gap-2 px-1 py-1"
          >
            <span className="font-semibold">{participant.username || `Player #${participant.user_id}`}</span>
            <span aria-hidden className="flex-1 border-b-2 border-dotted border-[rgb(var(--c-line)/.45)]" />
            {showScores ? (
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-2">
                {scores[participant.user_id]?.score ?? 0} pts · {scores[participant.user_id]?.accuracy ?? 0}%
              </span>
            ) : (
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sage-txt">
                {typeof participant.track_count === "number"
                  ? participant.track_count > 0
                    ? `${participant.track_count} titres`
                    : "sans musique"
                  : "Présent"}
              </span>
            )}
          </li>
        ))}
        {participants.length === 0 && (
          <li className="rounded-md border-[1.5px] border-[rgb(var(--c-line)/.22)] bg-well px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-sourd">
            On arrive…
          </li>
        )}
      </ul>
    </div>
  )
}

// L'ecran de fin vit dans son fichier depuis T40.
export { ResultsView } from "./ResultsView"
