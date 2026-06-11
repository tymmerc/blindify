import { Music, Users, Trophy, Sparkles, Zap, Globe } from "lucide-react"

const features = [
  {
    icon: Music,
    title: "Tes playlists Spotify",
    description:
      "Connecte ton compte Spotify et joue avec tes playlists personnelles, tes titres likes et toute ta bibliotheque musicale.",
    accent: "#c65133",
  },
  {
    icon: Users,
    title: "Multijoueur en temps reel",
    description:
      "Affronte tes amis en ligne, cree des salons prives ou rejoins des parties publiques avec des joueurs du monde entier.",
    accent: "#e0a32e",
  },
  {
    icon: Sparkles,
    title: "IA & recommandations",
    description:
      "Nos algorithmes s'appuient sur tes gouts musicaux pour creer des blindtests personnalises et decouvrir de nouveaux titres.",
    accent: "#7d9471",
  },
  {
    icon: Trophy,
    title: "Classements et badges",
    description:
      "Suis tes performances, gagne des badges exclusifs et grimpe dans les classements pour devenir le champion du blindtest.",
    accent: "#a8b8c8",
  },
  {
    icon: Zap,
    title: "Gratuit & instantane",
    description:
      "Aucune inscription complexe, aucune attente. Connecte ton compte Spotify et joue immediatement sans limite.",
    accent: "#c65133",
  },
  {
    icon: Globe,
    title: "Accessible partout",
    description:
      "Joue depuis n'importe quel appareil - ordinateur, tablette ou smartphone - avec une experience optimisee.",
    accent: "#e0a32e",
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">
            Face A · L&apos;essentiel
          </p>
          <h2 className="font-display text-4xl lg:text-5xl font-semibold leading-[1.05] text-[#2e2014]">
            Pourquoi <em className="font-medium italic text-[#c65133]">Blindify</em> ?
          </h2>
          <p className="text-lg text-[#6b573f] max-w-2xl mx-auto">
            Une plateforme complete et intuitive concue pour offrir la meilleure
            experience de blindtest possible.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-8 shadow-[4px_4px_0_rgba(46,32,20,.18)] transition-transform duration-300 hover:-translate-y-1"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-6 border-2 border-[#2e2014]"
                style={{ background: feature.accent }}
              >
                <feature.icon className="w-7 h-7 text-[#f4ecdb]" />
              </div>
              <h3 className="font-display text-xl font-semibold leading-tight mb-3 text-[#2e2014]">
                {feature.title}
              </h3>
              <p className="text-[#6b573f] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
