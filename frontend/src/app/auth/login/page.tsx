import Link from "next/link"
import { redirect } from "next/navigation"
import { getServerApi } from "@/lib/apiServer"

export const dynamic = "force-dynamic"

export default async function AuthLoginPage() {
  const api = getServerApi()
  const user = await api.currentUser()
  if (user) {
    redirect("/menu")
  }

  const loginUrl = api.getLoginUrl()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold">Connexion Spotify</h1>
        <p className="text-sm text-muted-foreground">
          Nous utilisons ton compte Spotify uniquement pour récupérer tes titres likés et lancer la partie.
        </p>
      </div>

      <a
        href={loginUrl}
        className="rounded-md bg-primary px-6 py-3 text-center font-medium text-primary-foreground transition hover:bg-primary/90"
      >
        Continuer avec Spotify
      </a>

      <div className="text-center text-sm text-muted-foreground">
        <p>
          Besoin d'aide ? <Link href="/" className="underline">Retour à l'accueil</Link>
        </p>
      </div>
    </main>
  )
}
