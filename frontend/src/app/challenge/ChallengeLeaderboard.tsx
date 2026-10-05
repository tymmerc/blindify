"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { absoluteUrl, publicPath } from "@/lib/publicPath"
import { buildLeaderboardRows, type ChallengeSummary, type LeaderboardEntry } from "@/lib/challengeLeaderboard"
import { ChallengeShell } from "./ChallengeShell"

// Classement d'un defi, une fois la partie de l'ami terminee. On y propose de
// lancer son propre defi : c'est la que l'envie de "defier a mon tour" nait.

export function ChallengeLeaderboard({ challenge, attempts, currentPlayerName }: {
  challenge: ChallengeSummary
  attempts: LeaderboardEntry[]
  currentPlayerName: string
}) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const rows = buildLeaderboardRows(challenge, attempts, currentPlayerName)

  const handleCopy = async () => {
    const url = `${absoluteUrl("/challenge/")}?code=${encodeURIComponent(challenge.code)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <ChallengeShell wide>
      <div className="space-y-6">
        <h1 className="text-center font-display text-3xl font-semibold">Résultats du défi</h1>

        <ol className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-3 shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:px-6">
          {rows.map((entry, idx) => (
            <li key={`${entry.playerName}-${idx}`} className="flex items-baseline gap-3 py-2.5">
              <span className="w-5 shrink-0 text-sm font-bold text-[#6b573f]">{idx + 1}</span>
              <span className="flex min-w-0 flex-col">
                <span className={`truncate font-display text-base font-semibold ${entry.isCurrent ? "text-[#c65133]" : "text-[#2e2014]"}`}>
                  {entry.playerName}
                </span>
                {(entry.isCreator || entry.isCurrent) && (
                  <span className="text-[12px] text-[#6b573f]">{entry.isCreator ? "a lancé le défi" : "toi"}</span>
                )}
              </span>
              <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-[rgba(46,32,20,.45)]" />
              <span className="shrink-0 text-right">
                <span className="font-display text-base font-bold text-[#2e2014]">{entry.score} pts</span>
                <span className="block text-[11px] text-[#6b573f]">
                  {entry.correct}/{entry.total} · série {entry.bestStreak}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a href={`${publicPath("/solo/")}?tab=challenge`} className="btn-neon justify-center text-sm">
            Défier à mon tour
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-5 py-3 text-sm font-bold transition ${
              copied ? "bg-[#7d9471] text-[#2e2014]" : "text-[#2e2014] hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            }`}
          >
            {copied ? <Check className="h-4 w-4" /> : null}
            {copied ? "Lien copié" : "Copier le lien de ce défi"}
          </button>
        </div>
        {copied === false && (
          <p role="alert" className="text-center text-sm text-[#9c2f1d]">
            Copie impossible ici. Le code du défi : <strong>{challenge.code}</strong>
          </p>
        )}
      </div>
    </ChallengeShell>
  )
}
