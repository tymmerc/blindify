"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * « Arrêter la partie » (T42), hote seulement : la partie s'arrete et tout le
 * monde revient dans la salle d'attente. Une confirmation evite le clic par
 * erreur. Fenetre dessinee dans la page, pas window.confirm : l'iframe de
 * l'activite Discord peut bloquer les boites du navigateur.
 */
export function StopGameButton({
  onStop,
  className,
  children,
}: {
  onStop: () => Promise<unknown> | void
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onStop()
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label="Arrêter la partie" title="Arrêter la partie">
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-scrim/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="stop-game-title"
            aria-describedby="stop-game-text"
            className="w-full max-w-sm rounded-md border-2 border-line bg-paper p-5 text-left text-ink shadow-[6px_6px_0_rgb(var(--c-shadow)/.25)]"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="stop-game-title" className="m-0 font-display text-lg font-semibold">Arrêter la partie ?</h2>
            <p id="stop-game-text" className="mb-4 mt-1 text-sm text-ink-2">Tout le monde revient dans la salle.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border-2 border-line bg-paper-deep px-4 py-2.5 text-sm font-bold transition hover:bg-paper-strong"
              >
                Continuer
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="rounded-md border-2 border-line bg-ink-block px-4 py-2.5 text-sm font-bold text-on-ink transition disabled:opacity-60"
              >
                Arrêter la partie
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
