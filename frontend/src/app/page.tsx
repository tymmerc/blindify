"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Logo } from "@/components/Logo"
import { api } from "@/lib/api"

const heroCards = [
  { icon: "🎵", title: "Bibliothèque connectée", desc: "Spotify, playlists partagées, titres en direct" },
  { icon: "⚔️", title: "Solo & multijoueur", desc: "Défis instantanés entre amis ou en mode speedrun" },
  { icon: "📈", title: "Scores détaillés", desc: "Streaks, précision, podium auto à chaque manche" },
]

const steps = [
  {
    icon: "🔗",
    title: "Connectez Spotify",
    desc: "Importez vos playlists et celles de vos amis en quelques secondes",
  },
  {
    icon: "⚡",
    title: "Lancez un blind test",
    desc: "Choisissez un mode express ou multijoueur sur vos titres préférés",
  },
  {
    icon: "🏆",
    title: "Dominez le classement",
    desc: "Scores calculés côté serveur, aucun décalage, rematch immédiat",
  },
]

export default function LandingPage() {
  const router = useRouter()
  const [guestLoading, setGuestLoading] = useState(false)
  const [guestError, setGuestError] = useState<string | null>(null)

  const handleGuest = async () => {
    try {
      setGuestLoading(true)
      setGuestError(null)
      const session = await api.ensureUserSession("Invité")
      if (!session) {
        setGuestError("Impossible de créer une session invité.")
        return
      }
      router.replace("/menu")
    } catch (err) {
      console.error("guest_start_failed", err)
      setGuestError("Impossible de créer une session invité.")
    } finally {
      setGuestLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white">
      <header className="fixed top-0 left-0 right-0 z-30 border-b border-[var(--ma-border)] bg-[rgba(10,10,10,0.82)] backdrop-blur-md">
        <div className="ma-container flex items-center justify-between gap-4 py-6">
          <Logo withText priority />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGuest}
              disabled={guestLoading}
              className="inline-flex items-center justify-center rounded-lg border border-[rgba(168,85,247,0.4)] bg-gradient-to-r from-[#8f5bff]/20 to-[#ec4899]/20 px-4 py-2 text-sm font-semibold text-white transition hover:from-[#8f5bff]/30 hover:to-[#ec4899]/30 disabled:opacity-60"
            >
              {guestLoading ? "… " : "Continuer en invité"}
            </button>
          </div>
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
                  Devinez vos morceaux préférés en quelques secondes. Blind test connecté à Spotify : solo ou multijoueur sur vos playlists partagées.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/auth/login" className="ma-btn-primary inline-flex w-fit">
                    Commencer gratuitement
                  </Link>
                </div>
                {guestError ? <p className="text-sm text-red-300">{guestError}</p> : null}
              </div>

              <LiveSnapshot />
            </div>
          </div>
        </section>

        <section className="features bg-gradient-to-b from-[var(--ma-bg)] to-black py-24">
          <div className="ma-container space-y-12">
            <div className="space-y-3 text-center">
              <h2 className="text-4xl font-bold tracking-[-0.03em]">Comment ça fonctionne</h2>
              <p className="text-lg text-[var(--ma-muted)]">Vos musiques, vos défis, en moins d’une minute</p>
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

            <div className="grid gap-6 rounded-3xl border border-[rgba(168,85,247,0.15)] bg-[#0b0b0b] p-10 shadow-[0_24px_64px_rgba(168,85,247,0.12)] md:grid-cols-3">
              {[
                { title: "Zéro latence", desc: "Calcul des scores côté serveur, synchro parfaite avec tes amis" },
                { title: "Modes variés", desc: "Playlists privées, mix commun, difficulté ajustable" },
                { title: "Relance immédiate", desc: "Enchaîne les manches sans quitter la salle" },
              ].map(item => (
                <div key={item.title} className="rounded-2xl bg-[#131313] p-6">
                  <h4 className="text-lg font-semibold">{item.title}</h4>
                  <p className="mt-2 text-[var(--ma-muted)]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="ma-container">
            <div className="relative overflow-hidden rounded-3xl border border-[rgba(168,85,247,0.08)] bg-[#0c0c0c] p-10 shadow-[0_14px_38px_rgba(168,85,247,0.12)]">
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.12),rgba(0,0,0,0))]" />
              <div className="relative">
                <div className="flex items-center justify-between flex-col gap-8 md:flex-row">
                  <div className="text-left">
                    <h2 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Questions fréquentes</h2>
                    <p className="mt-2 text-[var(--ma-muted)]">
                      Tout ce qu’il faut savoir pour lancer votre premier blind test.
                    </p>
                  </div>
                  <Link
                    href="/auth/login"
                    className="inline-block rounded-lg border border-[var(--ma-border)] bg-[#111111] px-10 py-4 text-sm font-semibold text-white transition hover:scale-[1.01] hover:border-[rgba(168,85,247,0.5)]"
                  >
                    En savoir plus
                  </Link>
                </div>

                <div className="mt-10 space-y-4">
                  {[
                    {
                      question: "Est-ce vraiment gratuit ?",
                      answer: "Oui. Tu peux jouer en solo ou en multijoueur sans payer. Le compte reste gratuit pour lancer des parties et tester le mode blind test.",
                    },
                    {
                      question: "Faut-il un compte Spotify Premium ?",
                      answer: "Non. Un compte Spotify gratuit suffit pour importer tes playlists et jouer avec tes amis.",
                    },
                  ].map((item, idx) => (
                    <details
                      key={item.question}
                      className="group rounded-2xl border border-[var(--ma-border)] bg-[#111] px-4 py-3 transition hover:border-[rgba(168,85,247,0.3)]"
                      open={idx === 0}
                    >
                      <summary className="flex cursor-pointer items-center justify-between text-lg font-semibold text-white">
                        {item.question}
                        <span className="text-sm text-[var(--ma-muted)] transition group-open:rotate-90">›</span>
                      </summary>
                      <p className="mt-2 text-[var(--ma-muted)] leading-relaxed">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <button
        type="button"
        onClick={handleGuest}
        disabled={guestLoading}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8f5bff] to-[#ec4899] px-5 py-3 text-sm font-semibold text-white shadow-[0_15px_40px_rgba(168,85,247,0.35)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_48px_rgba(168,85,247,0.45)] disabled:opacity-60"
      >
        {guestLoading ? "Chargement..." : "Continuer en invité"}
      </button>
      {guestError ? (
        <div className="fixed bottom-20 right-5 z-40 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm text-red-200 shadow-lg">
          {guestError}
        </div>
      ) : null}
    </div>
  )
}

function LiveSnapshot() {
  const [round, setRound] = useState(4)
  const [totalRounds] = useState(10)
  const [remaining, setRemaining] = useState(6)
  const [scores, setScores] = useState([
    { name: "gwennaelle", score: 320 },
    { name: "Tymeo", score: 280 },
    { name: "Alex", score: 240 },
  ])
  const [feedback, setFeedback] = useState<{ text: string; key: number } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          setRound(r => (r >= totalRounds ? 1 : r + 1))
          return 12
        }
        return prev - 1
      })
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [totalRounds])

  useEffect(() => {
    const interval = setInterval(() => {
      setScores(prev => {
        const next = [...prev]
        const idx = Math.floor(Math.random() * next.length)
        next[idx] = { ...next[idx], score: next[idx].score + 10 + Math.floor(Math.random() * 15) }
        next.sort((a, b) => b.score - a.score)
        return next
      })
    }, 2200)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const messages = ["+40 pts — Titre correct", "Perfect guess", "Réponse envoyée (2,1s)"]
    const interval = setInterval(() => {
      const text = messages[Math.floor(Math.random() * messages.length)]
      setFeedback({ text, key: Date.now() })
      setTimeout(() => setFeedback(null), 1500)
    }, 2600)
    return () => clearInterval(interval)
  }, [])

  const progress = useMemo(() => {
    const max = 12
    const clamped = Math.max(0, Math.min(max, remaining))
    return Math.round((clamped / max) * 100)
  }, [remaining])

  return (
    <div className="relative h-[460px]">
      <div className="relative h-full overflow-hidden rounded-3xl border border-[rgba(168,85,247,0.2)] bg-[#0f0f0f] shadow-[0_30px_70px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(168,85,247,0.12),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(236,72,153,0.14),transparent_40%)]" />

        <div className="relative flex h-full flex-col justify-between p-6">
          <div className="flex items-center justify-between text-sm text-[var(--ma-muted)]">
            <span>Manche {round} / {totalRounds}</span>
            <span>Temps restant : {remaining.toString().padStart(2, "0")}s</span>
          </div>

          <div className="relative mt-4 overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#111]/80">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.4),rgba(0,0,0,0.1))]" />
            <div className="h-[220px] bg-[url('https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=60')] bg-cover bg-center opacity-70 blur-[0.3px]" />
            <div className="absolute inset-0 flex items-end justify-between p-4">
              <div className="flex flex-col gap-2 text-white">
                <span className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Aperçu de partie</span>
                <div className="text-xl font-semibold">Blind test en cours</div>
                <div className="text-sm text-[var(--ma-muted)]">Top 10 titres • Mode multi</div>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[linear-gradient(90deg,#a855f7,#ec4899)] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="relative mt-4 flex items-end justify-between">
            <div className="w-fit rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0c0c0c]/85 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
              <div className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted)]">Événements</div>
              <div className="mt-2 h-6 text-sm text-white">
                {feedback ? <span className="animate-pulse">{feedback.text}</span> : <span className="text-[var(--ma-muted)]">…</span>}
              </div>
            </div>

            <div className="w-60 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0c0c0c]/85 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
              <div className="text-xs uppercase tracking-[0.25em] text-[var(--ma-muted)]">Classement live</div>
              <div className="mt-2 space-y-2 text-sm">
                {scores.map((player, index) => (
                  <div key={player.name} className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--ma-muted)]">#{index + 1}</span>
                      <span>{player.name}</span>
                    </div>
                    <span className="font-semibold text-[var(--ma-muted)]">{player.score} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
