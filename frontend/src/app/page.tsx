import Link from "next/link"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-12 px-6 py-16 text-center">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Blindify
          </p>
          <h1 className="text-4xl font-semibold sm:text-5xl">
            Blindtest Spotify simple, rapide, efficace.
          </h1>
          <p className="text-lg text-muted-foreground">
            Connecte ton compte Spotify, joue un blindtest solo avec tes titres likés et garde les morceaux que tu aimes.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth/login"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Se connecter avec Spotify
          </Link>
          <Link
            href="/auth/login"
            className="rounded-md border border-border px-6 py-3 font-medium text-foreground transition hover:bg-muted"
          >
            Découvrir le projet
          </Link>
        </div>

        <ul className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <li>• Authentification sécurisée via Spotify</li>
          <li>• Mode solo avec pré-écoute et révélation</li>
          <li>• Like des morceaux directement depuis la partie</li>
        </ul>
      </div>
    </main>
  )
}
