import type { Metadata } from "next"
import type { ReactNode } from "react"
import { SITE_NAME } from "@/lib/site"

// La page est un composant client : ses balises viennent d'ici. Sans elles,
// /jouer/ reprenait le titre et la description de l'accueil, sans canonical (T44).
const TITLE = "Lancer une partie de blind test"
const DESC =
  "Choisis un pseudo, colle le lien d'une playlist Spotify ou Deezer, puis crée une partie ou rejoins tes potes avec un code. Gratuit, sans compte ni appli."

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/jouer/" },
  openGraph: { siteName: SITE_NAME, title: TITLE, description: DESC, url: "/jouer/", type: "website", locale: "fr_FR" },
}

export default function JouerLayout({ children }: { children: ReactNode }) {
  return children
}
