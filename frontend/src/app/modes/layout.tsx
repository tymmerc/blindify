import type { Metadata } from "next"
import type { ReactNode } from "react"
import { SITE_NAME } from "@/lib/site"

// Ecran d'app (choix du mode), deja hors sitemap. Google l'indexait sous /modes
// et /modes/ avec le titre de l'accueil (Search Console, 14/11) : on le sort de
// l'index en gardant ses liens suivis, et le canonical regroupe les deux adresses (T44).
const TITLE = "Choisir un mode de jeu"
const DESC = "Choisis comment jouer à Blindz : à une soirée, chacun chez soi ou tout seul."

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/modes/" },
  robots: { index: false, follow: true },
  openGraph: { siteName: SITE_NAME, title: TITLE, description: DESC, url: "/modes/", type: "website", locale: "fr_FR" },
}

export default function ModesLayout({ children }: { children: ReactNode }) {
  return children
}
