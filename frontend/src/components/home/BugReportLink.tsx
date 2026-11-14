"use client"

import type { ReactNode } from "react"
import { openBugReport } from "@/components/BugReportDialog"

// Seul ilot client du pied de page : ouvre le formulaire "Signaler un bug",
// deja monte une fois pour toutes dans le layout racine. Un bouton et pas un
// lien : il n'y a pas de page derriere, juste la fenetre de signalement.
export function BugReportLink({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={openBugReport}
      className="border-b-2 border-ambre font-bold transition hover:border-on-ink hover:text-ambre-txt"
    >
      {children}
    </button>
  )
}
