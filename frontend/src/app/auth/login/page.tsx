"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"

const providers = [
  {
    id: "spotify",
    label: "Continuer avec Spotify",
    desc: "Accès likes, playlists et top artistes instantanément.",
    icon: "🎧",
  },
]

export default function AuthLoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [guestLoading, setGuestLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function verify() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (me) {
          router.replace("/menu")
          return
        }
      } finally {
        if (active) setChecking(false)
      }
    }
    verify()
    return () => {
      active = false
    }
  }, [router])

  async function handleGuest() {
    try {
      setGuestLoading(true)
      setError(null)
      await api.startGuestSession()
      router.replace("/menu")
    } catch (err) {
      console.error(err)
      setError("Impossible de créer une session invité. Réessaie.")
    } finally {
      setGuestLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">
        Vérification de session...
      </div>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--ma-bg)] text-white">
      <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(circle at 25% 20%, rgba(168,85,247,0.25), transparent 55%), radial-gradient(circle at 80% 15%, rgba(34,197,94,0.2), transparent 55%), radial-gradient(circle at 50% 100%, rgba(236,72,153,0.15), transparent 60%)" }} />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-16 px-6 py-16 lg:flex-row lg:items-center">
        <section className="flex-1 space-y-6">
          <span className="ma-pill">Blindify</span>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">Blindify — jouez différemment.</h1>
            <p className="text-sm text-[var(--ma-muted)]">
              Connecte Spotify (ou joue en invité), lance une partie rapide et devine les titres.
              Scoring côté serveur, écoute locale. Sécurisé par design.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="ma-card">
              <p className="text-sm font-semibold">Bibliothèque Spotify</p>
              <p className="mt-2 text-xs text-[var(--ma-muted)]">Playlists, likes, top artistes — tout est prêt.</p>
            </div>
            <div className="ma-card">
              <p className="text-sm font-semibold">Sécurisé par design</p>
              <p className="mt-2 text-xs text-[var(--ma-muted)]">Tokens en session chiffrée, audio jamais streamé depuis nos serveurs.</p>
            </div>
          </div>
        </section>

        <section className="flex-1">
          <div className="rounded-3xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-8 shadow-xl">
            <div className="mb-6 space-y-2 text-center">
              <p className="text-xs uppercase tracking-[0.5em] text-[var(--ma-muted)]">Choisis ton point de départ</p>
              <h2 className="text-2xl font-semibold">Connecte un fournisseur</h2>
            </div>
            <div className="space-y-3">
              {providers.map(provider => (
                <a
                  key={provider.id}
                  href={api.getProviderLoginUrl(provider.id)}
                  className="flex items-center gap-4 rounded-2xl border border-[var(--ma-border)] bg-black/30 px-5 py-4 transition hover:border-[var(--ma-border-strong)]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-lg">{provider.icon}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{provider.label}</p>
                    <p className="text-xs text-[var(--ma-muted)]">{provider.desc}</p>
                  </div>
                  <span className="text-[var(--ma-muted)]">→</span>
                </a>
              ))}
            </div>

            <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.5em] text-[var(--ma-muted)]">
              <span className="h-px flex-1 bg-white/10" />
              ou
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              onClick={handleGuest}
              disabled={guestLoading}
              className="ma-btn-primary w-full justify-center"
            >
              {guestLoading ? "Création..." : "Continuer en invité"}
            </button>

            {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

            <p className="mt-6 text-center text-xs text-[var(--ma-muted)]">
              Besoin d&apos;aide ?{" "}
              <button type="button" className="text-white underline-offset-4 hover:underline" onClick={() => router.push("/")}>
                Retour à l&apos;accueil
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
