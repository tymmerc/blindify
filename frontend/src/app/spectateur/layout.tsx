import type { Metadata } from "next"
import type React from "react"

// Page du lien spectateur envoye a Tym par mail (T18) : rien a indexer, et le
// jeton du lien ne part jamais dans un en-tete Referer.
export const metadata: Metadata = {
  title: "Blindz · spectateur",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function SpectatorLayout({ children }: { children: React.ReactNode }) {
  return children
}
