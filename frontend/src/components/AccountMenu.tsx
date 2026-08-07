"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { User, BarChart3, History, Settings, Bug } from "lucide-react"
import { openBugReport } from "@/components/BugReportDialog"

type MenuKey = "profile" | "stats" | "history" | "settings"

const ITEMS: { href: string; key: MenuKey; label: string; Icon: typeof User }[] = [
  { href: "/profile", key: "profile", label: "Profil", Icon: User },
  { href: "/stats", key: "stats", label: "Stats", Icon: BarChart3 },
  { href: "/history", key: "history", label: "Historique", Icon: History },
  { href: "/settings", key: "settings", label: "Réglages", Icon: Settings },
]

// Point d'entree compte, en haut a droite des pages principales.
// Remplace l'ancienne barre du bas : un avatar qui ouvre un menu vers
// Profil / Stats / Historique / Reglages (toujours accessible, plus d'impasse).
export function AccountMenu({ active }: { active?: MenuKey }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="fixed right-5 top-6 z-40 sm:right-8 sm:top-8">
      <button
        type="button"
        aria-label="Mon compte"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="grid h-11 w-11 place-items-center rounded-full border-2 border-[#2e2014] bg-[#ece1c8] text-[#2e2014] shadow-[3px_3px_0_rgba(46,32,20,.18)] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgba(46,32,20,.18)]"
      >
        <User className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 min-w-[190px] overflow-hidden rounded-2xl border-2 border-[#2e2014] bg-[#f4ecdb] p-1.5 shadow-[5px_5px_0_rgba(46,32,20,.18)]">
          {ITEMS.map(({ href, key, label, Icon }) => (
            <Link
              key={key}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                active === key
                  ? "bg-[#2e2014] text-[#f4ecdb]"
                  : "text-[#2e2014] hover:bg-[#ece1c8]"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {label}
            </Link>
          ))}
          <div className="my-1 h-px bg-[rgba(46,32,20,.18)]" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              openBugReport()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-[#2e2014] transition hover:bg-[#ece1c8]"
          >
            <Bug className="h-[18px] w-[18px] shrink-0" />
            Signaler un bug
          </button>
        </div>
      )}
    </div>
  )
}
