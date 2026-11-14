"use client"

import { useState, type FormEvent, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import { Logo } from "@/components/Logo"
import { safeReturnTo } from "@/lib/returnTo"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Valide : seulement un chemin interne au site (voir lib/returnTo.ts).
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
      router.replace(safeReturnTo(returnTo, "/modes"))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen text-ink">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <Logo withText priority className="w-fit" />
          <button
            onClick={() => router.push("/modes")}
            className="rounded-full border-[1.5px] border-line bg-paper-deep px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-ink-block hover:text-on-ink"
          >
            ← Retour
          </button>
        </header>

        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-md border-2 border-line bg-paper-deep p-8 shadow-[5px_5px_0_rgb(var(--c-shadow)/.18)]">
            {/* Tab switch */}
            <div className="mb-6 flex gap-1 rounded-full border-[1.5px] border-line bg-well p-1">
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null) }}
                className={`flex-1 rounded-full py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition ${
                  mode === "login"
                    ? "bg-ink-block text-on-ink"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => { setMode("register"); setError(null) }}
                className={`flex-1 rounded-full py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition ${
                  mode === "register"
                    ? "bg-ink-block text-on-ink"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                Inscription
              </button>
            </div>

            <div className="mb-4 text-center">
              <h1 className="font-display text-2xl font-semibold">
                {mode === "login" ? "Content de te revoir" : "Crée ton compte"}
              </h1>
              <p className="mt-1 text-sm text-ink-2">
                {mode === "login"
                  ? "Connecte-toi pour retrouver tes parties. Ce que tu viens de jouer sans compte sur ce téléphone rejoint ton compte."
                  : "Un pseudo et un mot de passe, c'est tout. Tes parties et ta musique de ce téléphone restent à toi."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Pseudo"
                autoComplete="username"
                className="w-full rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-well px-4 py-3 text-sm text-ink placeholder:italic placeholder:text-pale outline-none transition focus:border-terra"
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mot de passe"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="w-full rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-well px-4 py-3 text-sm text-ink placeholder:italic placeholder:text-pale outline-none transition focus:border-terra"
              />
              {error && <p className="text-xs text-rouge-txt text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="w-full rounded-md border-2 border-line bg-terra px-6 py-3 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_rgb(var(--c-shadow))]"
              >
                {loading
                  ? "Chargement..."
                  : mode === "login"
                    ? "Se connecter"
                    : "Créer mon compte"}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-[rgb(var(--c-line)/.25)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-sourd">ou</span>
              <span className="h-px flex-1 bg-[rgb(var(--c-line)/.25)]" />
            </div>

            <button
              onClick={() => router.push(safeReturnTo(returnTo, "/solo"))}
              className="mt-4 w-full rounded-md border-2 border-line bg-transparent px-6 py-3 text-sm font-bold text-ink transition hover:bg-[rgb(var(--c-ink-block)/0.07)]"
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
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sourd">Chargement...</div>}>
      <LoginForm />
    </Suspense>
  )
}
