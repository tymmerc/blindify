import { Music, Users, Trophy, Sparkles, Zap, Globe } from "lucide-react"
import SectionCard from "@/components/ui/SectionCard"

const features = [
  {
    icon: Music,
    title: "Tes playlists Spotify",
    description:
      "Connecte ton compte Spotify et joue avec tes playlists personnelles, tes titres likés et toute ta bibliothèque musicale.",
  },
  {
    icon: Users,
    title: "Multijoueur en temps réel",
    description:
      "Affronte tes amis en ligne, crée des salons privés ou rejoins des parties publiques avec des joueurs du monde entier.",
  },
  {
    icon: Sparkles,
    title: "IA & recommandations",
    description:
      "Nos algorithmes s'appuient sur tes goûts musicaux pour créer des blindtests personnalisés et découvrir de nouveaux titres.",
  },
  {
    icon: Trophy,
    title: "Classements et badges",
    description:
      "Suis tes performances, gagne des badges exclusifs et grimpe dans les classements pour devenir le champion du blindtest.",
  },
  {
    icon: Zap,
    title: "Gratuit & instantané",
    description:
      "Aucune inscription complexe, aucune attente. Connecte ton compte Spotify et joue immédiatement sans limite.",
  },
  {
    icon: Globe,
    title: "Accessible partout",
    description:
      "Joue depuis n'importe quel appareil - ordinateur, tablette ou smartphone - avec une expérience optimisée.",
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 lg:py-32 bg-gradient-to-b from-purple-50/50 via-pink-50/30 to-green-50/50 dark:from-gray-950 dark:via-purple-950/30 dark:to-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-balance bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">
            Pourquoi Blindify ?
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-pretty">
            Une plateforme complète et intuitive conçue pour offrir la meilleure expérience de blindtest possible.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <SectionCard
              key={index}
              className="p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl flex items-center justify-center mb-6">
                <feature.icon className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">{feature.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{feature.description}</p>
            </SectionCard>
          ))}
        </div>
      </div>
    </section>
  )
}