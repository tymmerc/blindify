"use client"
import { useEffect } from "react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] text-white">
      <div className="text-center space-y-4 px-6">
        <h2 className="text-2xl font-bold">Oups, quelque chose a planté</h2>
        <p className="text-sm text-white/50">{error.message || "Erreur inattendue"}</p>
        <button onClick={reset} className="rounded-xl bg-purple-500/20 border border-purple-500/30 px-6 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/30">
          Réessayer
        </button>
      </div>
    </div>
  )
}
