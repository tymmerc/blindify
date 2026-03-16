"use client"

import Link from "next/link"

export default function HistoryPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] text-white">
      <div className="text-center space-y-4 px-6">
        <p className="text-5xl">📜</p>
        <h1 className="text-2xl font-bold">Historique</h1>
        <p className="text-sm text-white/50 max-w-md">
          Ton historique de parties sera disponible ici prochainement.
        </p>
        <Link
          href="/profile"
          className="inline-block rounded-xl bg-purple-500/20 border border-purple-500/30 px-6 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/30"
        >
          Retour au profil
        </Link>
      </div>
    </div>
  )
}
