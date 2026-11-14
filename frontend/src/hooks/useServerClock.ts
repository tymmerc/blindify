"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Heure serveur fine (4 fois par seconde) pour les decomptes du rythme des
 * manches (T38). `serverNow` (useServerTime) ne tique qu'une fois par seconde :
 * on en tire le decalage avec l'horloge locale, puis on avance tout seul.
 * En pause, l'heure reste figee : le 3-2-1 et la barre ne bougent plus (le
 * serveur decale les echeances de la duree de la pause a la reprise).
 */
export function useServerClock(serverNow: number, active = true, paused = false): number {
  const offsetRef = useRef(serverNow - Date.now())
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    offsetRef.current = serverNow - Date.now()
  }, [serverNow])
  useEffect(() => {
    if (!active || paused) return
    setNow(Date.now() + offsetRef.current)
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 250)
    return () => clearInterval(id)
  }, [active, paused])
  return active ? now : serverNow
}
