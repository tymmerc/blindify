"use client"

import { Suspense } from "react"
import { LiveClient } from "./LiveClient"

export default function LivePage() {
  return (
    <Suspense fallback={null}>
      <LiveClient />
    </Suspense>
  )
}
