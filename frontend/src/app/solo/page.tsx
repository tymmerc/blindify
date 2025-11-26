"use client"

import { Suspense } from "react"
import GameClient from "../game/GameClient"

export const dynamic = "force-dynamic"

export default function SoloPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">Chargement…</div>}>
      <GameClient />
    </Suspense>
  )
}
