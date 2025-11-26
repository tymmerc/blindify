"use client"

import Link from "next/link"

const modes = [
  {
    title: "Solo",
    icon: "🎧",
    description: "Jouez à votre rythme et améliorez votre score personnel",
    features: ["Pas de limite de temps", "Historique des manches", "Statistiques détaillées"],
    href: "/solo",
    cta: "Jouer en solo",
  },
  {
    title: "Multijoueur",
    icon: "👥",
    description: "Défiez vos amis en temps réel et montez au classement",
    features: ["Chat en direct", "Classement en temps réel", "Jusqu'à 10 joueurs"],
    href: "/multiplayer",
    cta: "Jouer en multijoueur",
  },
]

export default function ModeSelectionPage() {
  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-14">
        <div className="flex items-center justify-between">
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            ← Retour
          </Link>
          <div className="flex-1 text-center">
            <h1
              className="text-4xl font-bold tracking-[-0.04em] sm:text-5xl"
              style={{ backgroundImage: "var(--ma-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}
            >
              Choisir un mode de jeu
            </h1>
            <p className="mt-3 text-base text-[var(--ma-muted)]">Comment voulez-vous jouer ?</p>
          </div>
          <div className="w-[120px]" aria-hidden />
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {modes.map(mode => (
            <div
              key={mode.title}
              className="relative overflow-hidden rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-10 text-center shadow-[0_24px_64px_rgba(0,0,0,0.25)] transition duration-300 hover:-translate-y-2 hover:border-[var(--ma-border-strong)] hover:shadow-[0_24px_64px_rgba(168,85,247,0.2)]"
            >
              <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "var(--ma-gradient)" }} />
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="text-7xl">{mode.icon}</div>
                <h2 className="text-3xl font-bold tracking-[-0.03em]">{mode.title}</h2>
                <p className="text-[15px] leading-relaxed text-[var(--ma-muted)]">{mode.description}</p>
                <div className="mt-4 flex flex-col gap-3 text-[var(--ma-muted)]">
                  {mode.features.map(feature => (
                    <div key={feature} className="flex items-center justify-center gap-2 text-sm font-medium">
                      <span className="text-[#a855f7]">✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <Link href={mode.href} className="ma-btn-primary mt-6 w-full justify-center text-base">
                  {mode.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
