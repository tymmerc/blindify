"use client"
import { useEffect } from "react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="grid min-h-screen place-items-center text-ink">
      <div className="text-center space-y-4 px-6">
        <h2 className="font-display text-2xl font-semibold">Oups, quelque chose a planté</h2>
        <p className="text-sm text-rouge-txt">{error.message || "Erreur inattendue"}</p>
        <button
          onClick={reset}
          className="rounded-md border-2 border-line bg-terra px-6 py-2 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))]"
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
