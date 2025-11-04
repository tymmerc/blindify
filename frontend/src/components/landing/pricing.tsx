import { Button } from "@/components/ui/button"
import SectionCard from "@/components/ui/SectionCard"
import { Check, Sparkles } from "lucide-react"

const plans = [
  {
    name: "Gratuit",
    price: "0€",
    period: "pour toujours",
    description: "Parfait pour découvrir Blindify",
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
    price: "4,99€",
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
    <section id="pricing" className="py-24 lg:py-32 bg-gradient-to-b from-green-50/50 via-pink-50/30 to-purple-50/50 dark:from-gray-950 dark:via-pink-950/30 dark:to-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-balance bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">
            Choisissez votre formule
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-pretty">
            Des tarifs transparents adaptés à tous les besoins, sans engagement
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <SectionCard
              key={index}
              className={`p-8 flex flex-col relative ${
                plan.highlighted
                  ? "border-2 border-pink-500 shadow-2xl scale-105 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20"
                  : ""
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 rounded-full text-white text-sm font-bold shadow-lg">
                    <Sparkles className="w-4 h-4" />
                    Le plus populaire
                  </div>
                </div>
              )}

              <div className="text-center mb-8 mt-4">
                <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                  {plan.name}
                </h3>
                <div className="mb-2">
                  <span className={`text-5xl font-bold ${
                    plan.highlighted 
                      ? "bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent"
                      : "text-gray-900 dark:text-white"
                  }`}>
                    {plan.price}
                  </span>
                  <span className="text-lg ml-2 text-gray-600 dark:text-gray-400">
                    {plan.period}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-4 mb-8 flex-grow">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-green-500" />
                    <span className="text-gray-900 dark:text-white">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                variant={plan.highlighted ? "default" : "outline"}
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