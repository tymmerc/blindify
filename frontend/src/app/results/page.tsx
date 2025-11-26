"use client"

import Link from "next/link"

const quickStats = [
  { label: "Précision", value: "80%" },
  { label: "Temps moyen", value: "6.8s" },
  { label: "Points gagnés", value: "+240" },
]

const breakdown = [
  { label: "Bonnes réponses", value: "16" },
  { label: "Mauvaises réponses", value: "4" },
  { label: "Série max", value: "8" },
]

const answers = [
  { number: 1, track: "Blinding Lights", artist: "The Weeknd", status: "correct" as const },
  { number: 2, track: "Levitating", artist: "Dua Lipa", status: "correct" as const },
  { number: 3, track: "Save Your Tears", artist: "The Weeknd", status: "incorrect" as const, userAnswer: "Starboy" },
  { number: 4, track: "Heat Waves", artist: "Glass Animals", status: "correct" as const },
  { number: 5, track: "Peaches", artist: "Justin Bieber ft. Daniel Caesar", status: "correct" as const },
  { number: 6, track: "Good 4 U", artist: "Olivia Rodrigo", status: "correct" as const },
  { number: 7, track: "Stay", artist: "The Kid LAROI & Justin Bieber", status: "correct" as const },
  { number: 8, track: "drivers license", artist: "Olivia Rodrigo", status: "incorrect" as const, userAnswer: "Pas de réponse" },
  { number: 9, track: "As It Was", artist: "Harry Styles", status: "correct" as const },
  { number: 10, track: "Anti-Hero", artist: "Taylor Swift", status: "correct" as const },
]

export default function ResultsPage() {
  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col items-center gap-4 border-b border-[var(--ma-border)] pb-10 text-center">
          <div className="text-7xl animate-bounce">🏆</div>
          <h1
            className="text-4xl font-bold tracking-[-0.04em] sm:text-5xl"
            style={{ backgroundImage: "var(--ma-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}
          >
            Partie terminée !
          </h1>
          <p className="text-lg text-[var(--ma-muted)]">Voici vos résultats</p>
        </header>

        <section className="overflow-hidden rounded-2xl bg-[var(--ma-gradient)] p-10 text-center shadow-[0_24px_64px_rgba(168,85,247,0.3)]">
          <div className="text-6xl font-black tracking-[-0.06em] text-white drop-shadow-sm">16/20</div>
          <div className="mt-2 text-sm uppercase tracking-[0.4em] text-white/80">Score final</div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {quickStats.map(item => (
              <div key={item.label} className="rounded-xl bg-white/10 px-5 py-4">
                <div className="text-3xl font-bold">{item.value}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/80">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-3">
          {breakdown.map(item => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--ma-border)] bg-[var(--ma-surface)] px-6 py-6 text-center transition hover:-translate-y-1 hover:border-[var(--ma-border-strong)]"
            >
              <div
                className="text-3xl font-bold"
                style={{ backgroundImage: "var(--ma-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}
              >
                {item.value}
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--ma-muted)]">{item.label}</div>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em]">Détails des réponses</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--ma-border)] bg-[var(--ma-surface)]">
            {answers.map((answer, index) => (
              <div
                key={answer.number}
                className={`flex items-center gap-4 px-5 py-4 transition ${
                  index < answers.length - 1 ? "border-b border-[var(--ma-border)]" : ""
                } hover:bg-white/5`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold ${
                    answer.status === "correct"
                      ? "bg-[rgba(76,175,80,0.16)] text-[#4caf50]"
                      : "bg-[rgba(244,67,54,0.16)] text-[#f44336]"
                  }`}
                >
                  {answer.number}
                </div>
                <div className="flex-1">
                  <div className="text-base font-semibold">{answer.track}</div>
                  <div className="text-sm text-[var(--ma-muted)]">{answer.artist}</div>
                  {answer.userAnswer ? (
                    <div className="text-xs text-[#606060]">Votre réponse : {answer.userAnswer}</div>
                  ) : null}
                </div>
                <div
                  className={`text-sm font-semibold ${
                    answer.status === "correct" ? "text-[#4caf50]" : "text-[#f44336]"
                  }`}
                >
                  {answer.status === "correct" ? "✓ Correct" : "✗ Incorrect"}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/solo"
            className="ma-btn-primary w-full justify-center text-base sm:w-auto"
          >
            Rejouer
          </Link>
          <Link
            href="/menu"
            className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--ma-border)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5 sm:w-auto"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  )
}
