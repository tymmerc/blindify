"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Music, Sparkles, Shield } from "lucide-react"

export default function AuthLoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

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

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-purple-900 via-indigo-900 to-gray-900 text-white">
        <div className="space-y-2 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-purple-200">Blindify</p>
          <p className="text-lg font-semibold">Vérification de ton compte Spotify…</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-gray-900 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-16 px-6 py-16 lg:flex-row lg:items-center">
        <section className="flex-1 space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm uppercase tracking-[0.3em] text-purple-200">
            <Sparkles className="h-4 w-4" />
            Blindify
          </div>
          <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            Le blindtest Spotify réinventé.
          </h1>
          <p className="max-w-xl text-lg text-purple-100/80">
            Connecte ton compte Spotify et retrouve un blindtest calibré sur tes coups de cœur. Mode solo prêt, multijoueur en approche.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/40">
                  <Music className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Titres likés</p>
                  <p className="text-xs text-purple-100/70">Extraits garantis, blacklist 24h</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/40">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Connexion sécurisée</p>
                  <p className="text-xs text-purple-100/70">Cookie HTTPOnly, pas de stockage local</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex-1">
          <div className="rounded-3xl border border-white/15 bg-white/10 p-8 backdrop-blur">
            <div className="mb-8 space-y-3 text-center">
              <p className="text-sm uppercase tracking-[0.3em] text-purple-200">Connexion</p>
              <h2 className="text-2xl font-semibold">Spotify OAuth sécurisé</h2>
              <p className="text-sm text-purple-100/80">
                Tu es à un clic de lancer ta partie. Pas de spam, pas de surprise.
              </p>
            </div>

            <a
              href={api.getLoginUrl()}
              className="block w-full rounded-2xl bg-white px-6 py-4 text-center text-base font-semibold text-purple-900 transition hover:bg-purple-100"
              rel="noreferrer"
            >
              Continuer avec Spotify
            </a>

            <p className="mt-6 text-center text-xs text-purple-100/70">
              Besoin d'aide ? <span className="underline cursor-pointer" onClick={() => router.push("/")}>Retour à l'accueil</span>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
