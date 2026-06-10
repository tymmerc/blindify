import Link from "next/link"
import { Play, ArrowRight } from "lucide-react"

export function CTA() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="relative rounded-2xl bg-[rgba(15,5,30,0.6)] backdrop-blur-[20px] border border-[#ff2ec8]/40 p-12 lg:p-16 text-center"
          style={{
            boxShadow:
              "0 0 40px rgba(255, 46, 200, 0.18), 0 0 80px rgba(0, 247, 255, 0.08), inset 0 0 30px rgba(255, 46, 200, 0.06)",
          }}
        >
          {/* Arcade corner brackets */}
          <span aria-hidden className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-[#ff2ec8]" />
          <span aria-hidden className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-[#00f7ff]" />
          <span aria-hidden className="absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-[#00f7ff]" />
          <span aria-hidden className="absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-[#ff2ec8]" />

          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] mb-4">
            [ Press Start ]
          </p>
          <h2 className="font-display text-4xl lg:text-5xl uppercase tracking-[0.04em] mb-6 text-glow-pink text-balance">
            Pret a reinventer le blindtest ?
          </h2>
          <p className="text-lg text-[#9b7fb8] mb-8 text-pretty">
            Rejoins des milliers de joueurs qui adorent cette nouvelle facon de
            decouvrir la musique.
          </p>
          <Link
            href="/modes"
            className="btn-neon-pink font-display text-sm group mx-auto inline-flex"
          >
            <Play className="w-4 h-4" />
            Acceder au jeu
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  )
}
