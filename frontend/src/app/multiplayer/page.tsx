"use client"

import { Suspense } from "react"
import { MultiplayerRouter } from "./MultiplayerRouter"

export default function MultiplayerPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[var(--ma-muted)]">Chargement…</div>}>
      <MultiplayerRouter />
    </Suspense>
  )
}
