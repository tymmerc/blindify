import Link from "next/link"
import { Button } from "@/components/ui/button"
import SectionCard from "@/components/ui/SectionCard"
import { Check, Sparkles } from "lucide-react"

const plans = [
  {
    name: "Gratuit",
    price: "0\u20ac",
    period: "pour toujours",
    description: "Parfait pour découvrir Blindz",
    features: [
      "Parties illimitées",
      "Connexion Spotify",
      "Jusqu'à 4 joueurs par partie",
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
    description: "Pour les passionnés de musique",
    features: [
      "Tout du plan Gratuit",
      "Jusqu'à 20 joueurs par partie",
      "Blindtests personnalisés",
      "Statistiques avancées",
      "Badges exclusifs",
      "Sans publicité",
      "Support prioritaire",
    ],
    cta: "Essayer 14 jours gratuits",
    highlighted: true,
  },
  {
    name: "Entreprise",
    price: "Sur mesure",
    period: "contactez-nous",
    description: "Pour les événements et entreprises",
    features: [
      "Tout du plan Pro",
      "Joueurs illimités",
      "Branding personnalisé",
      "API et intégrations",
      "Gestionnaire de compte dédié",
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
          <h2 className="font-display text-4xl lg:text-5xl font-semibold leading-[1.05] text-balance text-[#2e2014]">
            Choisissez votre <em className="font-medium italic text-[#c65133]">formule</em>
          </h2>
          <p className="text-xl text-[#6b573f] max-w-2xl mx-auto text-pretty">
            Des tarifs transparents adaptés à tous les besoins, sans engagement
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {plans.map((plan, index) => (
            <SectionCard
              key={index}
              className={`p-8 flex flex-col relative ${
                plan.highlighted
                  ? "border-2 border-[#c65133] shadow-[6px_6px_0_#c65133] scale-105"
                  : ""
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#c65133] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]">
                    <Sparkles className="w-4 h-4" />
                    Le plus populaire
                  </div>
                </div>
              )}

              <div className="text-center mb-8 mt-4">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558] mb-3">
                  {plan.name}
                </h3>
                <div className="mb-2">
                  <span
                    className={`font-display text-5xl font-bold ${
                      plan.highlighted ? "text-[#c65133]" : "text-[#2e2014]"
                    }`}
                  >
                    {plan.price}
                  </span>
                  <span className="text-lg ml-2 text-[#8a7558]">
                    {plan.period}
                  </span>
                </div>
                <p className="text-[#6b573f]">{plan.description}</p>
              </div>

              <ul className="space-y-4 mb-8 flex-grow">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-[#7d9471]" />
                    <span className="text-[#2e2014]">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
              >
                <Link href="/modes">{plan.cta}</Link>
              </Button>
            </SectionCard>
          ))}
        </div>
      </div>
    </section>
  )
}
