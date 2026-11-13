"use client"

import { useEffect, useState } from "react"
import { Share, Plus, X, Smartphone } from "lucide-react"

type BIPEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }

/**
 * Bandeau "Installer Blindz" : install natif un-tap sur Android (beforeinstallprompt),
 * mini-guide Partager -> Sur l'ecran d'accueil sur iPhone (Apple interdit l'install par code).
 * Se cache si l'app tourne deja en standalone ou si l'utilisateur a fermé le bandeau.
 */
export function InstallApp() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return // deja installee

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)

    let dismissed = false
    try { dismissed = localStorage.getItem("blindz_install_dismissed") === "1" } catch { /* ignore */ }
    if (dismissed) return

    // Android/Chrome : on capture l'evenement pour offrir l'install un-tap.
    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); setShow(true) }
    window.addEventListener("beforeinstallprompt", onBIP)

    // iOS : pas d'evenement, on montre le bandeau-guide directement.
    if (ios) setShow(true)

    return () => window.removeEventListener("beforeinstallprompt", onBIP)
  }, [])

  const dismiss = () => {
    try { localStorage.setItem("blindz_install_dismissed", "1") } catch { /* ignore */ }
    setShow(false)
    setGuideOpen(false)
  }

  const handleInstall = async () => {
    if (deferred) {
      deferred.prompt()
      try { await deferred.userChoice } catch { /* ignore */ }
      setDeferred(null)
      setShow(false)
    } else {
      setGuideOpen(true) // iPhone (ou fallback) : on montre les gestes
    }
  }

  if (!show) return null

  return (
    <>
      {/* Carte integree (pas de position fixe) : a poser sur l'ecran de fin de partie. */}
      <div className="flex items-center gap-3 rounded-md border-2 border-line bg-paper-deep px-4 py-3 text-left shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]">
        <Smartphone className="h-5 w-5 shrink-0 text-terra-txt" />
        <p className="m-0 min-w-0 flex-1 text-[13px] leading-tight text-ink">
          <span className="font-bold">Installe Blindz</span> pour relancer une partie en un tap
        </p>
        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 rounded-full border-2 border-line bg-terra px-3.5 py-1.5 text-xs font-bold text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition active:translate-x-[1px] active:translate-y-[1px]"
        >
          Installer
        </button>
        <button type="button" onClick={dismiss} aria-label="Fermer" className="shrink-0 text-sourd transition hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>

      {guideOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-block/45 px-6" onClick={() => setGuideOpen(false)}>
          <div className="w-full max-w-sm rounded-md border-2 border-line bg-paper p-6 text-center shadow-[6px_6px_0_rgb(var(--c-shadow)/.25)]" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sourd">Installer Blindz</p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-ink">2 gestes, c'est tout</h3>
            <ol className="mt-5 space-y-3 text-left text-sm text-ink">
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-line bg-paper-deep font-bold">1</span>
                <span className="flex items-center gap-1.5">Touche <Share className="inline h-4 w-4" /> <span className="font-semibold">Partager</span>{isIOS ? " (en bas)" : " du navigateur"}</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-line bg-paper-deep font-bold">2</span>
                <span className="flex items-center gap-1.5"><Plus className="inline h-4 w-4" /> <span className="font-semibold">Sur l'écran d'accueil</span></span>
              </li>
            </ol>
            <p className="mt-4 text-xs text-sourd">{isIOS ? "Sur iPhone, ça doit être dans Safari." : ""}</p>
            <button type="button" onClick={() => setGuideOpen(false)} className="mt-5 w-full rounded-md border-2 border-line bg-paper-deep px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-paper-strong">
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </>
  )
}
