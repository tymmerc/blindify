"use client"

import { useEffect, useState } from "react"
import { inAppBrowserName, regularBrowserName } from "@/lib/inAppBrowser"

// Une ligne discrete, seulement dans le navigateur d'une appli (T26).
export function InAppBrowserNote({ className = "" }: { className?: string }) {
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
    const app = inAppBrowserName(ua)
    if (app) {
      setNote(
        `Tu es dans ${app}. Ça marche, mais ${app} ne retient pas tes parties d'une fois sur l'autre. Pour les retrouver, ouvre le lien dans ${regularBrowserName(ua)}.`
      )
    }
  }, [])

  if (!note) return null
  return <p className={`text-[12px] leading-snug text-sourd ${className}`}>{note}</p>
}
