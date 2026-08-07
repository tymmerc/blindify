"use client"

import { useEffect, useState } from "react"
import { X, Check, Loader2, Send } from "lucide-react"
import { api } from "@/lib/api"

type Status = "idle" | "sending" | "sent" | "error"

// Evenement global pour ouvrir le report depuis n'importe ou (menu compte, etc.).
export const BUG_REPORT_EVENT = "open-bug-report"
export function openBugReport() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BUG_REPORT_EVENT))
}

// Modal de report de bug, monte une seule fois dans le layout. S'ouvre via openBugReport().
export function BugReportDialog() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<Status>("idle")

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(BUG_REPORT_EVENT, onOpen)
    return () => window.removeEventListener(BUG_REPORT_EVENT, onOpen)
  }, [])

  const close = () => {
    setOpen(false)
    setStatus("idle")
    setMessage("")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || status === "sending") return
    setStatus("sending")
    try {
      const pageUrl = typeof window !== "undefined" ? window.location.href : undefined
      await api.reportBug(trimmed, pageUrl)
      setStatus("sent")
      setTimeout(close, 1600)
    } catch {
      setStatus("error")
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(46,32,20,.5)] px-4"
      onMouseDown={close}
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 border-[#2e2014] bg-[#f4ecdb] p-6 shadow-[6px_6px_0_rgba(46,32,20,.2)]"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">Un souci ?</p>
            <h2 className="font-display text-xl font-semibold text-[#2e2014]">Signaler un bug</h2>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={close}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-[#2e2014] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            <X size={15} />
          </button>
        </div>

        {status === "sent" ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-[#7d9471] text-[#7d9471]">
              <Check size={24} />
            </span>
            <p className="font-display text-base font-semibold text-[#2e2014]">Merci, c&apos;est noté !</p>
            <p className="text-sm text-[#6b573f]">On regarde ça.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-[#6b573f]">Dis-nous ce qui cloche, on prend tout : un bug, un truc bizarre, une idée.</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              autoFocus
              placeholder="Quand je fais X, il se passe Y au lieu de..."
              className="w-full resize-none rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-3 py-2.5 text-sm text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            />
            {status === "error" && (
              <p className="text-sm font-semibold text-[#9c2f1d]">Envoi impossible, réessaie dans un instant.</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!message.trim() || status === "sending"}
                className="inline-flex items-center gap-2 rounded-full border-2 border-[#2e2014] bg-[#c65133] px-5 py-2 text-sm font-bold text-[#f4ecdb] shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
