"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"

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
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0b0b] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Créer ou rejoindre</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-white/60 hover:text-white"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Créer une partie</p>
              <p className="text-xs text-white/60">Invite et lance immédiatement une nouvelle partie.</p>
            </div>
            <button
              ref={createRef}
              onClick={onCreate}
              disabled={creating}
              className="w-full justify-center rounded-xl border px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:opacity-60"
              style={{ borderColor: accentColor, color: accentColor, opacity: creating ? 0.7 : 1 }}
            >
              {creating ? "Création..." : "Créer une salle"}
            </button>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Rejoindre une partie</p>
              <p className="text-xs text-white/60">Entre le code reçu pour rejoindre un lobby existant.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.25em] text-white/60">Code de la partie</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  className="w-full rounded-lg border border-white/15 bg-[#0c0c0c] px-3 py-2 text-sm uppercase tracking-[0.25em] text-white outline-none focus:border-white/30"
                  maxLength={12}
                />
                <button
                  type="button"
                  onClick={onJoin}
                  disabled={joining}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:opacity-50"
                  style={{ borderColor: accentColor, color: accentColor }}
                >
                  {joining ? "Connexion..." : "Rejoindre"}
                </button>
              </div>
              {joinError ? <p className="text-xs text-red-300">{joinError}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
