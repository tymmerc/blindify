import Link from "next/link"
import { LogoutButton } from "@/components/auth/LogoutButton"
import { requireUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function MenuPage() {
  const user = await requireUser()

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Bienvenue</p>
          <h1 className="text-2xl font-semibold">{user.username || user.spotify_id}</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Modes disponibles</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/solo"
            className="rounded-lg border border-border p-4 transition hover:bg-muted"
          >
            <h3 className="text-base font-semibold">Solo</h3>
            <p className="text-sm text-muted-foreground">
              Lance un blindtest avec tes titres likés et garde tes découvertes.
            </p>
          </Link>
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Multijoueur en préparation. Reste connecté.
          </div>
        </div>
      </section>

      <section className="space-y-2 text-sm text-muted-foreground">
        <p>Ton compte est synchronisé avec Spotify. Les titres joués sont automatiquement blacklistés pendant 24h.</p>
        <p>Les morceaux likés depuis une partie sont ajoutés via l'API officielle Spotify.</p>
      </section>
    </main>
  )
}
