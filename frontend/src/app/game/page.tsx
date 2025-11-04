import Link from "next/link"
import { SoloGameClient } from "@/components/game/SoloGameClient"
import { ApiError, getServerApi } from "@/lib/apiServer"
import { requireUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const allowedDifficulties = new Set(["easy", "normal", "hard"])

interface GamePageProps {
  searchParams?: Record<string, string | string[] | undefined>
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

export default async function GamePage({ searchParams }: GamePageProps) {
  const user = await requireUser()
  const api = getServerApi()

  const difficultyParam = readParam(searchParams?.difficulty)
  const difficulty = allowedDifficulties.has(difficultyParam ?? "") ? (difficultyParam as "easy" | "normal" | "hard") : "normal"

  const sourceParam = readParam(searchParams?.source)
  const source = sourceParam && typeof sourceParam === "string" ? sourceParam : "liked_tracks"

  try {
    const game = await api.startSoloGame({ difficulty, source })

    if (!game.tracks.length) {
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-lg font-semibold">Aucun titre disponible pour ce mode.</p>
          <p className="text-sm text-muted-foreground">
            Vérifie que tu as bien des morceaux likés avec un extrait disponible.
          </p>
          <Link href="/menu" className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted">
            Retour au menu
          </Link>
        </main>
      )
    }

    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
        <h1 className="text-2xl font-semibold">Blindtest solo</h1>
        <SoloGameClient user={user} tracks={game.tracks} />
      </main>
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-lg font-semibold">Session expirée</p>
          <p className="text-sm text-muted-foreground">Reconnecte-toi pour relancer une partie.</p>
          <Link href="/auth/login" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Reconnexion
          </Link>
        </main>
      )
    }

    console.error("start_game_failed", err)
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">Impossible de démarrer la partie.</p>
        <p className="text-sm text-muted-foreground">Réessaie dans un instant.</p>
        <Link href="/menu" className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted">
          Retour au menu
        </Link>
      </main>
    )
  }
}
