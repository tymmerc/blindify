"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Send, Share2 } from "lucide-react"
import { clientApi } from "@/lib/apiClient"
import { absoluteUrl } from "@/lib/publicPath"
import type { SoloTrack } from "@/lib/types"
import { DEFAULT_PLAYER_NAME, buildChallengeShareText, cleanPlayerName, rememberNicknameIfNone } from "@/lib/soloSetup"

// Bloc "Defier un ami" de la fin de partie solo. Avant : un bouton parmi six,
// qui copiait le lien en silence ("Lien copie !" 3 s, rien d'autre). Sur
// iPhone, la copie apres un appel reseau est souvent refusee : le joueur
// n'avait alors ni lien ni code. Le lien est maintenant affiche, avec Copier
// et Envoyer (menu de partage du telephone) qui partent d'un vrai geste.

export interface ChallengeScore {
  points: number
  correct: number
  rounds: number
  bestStreak: number
}

interface Invite {
  code: string
  url: string
  name: string
}

type Phase = "idle" | "creating" | "ready" | "error"
/** "failed" : le navigateur a refuse la copie (frequent sur iPhone). */
type CopyState = "idle" | "done" | "failed"

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Menu de partage ferme par le joueur : ce n'est pas une erreur. */
function isAbort(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError"
}

const BUTTON_BASE = "inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-5 py-3 text-sm font-bold shadow-[4px_4px_0_rgba(46,32,20,.3)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgba(46,32,20,.3)] disabled:cursor-not-allowed disabled:opacity-50"
const INK_BUTTON = `${BUTTON_BASE} bg-[#2e2014] text-[#f4ecdb]`
// Confirmation = bloc sauge, texte encre (creme sur sauge : 2,8:1, illisible).
const DONE_BUTTON = `${BUTTON_BASE} bg-[#7d9471] text-[#2e2014]`

const COPY_HINT: Record<CopyState, string> = {
  done: "Copié, tu n'as plus qu'à le coller dans ta conversation.",
  failed: "Ton navigateur a refusé la copie : le lien est sélectionné, copie-le à la main.",
  idle: "Copie le lien pour l'envoyer.",
}

function InviteReady({ invite, score, tracks, autoCopied }: { invite: Invite; score: ChallengeScore; tracks: number; autoCopied: boolean }) {
  const [copy, setCopy] = useState<CopyState>(autoCopied ? "done" : "idle")
  const [canShare, setCanShare] = useState(false)
  const linkRef = useRef<HTMLInputElement>(null)
  const copied = copy === "done"

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
  }, [])

  const handleCopy = async () => {
    const ok = await copyText(invite.url)
    setCopy(ok ? "done" : "failed")
    // Copie refusee : le lien est selectionne (onFocus), pret a copier a la main.
    if (!ok) linkRef.current?.focus()
  }

  const handleSend = async () => {
    try {
      await navigator.share({ title: "Défi Blindz", text: buildChallengeShareText({ name: invite.name, points: score.points, tracks }), url: invite.url })
    } catch (err) {
      if (isAbort(err)) return
      await handleCopy()
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-display text-xl font-semibold text-[#2e2014]">Ton défi est prêt</h3>
      <p className="text-sm text-[#6b573f]">
        Envoie ce lien à ton pote. Il verra « Défi de {invite.name} » et tes {score.points} pts à battre.
      </p>
      <label htmlFor="challenge-link" className="sr-only">Lien du défi</label>
      <input
        ref={linkRef}
        id="challenge-link"
        readOnly
        value={invite.url}
        onFocus={e => e.currentTarget.select()}
        className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-3 py-2.5 text-sm text-[#2e2014] outline-none focus:border-[#c65133]"
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className={copied ? DONE_BUTTON : INK_BUTTON}
        >
          {copied ? <Check className="h-4 w-4" /> : null}
          {copied ? "Lien copié" : "Copier le lien"}
        </button>
        {canShare && (
          <button type="button" onClick={handleSend} className="btn-neon text-sm">
            <Send className="h-4 w-4" />
            Envoyer
          </button>
        )}
      </div>
      <p aria-live="polite" className="text-[13px] text-[#6b573f]">
        {copy === "idle" && canShare ? "Copie le lien, ou envoie-le directement." : COPY_HINT[copy]}
        <span className="block text-[#6b573f]">Code du défi : <strong className="tracking-[0.12em] text-[#2e2014]">{invite.code}</strong></span>
      </p>
    </div>
  )
}

export function ChallengeInvite({ tracks, score, defaultName, featured }: {
  tracks: SoloTrack[]
  score: ChallengeScore
  /** Pseudo connu (ecran d'entree), "Joueur" sinon. */
  defaultName: string
  /** Partie lancee depuis l'onglet "Defier un ami" : le bloc passe au premier plan. */
  featured: boolean
}) {
  const [name, setName] = useState(defaultName === DEFAULT_PLAYER_NAME ? "" : defaultName)
  const [phase, setPhase] = useState<Phase>("idle")
  const [invite, setInvite] = useState<Invite | null>(null)
  const [autoCopied, setAutoCopied] = useState(false)

  const handleCreate = async () => {
    if (phase === "creating") return
    setPhase("creating")
    const creatorName = cleanPlayerName(name) || DEFAULT_PLAYER_NAME
    try {
      const { code } = await clientApi.createChallenge({
        tracks,
        creatorName,
        score: score.points,
        correct: score.correct,
        total: score.rounds,
        bestStreak: score.bestStreak,
      })
      // Nom retenu seulement une fois le defi cree, et sans ecraser le pseudo de /jouer.
      rememberNicknameIfNone(creatorName)
      const url = `${absoluteUrl("/challenge/")}?code=${encodeURIComponent(code)}`
      // Copie tout de suite, au plus pres du clic : marche sur ordinateur et
      // Android, souvent refusee sur iPhone (d'ou le lien affiche + Copier).
      setAutoCopied(await copyText(url))
      setInvite({ code, name: creatorName, url })
      setPhase("ready")
    } catch {
      setPhase("error")
    }
  }

  return (
    <section
      className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 sm:p-6"
      style={{ boxShadow: featured ? "4px 4px 0 #c65133" : "4px 4px 0 rgba(46,32,20,.18)" }}
    >
      {phase === "ready" && invite ? (
        <InviteReady invite={invite} score={score} tracks={tracks.length} autoCopied={autoCopied} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h3 className="font-display text-xl font-semibold text-[#2e2014]">
              {featured ? "Plus qu'à lancer ton défi" : "Défie un pote sur ces morceaux"}
            </h3>
            <p className="text-sm text-[#6b573f]">
              Ton pote écoute les mêmes {tracks.length} morceaux, dans le même ordre, et doit faire mieux que tes {score.points} pts.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="challenge-name" className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b573f]">
              Ton nom sur le défi
            </label>
            <input
              id="challenge-name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={24}
              placeholder="Ton pseudo"
              autoComplete="off"
              className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-1 py-2 font-display text-lg text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={phase === "creating"}
            className={featured ? "btn-neon w-full justify-center text-sm sm:w-auto" : `${INK_BUTTON} w-full sm:w-auto`}
          >
            {phase === "creating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Défier un ami
          </button>
          {phase === "error" && (
            <p role="alert" className="text-sm font-bold text-[#9c2f1d]">Le défi n&apos;a pas pu être créé. Réessaie dans un instant.</p>
          )}
        </div>
      )}
    </section>
  )
}
