"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import type { Mode } from "@/contexts/ModeContext"
import { useMode } from "@/contexts/ModeContext"

const VALID_MODES: Mode[] = ["friends", "event", "streamer"]

type ModeGateProps = {
  allowedModes?: Mode[]
  redirectTo?: string
  /** Pass mode from URL search params to bypass localStorage dependency */
  urlMode?: string | null
  children: React.ReactNode
}

export function ModeGate({ allowedModes, redirectTo = "/modes", urlMode, children }: ModeGateProps) {
  const { mode, setMode } = useMode()
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  // If mode is passed via URL, auto-set it in context
  const parsedUrlMode = urlMode && VALID_MODES.includes(urlMode as Mode) ? (urlMode as Mode) : null
  const effectiveMode = mode ?? parsedUrlMode

  useEffect(() => {
    if (parsedUrlMode && parsedUrlMode !== mode) {
      setMode(parsedUrlMode)
    }
  }, [parsedUrlMode, mode, setMode])

  const isAllowed = useMemo(() => {
    if (!allowedModes || allowedModes.length === 0) return Boolean(effectiveMode)
    return Boolean(effectiveMode && allowedModes.includes(effectiveMode))
  }, [effectiveMode, allowedModes])

  useEffect(() => {
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!effectiveMode || !isAllowed) {
      router.replace(`${redirectTo}?from=${encodeURIComponent(pathname || "/")}`)
    }
  }, [ready, effectiveMode, isAllowed, router, redirectTo, pathname])

  if (!ready) return null
  if (!effectiveMode || !isAllowed) return null
  return <>{children}</>
}
