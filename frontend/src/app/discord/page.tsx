"use client"

import { Suspense } from "react"
import { DiscordActivity } from "./DiscordActivity"

export default function DiscordPage() {
  return (
    <Suspense fallback={null}>
      <DiscordActivity />
    </Suspense>
  )
}
