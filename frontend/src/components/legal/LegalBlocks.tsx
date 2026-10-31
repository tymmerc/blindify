import type React from "react"
import { CONTACT_EMAIL, CONTACT_MAILTO, DISCORD_SUPPORT_URL } from "@/lib/contact"

// Briques communes aux pages legales (mentions, confidentialite, conditions) :
// la carte de section a bord colore et les liens de contact. DA Club analogique.

const LINK =
  "font-bold text-[#c65133] underline decoration-[#c65133]/40 underline-offset-2 transition hover:decoration-[#c65133]"

interface SectionProps {
  title: string
  accent: string
  children: React.ReactNode
}

export function Section({ title, accent, children }: SectionProps) {
  return (
    <div
      className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]"
      style={{ borderLeft: `6px solid ${accent}` }}
    >
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b573f]">{title}</h2>
      <div className="space-y-1 text-[15px] leading-relaxed text-[#4a3a28]">{children}</div>
    </div>
  )
}

export function ContactLink() {
  return (
    <a href={CONTACT_MAILTO} className={LINK}>
      {CONTACT_EMAIL}
    </a>
  )
}

export function DiscordSupportLink({ children = "le serveur Discord de Blindz" }: { children?: React.ReactNode }) {
  return (
    <a href={DISCORD_SUPPORT_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
      <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
    </a>
  )
}
