"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import GameClient from "../game/GameClient"
import { SoloSelector } from "./SoloSelector"

export const dynamic = "force-dynamic"

function SoloPageInner() {
  const searchParams = useSearchParams()
  const hasConfig = Boolean(searchParams.get("source") || searchParams.get("playlistId"))

  if (!hasConfig) {
    return <SoloSelector />
  }

  return <GameClient />
}

export default function SoloPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b573f]">
          Chargement...
        </div>
      }
    >
      <SoloPageInner />
    </Suspense>
  )
}
