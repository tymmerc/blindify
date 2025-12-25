"use client"

import { Suspense } from "react"
import { ModeGate } from "@/components/system/ModeGate"
import { MultiplayerRouter } from "./MultiplayerRouter"

export default function MultiplayerPage() {
  return (
    <ModeGate allowedModes={["friends", "event", "chat"]}>
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[var(--ma-muted)]">Chargement…</div>}>
        <MultiplayerRouter />
      </Suspense>
    </ModeGate>
  )
}
