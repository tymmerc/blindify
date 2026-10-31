"use client"

import { Suspense } from "react"
import { SpectatorClient } from "./SpectatorClient"

export default function SpectatorPage() {
  return (
    <Suspense fallback={null}>
      <SpectatorClient />
    </Suspense>
  )
}
