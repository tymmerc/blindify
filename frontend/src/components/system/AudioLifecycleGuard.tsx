"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { audioManager } from "@/lib/audioManager"

export function AudioLifecycleGuard() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (lastPath.current && pathname !== lastPath.current) {
      audioManager.stop("navigation")
    }
    lastPath.current = pathname
  }, [pathname])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        audioManager.stop("page_hidden")
      }
    }
    const handleLeave = () => audioManager.stop("page_hide")

    window.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("pagehide", handleLeave)
    window.addEventListener("beforeunload", handleLeave)
    return () => {
      window.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("pagehide", handleLeave)
      window.removeEventListener("beforeunload", handleLeave)
    }
  }, [])

  return null
}
