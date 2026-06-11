"use client"
import { useEffect } from "react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="grid min-h-screen place-items-center text-[#2e2014]">
      <div className="text-center space-y-4 px-6">
        <h2 className="font-display text-2xl font-semibold">Oups, quelque chose a planté</h2>
        <p className="text-sm text-[#9c2f1d]">{error.message || "Erreur inattendue"}</p>
        <button
          onClick={reset}
          className="rounded-md border-2 border-[#2e2014] bg-[#c65133] px-6 py-2 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
