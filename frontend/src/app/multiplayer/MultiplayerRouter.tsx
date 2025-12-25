"use client"

import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { resolveGameMode, GAME_MODES } from "@/lib/gameModes"
import { useMode } from "@/contexts/ModeContext"
import { ModeLobbyView } from "./ModeLobbyView"

export function MultiplayerRouter() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { mode, setMode } = useMode()

  const modeParam = resolveGameMode(searchParams.get("mode"))
  const effectiveMode = modeParam ?? mode
  const modeConfig = effectiveMode ? GAME_MODES[effectiveMode] : null
  const intent = searchParams.get("intent")
  const autojoin = searchParams.get("autojoin")
  const initialJoinCode = searchParams.get("code")

  useEffect(() => {
    if (modeParam && modeParam !== mode) {
      setMode(modeParam)
    }
  }, [modeParam, mode, setMode])

  useEffect(() => {
    if (!modeConfig) {
      router.replace("/modes")
    }
  }, [modeConfig, router])

  if (!modeConfig || !effectiveMode) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-neon" />
      </div>
    )
  }

  return (
    <ModeLobbyView
      mode={effectiveMode}
      modeConfig={modeConfig}
      intent={intent}
      initialJoinCode={initialJoinCode}
      autojoin={autojoin}
    />
  )
}
