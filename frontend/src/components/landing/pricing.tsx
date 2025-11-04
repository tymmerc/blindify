import { Button } from "@/components/ui/ActionButton"
import { Card } from "@/components/ui/SectionCard"
import { Check } from "lucide-react"

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
    <section id="pricing" className="py-24 lg:py-32 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-balance">
            Choisissez votre formule
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            Des tarifs transparents adaptés à tous les besoins, sans engagement
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <Card
              key={index}
              className={`p-8 flex flex-col ${
                plan.highlighted
                  ? "bg-accent text-accent-foreground border-accent shadow-2xl scale-105"
                  : "bg-card border-border"
              }`}
            >
              {plan.highlighted && (
                <div className="text-center mb-4">
                  <span className="inline-block px-4 py-1 bg-accent-foreground/10 rounded-full text-sm font-medium">
                    Le plus populaire
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h3
                  className={`text-2xl font-bold mb-2 ${
                    plan.highlighted ? "text-accent-foreground" : "text-foreground"
                  }`}
                >
                  {plan.name}
                </h3>
                <div className="mb-2">
                  <span
                    className={`text-5xl font-bold ${
                      plan.highlighted ? "text-accent-foreground" : "text-foreground"
                    }`}
                  >
                    {plan.price}
                  </span>
                  <span
                    className={`text-lg ml-2 ${
                      plan.highlighted ? "text-accent-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {plan.period}
                  </span>
                </div>
                <p
                  className={
                    plan.highlighted ? "text-accent-foreground/80" : "text-muted-foreground"
                  }
                >
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-4 mb-8 flex-grow">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check
                      className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                        plan.highlighted ? "text-accent-foreground" : "text-accent"
                      }`}
                    />
                    <span className={plan.highlighted ? "text-accent-foreground" : "text-foreground"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className={
                  plan.highlighted
                    ? "bg-accent-foreground text-accent hover:bg-accent-foreground/90 w-full"
                    : "bg-accent text-accent-foreground hover:bg-accent/90 w-full"
                }
              >
                {plan.cta}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
