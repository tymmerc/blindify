"use client"

import { Suspense } from "react"
import GameClient from "./GameClient"

export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center">Chargement…</div>}>
      <GameClient />
    </Suspense>
  )
}
