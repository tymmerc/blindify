import Link from "next/link"
import { getServerApi } from "@/lib/apiServer"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

interface AuthCallbackPageProps {
  searchParams?: Record<string, string | string[] | undefined>
}

export default async function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const api = getServerApi()
  const user = await api.currentUser()
  if (user) {
    redirect("/menu")
  }

  const errorParam = typeof searchParams?.error === "string" ? searchParams?.error : null

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold">Connexion en cours…</h1>
      <p className="text-sm text-muted-foreground">
        Nous n'avons pas pu valider ta session Spotify. Rafraîchis la page ou relance le processus de connexion.
      </p>
      {errorParam ? (
        <p className="text-sm text-destructive">Erreur : {errorParam}</p>
      ) : null}
      <Link
        href="/auth/login"
        className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
      >
        Retour à la connexion
      </Link>
    </main>
  )
}
