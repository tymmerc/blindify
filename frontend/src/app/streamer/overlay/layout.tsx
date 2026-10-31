import type { Metadata } from "next"
import type React from "react"

// Overlay OBS du streamer (T5) : son lien porte un jeton signe et l'extrait
// passe par cette page. Rien a indexer, et le jeton ne part jamais dans un
// en-tete Referer.
export const metadata: Metadata = {
  title: "Blindz · overlay",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

// Fond transparent pour la source navigateur d'OBS : ni papier, ni grain.
const TRANSPARENT = `
html, body { background: transparent !important; }
body::after { display: none !important; }
body > div.fixed.inset-0.-z-10 { display: none !important; }
`

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{TRANSPARENT}</style>
      {children}
    </>
  )
}
