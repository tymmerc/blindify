import { Loader2 } from "lucide-react"
import { publicPath } from "@/lib/publicPath"
import type { ChallengeLoadProblem } from "@/lib/errorText"
import { ChallengeShell } from "./ChallengeShell"

// Chargement et erreurs de la page du defi, dans le meme cadre que le reste
// (logo, blindz.app). Avant : une roue seule au milieu de l'ecran, et en cas
// d'erreur le texte brut du navigateur ("Failed to fetch") ou du serveur.

export function ChallengeLoading() {
  return (
    <ChallengeShell>
      <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-[#c65133]" />
        <p className="text-sm font-semibold text-[#2e2014]">On charge le défi...</p>
      </div>
    </ChallengeShell>
  )
}

const PROBLEM_TEXT: Record<ChallengeLoadProblem, { title: string; body: string }> = {
  missing: {
    title: "Défi introuvable",
    body: "Ce défi n'existe pas ou n'existe plus. Vérifie le code, ou demande un nouveau lien à ton pote.",
  },
  network: {
    title: "Le défi n'a pas pu se charger",
    body: "Blindz ne répond pas pour l'instant. Vérifie ta connexion, puis réessaie.",
  },
}

const OUTLINE_PILL = "inline-block rounded-full border-[1.5px] border-[#2e2014] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"

export function ChallengeProblem({ problem, onRetry }: { problem: ChallengeLoadProblem; onRetry: () => void }) {
  const text = PROBLEM_TEXT[problem]
  return (
    <ChallengeShell>
      <div role="alert" className="space-y-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-[#2e2014]">{text.title}</h1>
        <p className="text-sm text-[#6b573f]">{text.body}</p>
        {problem === "network" ? (
          <button type="button" onClick={onRetry} className="btn-neon w-full justify-center text-sm">
            Réessayer
          </button>
        ) : (
          <a href={publicPath("/challenge/")} className={OUTLINE_PILL}>
            Entrer un code
          </a>
        )}
      </div>
    </ChallengeShell>
  )
}
