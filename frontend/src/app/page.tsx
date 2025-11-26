"use client"

import Link from "next/link"

const heroCards = [
  { icon: "🎵", title: "Votre musique", desc: "Utilisez vos propres playlists pour des parties personnalisées" },
  { icon: "⚡", title: "Partie rapide", desc: "10 secondes pour deviner chaque morceau" },
  { icon: "📊", title: "Statistiques", desc: "Suivez votre progression" },
]

const steps = [
  {
    icon: "🔗",
    title: "Connectez votre compte",
    desc: "Synchronisez votre bibliothèque musicale en un clic pour accéder à tous vos morceaux",
  },
  {
    icon: "🎮",
    title: "Lancez une partie",
    desc: "Choisissez une playlist ou jouez en mode aléatoire avec toute votre bibliothèque",
  },
  {
    icon: "🏆",
    title: "Battez vos records",
    desc: "Accumulez des points et défiez vos amis pour devenir le champion du blindtest",
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white">
      <header className="fixed top-0 left-0 right-0 z-30 border-b border-[var(--ma-border)] bg-[rgba(10,10,10,0.82)] backdrop-blur-md">
        <div className="ma-container flex items-center justify-between py-6">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--ma-gradient)" }}
          >
            Blindify
          </Link>
        </div>
      </header>

      <main className="pt-24">
        <section className="hero min-h-screen flex items-center pb-16">
          <div className="ma-container">
            <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
              <div className="space-y-6">
                <h1
                  className="text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl lg:text-6xl"
                  style={{
                    backgroundImage: "linear-gradient(135deg, #ffffff 0%, #a855f7 50%, #ec4899 100%)",
                    WebkitBackgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  Testez votre culture musicale
                </h1>
                <p className="text-lg text-[var(--ma-muted)] sm:text-xl">
                  Devinez vos morceaux préférés en quelques secondes. Connectez votre bibliothèque musicale et mesurez-vous
                  à vos amis.
                </p>
                <Link href="/auth/login" className="ma-btn-primary inline-flex w-fit">
                  Commencer gratuitement
                </Link>
              </div>

              <div className="relative h-[460px]">
                {heroCards.map((card, index) => (
                  <div
                    key={card.title}
                    className="visual-card absolute rounded-2xl border border-[rgba(168,85,247,0.15)] bg-[#151515] p-8 shadow-lg transition duration-300"
                    style={{
                      width: index === 0 ? 280 : index === 1 ? 240 : 200,
                      top: index === 0 ? 0 : index === 1 ? 170 : 100,
                      right: index === 0 ? 100 : index === 1 ? 0 : undefined,
                      left: index === 2 ? 0 : undefined,
                    }}
                  >
                    <div className="card-icon mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(168,85,247,0.1),rgba(236,72,153,0.1))] text-xl">
                      {card.icon}
                    </div>
                    <div className="text-lg font-semibold">{card.title}</div>
                    <div className="text-sm leading-relaxed text-[var(--ma-muted)]">{card.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="features bg-gradient-to-b from-[var(--ma-bg)] to-black py-24">
          <div className="ma-container space-y-12">
            <div className="space-y-3 text-center">
              <h2 className="text-4xl font-bold tracking-[-0.03em]">Comment ça fonctionne</h2>
              <p className="text-lg text-[var(--ma-muted)]">Simple, rapide et addictif</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {steps.map(step => (
                <div
                  key={step.title}
                  className="feature-item rounded-2xl border border-[var(--ma-border)] bg-[#0f0f0f] p-10 transition duration-300 hover:-translate-y-1 hover:border-[rgba(168,85,247,0.3)] hover:shadow-[0_12px_32px_rgba(168,85,247,0.1)]"
                >
                  <div className="feature-icon mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(168,85,247,0.1),rgba(236,72,153,0.1))] text-2xl">
                    {step.icon}
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                  <p className="leading-relaxed text-[var(--ma-muted)]">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-section py-24">
          <div className="ma-container">
            <div className="cta-box rounded-3xl bg-[var(--ma-gradient)] px-6 py-16 text-center shadow-[0_24px_64px_rgba(168,85,247,0.3)]">
              <h2 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Prêt à tester vos connaissances ?</h2>
              <p className="mt-4 text-lg text-white/90">
                Rejoignez des milliers de joueurs et découvrez si vous êtes vraiment un expert musical
              </p>
              <Link
                href="/auth/login"
                className="mt-8 inline-block rounded-lg bg-white px-10 py-4 text-sm font-semibold text-[#a855f7] transition hover:scale-[1.02]"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
