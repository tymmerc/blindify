"use client"

import { useState, type FormEvent, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import { Logo } from "@/components/Logo"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo")
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedUsername = username.trim()
    if (!trimmedUsername || !password) return

    setError(null)
    setLoading(true)

    try {
      if (mode === "register") {
        await api.register(trimmedUsername, password)
      } else {
        await api.login(trimmedUsername, password)
      }
      router.replace(returnTo || "/modes")
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(168,85,247,0.15),transparent_38%),radial-gradient(circle_at_82%_12%,rgba(34,197,94,0.08),transparent_32%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.12),transparent_40%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <Logo withText priority className="w-fit" />
          <button
            onClick={() => router.push("/modes")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10"
          >
            ← Retour
          </button>
        </header>

        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-3xl border border-white/10 bg-black/50 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            {/* Tab switch */}
            <div className="mb-6 flex rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null) }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  mode === "login"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => { setMode("register"); setError(null) }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  mode === "register"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                Inscription
              </button>
            </div>

            <div className="mb-4 text-center">
              <h1 className="text-xl font-bold">
                {mode === "login" ? "Content de te revoir" : "Crée ton compte"}
              </h1>
              <p className="mt-1 text-sm text-white/50">
                {mode === "login"
                  ? "Connecte-toi pour retrouver tes stats et tes amis."
                  : "Un pseudo et un mot de passe, c'est tout."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Pseudo"
                autoComplete="username"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-white/30"
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mot de passe"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-white/30"
              />
              {error && <p className="text-xs text-red-400 text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="w-full rounded-xl border-2 border-[#a855f7] bg-transparent px-6 py-3 text-sm font-semibold text-[#a855f7] transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)] disabled:opacity-40 disabled:hover:translate-y-0"
              >
                {loading
                  ? "Chargement..."
                  : mode === "login"
                    ? "Se connecter"
                    : "Créer mon compte"}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] uppercase tracking-[0.4em] text-white/30">ou</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              onClick={() => router.push(returnTo || "/solo")}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/70 transition hover:bg-white/10"
            >
              Jouer sans compte
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function AuthLoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#050505] text-white/50">Chargement...</div>}>
      <LoginForm />
    </Suspense>
  )
}
