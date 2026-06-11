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
    <main className="relative min-h-screen text-[#2e2014]">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <Logo withText priority className="w-fit" />
          <button
            onClick={() => router.push("/modes")}
            className="rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            ← Retour
          </button>
        </header>

        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-8 shadow-[5px_5px_0_rgba(46,32,20,.18)]">
            {/* Tab switch */}
            <div className="mb-6 flex gap-1 rounded-full border-[1.5px] border-[#2e2014] bg-[#efe5d0] p-1">
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null) }}
                className={`flex-1 rounded-full py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition ${
                  mode === "login"
                    ? "bg-[#2e2014] text-[#f4ecdb]"
                    : "text-[#6b573f] hover:text-[#2e2014]"
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => { setMode("register"); setError(null) }}
                className={`flex-1 rounded-full py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition ${
                  mode === "register"
                    ? "bg-[#2e2014] text-[#f4ecdb]"
                    : "text-[#6b573f] hover:text-[#2e2014]"
                }`}
              >
                Inscription
              </button>
            </div>

            <div className="mb-4 text-center">
              <h1 className="font-display text-2xl font-semibold">
                {mode === "login" ? "Content de te revoir" : "Crée ton compte"}
              </h1>
              <p className="mt-1 text-sm text-[#6b573f]">
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
                className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-sm text-[#2e2014] placeholder:italic placeholder:text-[#b3a182] outline-none transition focus:border-[#c65133]"
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mot de passe"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-sm text-[#2e2014] placeholder:italic placeholder:text-[#b3a182] outline-none transition focus:border-[#c65133]"
              />
              {error && <p className="text-xs text-[#9c2f1d] text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-6 py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#2e2014]"
              >
                {loading
                  ? "Chargement..."
                  : mode === "login"
                    ? "Se connecter"
                    : "Créer mon compte"}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-[rgba(46,32,20,.25)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#8a7558]">ou</span>
              <span className="h-px flex-1 bg-[rgba(46,32,20,.25)]" />
            </div>

            <button
              onClick={() => router.push(returnTo || "/solo")}
              className="mt-4 w-full rounded-md border-2 border-[#2e2014] bg-transparent px-6 py-3 text-sm font-bold text-[#2e2014] transition hover:bg-[rgba(46,32,20,0.07)]"
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
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-[#8a7558]">Chargement...</div>}>
      <LoginForm />
    </Suspense>
  )
}
