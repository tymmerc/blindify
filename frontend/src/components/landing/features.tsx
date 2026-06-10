import { Music, Users, Trophy, Sparkles, Zap, Globe } from "lucide-react"

const features = [
  {
    icon: Music,
    title: "Tes playlists Spotify",
    description:
      "Connecte ton compte Spotify et joue avec tes playlists personnelles, tes titres likes et toute ta bibliotheque musicale.",
    accent: "#ff2ec8",
  },
  {
    icon: Users,
    title: "Multijoueur en temps reel",
    description:
      "Affronte tes amis en ligne, cree des salons prives ou rejoins des parties publiques avec des joueurs du monde entier.",
    accent: "#00f7ff",
  },
  {
    icon: Sparkles,
    title: "IA & recommandations",
    description:
      "Nos algorithmes s'appuient sur tes gouts musicaux pour creer des blindtests personnalises et decouvrir de nouveaux titres.",
    accent: "#a855f7",
  },
  {
    icon: Trophy,
    title: "Classements et badges",
    description:
      "Suis tes performances, gagne des badges exclusifs et grimpe dans les classements pour devenir le champion du blindtest.",
    accent: "#ffea00",
  },
  {
    icon: Zap,
    title: "Gratuit & instantane",
    description:
      "Aucune inscription complexe, aucune attente. Connecte ton compte Spotify et joue immediatement sans limite.",
    accent: "#ff2ec8",
  },
  {
    icon: Globe,
    title: "Accessible partout",
    description:
      "Joue depuis n'importe quel appareil - ordinateur, tablette ou smartphone - avec une experience optimisee.",
    accent: "#00f7ff",
  },
]

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "")
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function Features() {
  return (
    <section id="features" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff]">
            [ Stage Select ]
          </p>
          <h2 className="font-display text-4xl lg:text-5xl uppercase tracking-[0.04em] text-glow-pink">
            Pourquoi Blindify ?
          </h2>
          <p className="text-lg text-[#9b7fb8] max-w-2xl mx-auto">
            Une plateforme complete et intuitive concue pour offrir la meilleure
            experience de blindtest possible.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative rounded-xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-8 transition-all duration-300 hover:-translate-y-1"
              style={{
                borderColor: hexToRgba(feature.accent, 0.3),
                boxShadow: `0 0 18px ${hexToRgba(feature.accent, 0.1)}, inset 0 0 14px ${hexToRgba(feature.accent, 0.04)}`,
              }}
            >
              {/* Arcade corner brackets */}
              <span aria-hidden className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2" style={{ borderColor: feature.accent }} />
              <span aria-hidden className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2" style={{ borderColor: feature.accent }} />
              <span aria-hidden className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2" style={{ borderColor: feature.accent }} />
              <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2" style={{ borderColor: feature.accent }} />

              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-all"
                style={{
                  background: hexToRgba(feature.accent, 0.12),
                  border: `1px solid ${hexToRgba(feature.accent, 0.4)}`,
                  boxShadow: `0 0 18px ${hexToRgba(feature.accent, 0.25)}, inset 0 0 12px ${hexToRgba(feature.accent, 0.15)}`,
                }}
              >
                <feature.icon className="w-7 h-7" style={{ color: feature.accent }} />
              </div>
              <h3 className="font-display text-xl uppercase tracking-[0.03em] mb-3 text-[#f8f0ff]">
                {feature.title}
              </h3>
              <p className="text-[#9b7fb8] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
