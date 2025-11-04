import { requireUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const difficulties = [
  { value: "easy", label: "Facile" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Difficile" },
]

export default async function SoloPage() {
  const user = await requireUser()

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-6 py-16">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Mode solo</p>
        <h1 className="text-3xl font-semibold">Salut {user.username || user.spotify_id}</h1>
        <p className="text-sm text-muted-foreground">
          Configure ta partie en choisissant la difficulté. Les morceaux sont tirés de tes titres likés Spotify.
        </p>
      </header>

      <form action="/game" method="GET" className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="difficulty" className="text-sm font-medium">Difficulté</label>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue="normal"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          >
            {difficulties.map(diff => (
              <option key={diff.value} value={diff.value}>
                {diff.label}
              </option>
            ))}
          </select>
        </div>

        <input type="hidden" name="source" value="liked_tracks" />

        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          Lancer la partie
        </button>
      </form>

      <section className="space-y-2 text-sm text-muted-foreground">
        <p>Chaque titre joué est mis de côté pendant 24h pour éviter les doublons.</p>
        <p>Tu peux liker un morceau pendant la partie pour l'ajouter à ta bibliothèque.</p>
      </section>
    </main>
  )
}
