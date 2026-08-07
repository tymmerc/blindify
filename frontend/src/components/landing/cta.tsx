import Link from "next/link"
import { Play, ArrowRight } from "lucide-react"

export function CTA() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-md border-2 border-[#2e2014] bg-[#c65133] p-12 lg:p-16 text-center shadow-[6px_6px_0_#2e2014]">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#f4ecdb]/80 mb-4">
            Face B · À toi de jouer
          </p>
          <h2 className="font-display text-4xl lg:text-5xl font-semibold leading-[1.05] mb-6 text-balance text-[#f4ecdb]">
            Prêt à réinventer le blindtest ?
          </h2>
          <p className="text-lg text-[#f4ecdb]/85 mb-8 text-pretty">
            Rejoins des milliers de joueurs qui adorent cette nouvelle façon de
            découvrir la musique.
          </p>
          <Link
            href="/modes"
            className="btn-neon btn-neon-pink text-sm group mx-auto inline-flex"
          >
            <Play className="w-4 h-4" />
            Accéder au jeu
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  )
}
