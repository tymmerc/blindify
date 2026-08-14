"use client"

import { useEffect, useRef } from "react"

type FriendsGameModalProps = {
  open: boolean
  onClose: () => void
  onCreate: () => void
  onJoin: () => void
  joinCode: string
  setJoinCode: (value: string) => void
  joinError?: string | null
  accentColor: string
  creating?: boolean
  joining?: boolean
}

export function FriendsGameModal({
  open,
  onClose,
  onCreate,
  onJoin,
  joinCode,
  setJoinCode,
  joinError,
  accentColor,
  creating = false,
  joining = false,
}: FriendsGameModalProps) {
  const createRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  useEffect(() => {
    if (open && createRef.current) {
      createRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#2e2014]/25 px-6" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] p-6 text-[#2e2014] shadow-[6px_6px_0_rgba(46,32,20,.25)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Créer ou rejoindre</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[#8a7558] transition hover:text-[#2e2014]"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-4">
            <div className="space-y-1">
              <p className="font-display text-sm font-semibold">Créer une partie</p>
              <p className="text-xs text-[#6b573f]">Invite et lance immédiatement une nouvelle partie.</p>
            </div>
            <button
              ref={createRef}
              onClick={onCreate}
              disabled={creating}
              className="w-full justify-center rounded-md border-2 border-[#2e2014] px-4 py-3 text-sm font-bold text-[#f4ecdb] shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#2e2014] disabled:opacity-60"
              style={{ background: accentColor, opacity: creating ? 0.7 : 1 }}
            >
              {creating ? "Création..." : "Créer une salle"}
            </button>
          </div>

          <div className="space-y-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-4">
            <div className="space-y-1">
              <p className="font-display text-sm font-semibold">Rejoindre une partie</p>
              <p className="text-xs text-[#6b573f]">Entre le code reçu pour rejoindre un lobby existant.</p>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Code de la partie</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                  placeholder="CODE"
                  className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-3 py-2 font-display text-sm uppercase tracking-[0.25em] text-[#2e2014] outline-none placeholder:text-[#b3a182] focus:border-[#2e2014]"
                  maxLength={12}
                />
                <button
                  type="button"
                  onClick={onJoin}
                  disabled={joining}
                  className="rounded-md border-2 border-[#2e2014] px-3 py-2 text-sm font-bold text-[#f4ecdb] shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#2e2014] disabled:opacity-50"
                  style={{ background: accentColor }}
                >
                  {joining ? "Connexion..." : "Rejoindre"}
                </button>
              </div>
              {joinError ? <p className="text-xs font-bold text-[#9c2f1d]">{joinError}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
