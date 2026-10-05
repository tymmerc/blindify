"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { RotateCcw } from "lucide-react"
import { buildShareText } from "@/lib/shareText"
import { siteLabel } from "@/lib/publicPath"
import type { SoloTrack } from "@/lib/types"
import { ShareImageButton } from "./ShareImageButton"
import { ChallengeInvite, type ChallengeScore } from "./ChallengeInvite"

// Fin de partie solo. Avant : six boutons de meme poids sur une ligne, dont
// "Defier un ami" ; la carte collait aux bords de l'ecran. Maintenant : le
// score, rejouer, puis le defi dans son propre bloc qui explique ce que c'est.

interface SoloEndScreenProps {
  stats: ChallengeScore
  accuracy: number
  roundStates: string[]
  tracks: SoloTrack[]
  playerName: string
  /** Faux pendant un defi releve : on ne relance pas un defi depuis un defi. */
  showChallenge: boolean
  challengeIntent: boolean
  onReplay: () => void
  /** Bloc sous les liens de fin (le retour « Ça s'est bien passé ? » en solo). */
  footer?: ReactNode
}

const QUIET_LINK = "font-bold text-[#6b573f] underline underline-offset-2 hover:text-[#2e2014] disabled:opacity-50"
const OUTLINE_BUTTON = "inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-5 py-3 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"

function ShareScoreButton({ stats, roundStates }: { stats: ChallengeScore; roundStates: string[] }) {
  const [label, setLabel] = useState("Copier mon score")
  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText(stats, roundStates, siteLabel()))
      setLabel("Score copié")
    } catch {
      setLabel("Copie impossible")
    }
    setTimeout(() => setLabel("Copier mon score"), 2000)
  }
  return (
    <button type="button" onClick={handleClick} className={QUIET_LINK}>
      {label}
    </button>
  )
}

// Venu pour defier : Rejouer passe en secondaire et "Changer de playlist"
// ramene sur l'onglet du defi, pas sur le classique.
function ReplayActions({ challenge, onReplay }: { challenge: boolean; onReplay: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
      <button type="button" className={challenge ? OUTLINE_BUTTON : "btn-neon justify-center"} onClick={onReplay}>
        <RotateCcw className="h-4 w-4" />
        Rejouer
      </button>
      <Link href={challenge ? "/solo?tab=challenge" : "/solo"} className={OUTLINE_BUTTON}>
        Changer de playlist
      </Link>
    </div>
  )
}

export function SoloEndScreen({ stats, accuracy, roundStates, tracks, playerName, showChallenge, challengeIntent, onReplay, footer }: SoloEndScreenProps) {
  const goodAnswers = `${stats.correct} bonne${stats.correct > 1 ? "s" : ""} réponse${stats.correct > 1 ? "s" : ""} sur ${stats.rounds}`
  // Venu pour defier : le defi passe juste sous le score, rejouer apres.
  const challengeFirst = showChallenge && challengeIntent
  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-6 text-[#2e2014] sm:py-12">
      <section className="space-y-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:p-7">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold">Partie terminée !</h2>
          <p className="font-display text-5xl font-bold text-[#c65133]">{stats.points} pts</p>
          <p className="text-sm text-[#6b573f]">
            {goodAnswers} · série max {stats.bestStreak} · précision {accuracy}&nbsp;%
          </p>
        </div>
        {!challengeFirst && <ReplayActions challenge={false} onReplay={onReplay} />}
      </section>

      {showChallenge && (
        <ChallengeInvite
          tracks={tracks}
          score={stats}
          defaultName={playerName}
          featured={challengeIntent}
        />
      )}

      {challengeFirst && <ReplayActions challenge onReplay={onReplay} />}

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm">
        <ShareScoreButton stats={stats} roundStates={roundStates} />
        <ShareImageButton
          stats={stats}
          roundStates={roundStates}
          tracks={tracks.map(t => ({ title: t.title, artist: t.artist }))}
          className={QUIET_LINK}
        />
        <Link href="/modes" className={QUIET_LINK}>
          Retour aux modes
        </Link>
      </div>

      {footer}
    </div>
  )
}
