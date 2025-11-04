import { Button } from "@/components/ui/button"
import { Play, ArrowRight } from "lucide-react"

export function CTA() {
  return (
    <section className="py-24 lg:py-32 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-y border-border">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-balance">
          Prêt à révolutionner le blindtest ?
        </h2>
        <p className="text-xl text-muted-foreground mb-8 text-pretty">
          Rejoins des milliers de joueurs qui adorent cette nouvelle façon de découvrir la musique
        </p>
        <Button
          size="lg"
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground px-10 py-6 text-lg rounded-full font-semibold flex items-center gap-2 group mx-auto"
        >
          <Play className="w-5 h-5" />
          Accéder au jeu
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </section>
  )
}
