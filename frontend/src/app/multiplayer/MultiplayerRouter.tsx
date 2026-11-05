"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { resolveGameMode, GAME_MODES } from "@/lib/gameModes"
import { useMode } from "@/contexts/ModeContext"
import { ModeLobbyView } from "./ModeLobbyView"
import { entryNickname, joinEntryPath, readStoredNickname, rememberNickname } from "@/lib/roomAddress"

export function MultiplayerRouter() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { mode, setMode } = useMode()

  const modeParam = resolveGameMode(searchParams.get("mode"))
  const effectiveMode = modeParam ?? mode
  const modeConfig = effectiveMode ? GAME_MODES[effectiveMode] : null
  const autojoin = searchParams.get("autojoin")
  const initialJoinCode = searchParams.get("code")
  // Un code dans l'adresse l'emporte sur intent=host (T7) : c'est une salle qui
  // existe deja. Le serveur dit ensuite qui en est l'hote. Avant, l'adresse de
  // l'hote, recopiee par un ami ou rouverte apres un F5, recreait une salle.
  const intent = initialJoinCode ? null : searchParams.get("intent")
  const profileUrl = searchParams.get("profileUrl")
  // Le pseudo de ce navigateur, lu une fois au montage. Un hote arrive sans
  // code avec son pseudo dans l'adresse : c'est le sien, on le garde, car
  // l'adresse perd le pseudo des que la salle est creee.
  const [storedNick] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    const own = readStoredNickname()
    if (own?.trim()) return own
    const fromUrl = searchParams.get("nickname")?.trim()
    if (!initialJoinCode && fromUrl) {
      rememberNickname(fromUrl)
      return fromUrl
    }
    return null
  })
  const entry = entryNickname({ urlNick: searchParams.get("nickname"), storedNick, code: initialJoinCode })
  const nickname = entry.nickname
  // Code d'une salle mais pas de pseudo ici (adresse recopiee sur un autre
  // telephone) : on passe par l'entree du QR, qui demande le sien.
  const needsName = entry.needsName && Boolean(initialJoinCode)

  useEffect(() => {
    if (modeParam && modeParam !== mode) {
      setMode(modeParam)
    }
  }, [modeParam, mode, setMode])

  useEffect(() => {
    if (needsName && initialJoinCode) {
      router.replace(joinEntryPath(initialJoinCode))
      return
    }
    if (!modeConfig) {
      router.replace("/modes")
    }
  }, [modeConfig, router, needsName, initialJoinCode])

  if (!modeConfig || !effectiveMode || needsName) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#c65133]" />
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
      initialProfileUrl={profileUrl}
      initialNickname={nickname}
    />
  )
}
