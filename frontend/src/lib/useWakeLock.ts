"use client"

import { useEffect } from "react"

/**
 * Empeche l'ecran de se mettre en veille tant que `active` est vrai.
 * Cas d'usage : l'ecran central "autour d'une table" (QR + jeu) et les
 * telephones des joueurs pendant une manche. Sans ca, le tel qui diffuse
 * s'eteint au bout de 30s et la soiree tombe sur un ecran noir.
 *
 * Screen Wake Lock API : supporte iOS 16.4+/Android Chrome. Silencieux si
 * indisponible (le navigateur garde son comportement normal).
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return

    let released = false
    let sentinel: { release: () => Promise<void>; addEventListener?: (t: string, cb: () => void) => void } | null = null

    const acquire = async () => {
      try {
        sentinel = await (navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<never> } }).wakeLock.request("screen")
      } catch {
        // refuse (economie d'energie, onglet cache...) : on retentera au retour de visibilite
      }
    }

    // Le verrou saute quand l'onglet passe en arriere-plan : on le reprend au retour.
    const onVisible = () => {
      if (!released && document.visibilityState === "visible") void acquire()
    }

    void acquire()
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      released = true
      document.removeEventListener("visibilitychange", onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
