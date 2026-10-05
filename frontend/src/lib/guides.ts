// Les guides (pages de contenu SEO/GEO), dans l'ordre du pied de page et du
// bloc "A lire aussi". Une seule liste : le sitemap, le pied de page et les
// tests la lisent tous. Ajouter un guide = une ligne ici + sa page dans app/.

export type Guide = { href: string; label: string }

export const GUIDES: readonly Guide[] = [
  { href: "/blind-test-en-ligne-gratuit/", label: "Blind test en ligne gratuit" },
  { href: "/blind-test-spotify/", label: "Blind test avec Spotify" },
  { href: "/blind-test-deezer/", label: "Blind test avec Deezer" },
  { href: "/blind-test-soiree/", label: "Blind test en soirée" },
  { href: "/blind-test-anniversaire/", label: "Blind test d'anniversaire" },
  { href: "/blind-test-evjf-evg/", label: "Blind test EVJF et EVG" },
  { href: "/blind-test-tv/", label: "Blind test sur la télé" },
  { href: "/blind-test-entre-collegues/", label: "Blind test entre collègues" },
  { href: "/comparatif-blind-test/", label: "Comparatif des blind tests" },
]
