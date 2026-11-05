"use client"

import Link from "next/link"
import { ArrowRight, Loader2, RotateCcw } from "lucide-react"
import type { HostedRoom } from "@/lib/hostedRooms"
import { situationFor } from "@/lib/playSituations"
import { BLOCK } from "./lobbyKit"

/** Une salle effacee par le serveur (T7) : on dit ce qui s'est passe, et
 *  l'hote qui l'avait creee ici peut en rouvrir une pareille d'un clic. */
export function ExpiredRoomView({
  code,
  hosted,
  recreating,
  onRecreate,
}: {
  code: string
  hosted: HostedRoom | null
  recreating: boolean
  onRecreate: () => void
}) {
  return (
    <section
      className={`${BLOCK} mx-auto w-full max-w-xl space-y-4 bg-[#ece1c8] p-6 text-[#2e2014] sm:p-7`}
      data-testid="salle-expiree"
    >
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">Salle {code}</p>
      <h2 className="m-0 font-display text-3xl font-semibold leading-tight">Cette salle n&apos;existe plus</h2>
      <p className="m-0 text-sm leading-relaxed text-[#6b573f]">
        Une salle se ferme toute seule quand aucune partie n&apos;y est lancée pendant une demi-heure.
      </p>
      {hosted ? (
        <>
          <p className="m-0 text-sm leading-relaxed text-[#6b573f]">
            Ta musique est toujours là. Tu peux en rouvrir une avec les mêmes réglages :{" "}
            {situationFor(hosted.mode).modeName}, {hosted.questionCount} manches, {hosted.roundSeconds} s pour répondre.
            Il faudra juste donner le nouveau code aux autres.
          </p>
          <button
            type="button"
            onClick={onRecreate}
            disabled={recreating}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-4 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:opacity-60"
          >
            {recreating ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            {recreating ? "Ouverture..." : "Rouvrir une salle pareille"}
          </button>
          <p className="m-0 text-center text-[12px]">
            <Link href="/modes" className="text-[#6b573f] underline hover:text-[#2e2014]">Jouer autrement</Link>
          </p>
        </>
      ) : (
        <>
          <p className="m-0 text-sm leading-relaxed text-[#6b573f]">
            Demande le nouveau code à la personne qui organise, ou lance ta propre partie.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href="/jouer/"
              className="flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-4 py-3 text-sm font-bold text-[#f4ecdb] shadow-[3px_3px_0_#2e2014]"
            >
              Entrer un autre code <ArrowRight size={15} />
            </Link>
            <Link
              href="/modes"
              className="flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] px-4 py-3 text-sm font-bold text-[#2e2014] shadow-[3px_3px_0_#2e2014]"
            >
              Créer ma partie
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
