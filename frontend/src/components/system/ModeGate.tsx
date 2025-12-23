"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import type { Mode } from "@/contexts/ModeContext"
import { useMode } from "@/contexts/ModeContext"

type ModeGateProps = {
  allowedModes?: Mode[]
  redirectTo?: string
  children: React.ReactNode
}

export function ModeGate({ allowedModes, redirectTo = "/modes", children }: ModeGateProps) {
  const { mode } = useMode()
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  const isAllowed = useMemo(() => {
    if (!allowedModes || allowedModes.length === 0) return Boolean(mode)
    return Boolean(mode && allowedModes.includes(mode))
  }, [mode, allowedModes])

  useEffect(() => {
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!mode || !isAllowed) {
      router.replace(`${redirectTo}?from=${encodeURIComponent(pathname || "/")}`)
    }
  }, [ready, mode, isAllowed, router, redirectTo, pathname])

  if (!ready) return null
  if (!mode || !isAllowed) return null
  return <>{children}</>
}
