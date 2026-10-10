import type { Metadata } from "next"
import type React from "react"

// Page chargee par le proxy de Discord dans l'iframe d'une Activite : rien a
// indexer, et pas de titre de site (Discord affiche le nom de l'appli).
export const metadata: Metadata = {
  title: "Blindz dans Discord",
  robots: { index: false, follow: false },
}

export default function DiscordLayout({ children }: { children: React.ReactNode }) {
  return children
}
