import type { Metadata } from "next"
import type React from "react"

// Page des viewers d'un live (T5) : le code est affiche sur le stream.
export const metadata: Metadata = {
  title: "Blindz · jouer pendant le live",
  description: "Entre le code affiché sur le stream et ton pseudo, puis devine les morceaux avec le reste du chat.",
}

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return children
}
