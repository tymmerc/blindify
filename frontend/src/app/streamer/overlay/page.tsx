"use client"

import { Suspense } from "react"
import { OverlayClient } from "./OverlayClient"

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayClient />
    </Suspense>
  )
}
