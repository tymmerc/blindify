import { Button } from "@/components/ui/button"
import SectionCard from "@/components/ui/SectionCard"
import { Check, Sparkles } from "lucide-react"

const plans = [
  {
    name: "Gratuit",
    price: "0\u20ac",
    period: "pour toujours",
    description: "Parfait pour decouvrir Blindify",
    features: [
      "Parties illimitees",
      "Connexion Spotify",
      "Jusqu'a 4 joueurs par partie",
      "Playlists personnelles",
      "Support communautaire",
    ],
    cta: "Commencer gratuitement",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "4,99\u20ac",
    period: "par mois",
    description: "Pour les passionnes de musique",
    features: [
      "Tout du plan Gratuit",
      "Jusqu'a 20 joueurs par partie",
      "Blindtests personnalises",
      "Statistiques avancees",
      "Badges exclusifs",
      "Sans publicite",
      "Support prioritaire",
    ],
    cta: "Essayer 14 jours gratuits",
    highlighted: true,
  },
  {
    name: "Entreprise",
    price: "Sur mesure",
    period: "contactez-nous",
    description: "Pour les evenements et entreprises",
    features: [
      "Tout du plan Pro",
      "Joueurs illimites",
      "Branding personnalise",
      "API et integrations",
      "Gestionnaire de compte dedie",
      "Formation et onboarding",
      "SLA garanti",
    ],
    cta: "Nous contacter",
    highlighted: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-balance bg-gradient-to-r from-[#a855f7] to-[#ec4899] bg-clip-text text-transparent">
            Choisissez votre formule
          </h2>
          <p className="text-xl text-[#71717a] max-w-2xl mx-auto text-pretty">
            Des tarifs transparents adaptes a tous les besoins, sans engagement
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {plans.map((plan, index) => (
            <SectionCard
              key={index}
              className={`p-8 flex flex-col relative ${
                plan.highlighted
                  ? "border-[rgba(168,85,247,0.3)] shadow-[0_0_20px_rgba(168,85,247,0.15)] scale-105"
                  : ""
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#a855f7] to-[#ec4899] rounded-xl text-white text-sm font-bold shadow-lg">
                    <Sparkles className="w-4 h-4" />
                    Le plus populaire
                  </div>
                </div>
              )}

              <div className="text-center mb-8 mt-4">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717a] mb-3">
                  {plan.name}
                </h3>
                <div className="mb-2">
                  <span
                    className={`text-5xl font-bold ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-[#a855f7] to-[#ec4899] bg-clip-text text-transparent"
                        : "text-[#fafafa]"
                    }`}
                  >
                    {plan.price}
                  </span>
                  <span className="text-lg ml-2 text-[#71717a]">
                    {plan.period}
                  </span>
                </div>
                <p className="text-[#71717a]">{plan.description}</p>
              </div>

              <ul className="space-y-4 mb-8 flex-grow">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-[#a855f7]" />
                    <span className="text-[#fafafa]">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                variant={plan.highlighted ? "glow" : "outline"}
                className="w-full"
              >
                {plan.cta}
              </Button>
            </SectionCard>
          ))}
        </div>
      </div>
    </section>
  )
}
