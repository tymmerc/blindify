import type { MetadataRoute } from "next"

// Export statique : genere /sitemap.xml au build.
export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // /jouer/ (le wizard) reste hors sitemap : ecran d'app, pas une page de contenu.
    { url: "https://blindz.app/", lastModified: new Date("2026-09-09"), changeFrequency: "weekly", priority: 1 },
    // /modes/ et /solo/ sortis : ecrans d'app ("Chargement..." pour un crawler), pas du contenu.
    { url: "https://blindz.app/faq/", lastModified: new Date("2026-09-09"), changeFrequency: "monthly", priority: 0.8 },
    { url: "https://blindz.app/blind-test-en-ligne-gratuit/", lastModified: new Date("2026-09-08"), changeFrequency: "monthly", priority: 0.8 },
    { url: "https://blindz.app/blind-test-spotify/", lastModified: new Date("2026-09-08"), changeFrequency: "monthly", priority: 0.8 },
    { url: "https://blindz.app/blind-test-deezer/", lastModified: new Date("2026-09-08"), changeFrequency: "monthly", priority: 0.8 },
    { url: "https://blindz.app/blind-test-soiree/", lastModified: new Date("2026-09-08"), changeFrequency: "monthly", priority: 0.8 },
    { url: "https://blindz.app/comparatif-blind-test/", lastModified: new Date("2026-09-08"), changeFrequency: "monthly", priority: 0.8 },
    { url: "https://blindz.app/confidentialite/", changeFrequency: "yearly", priority: 0.3 },
    { url: "https://blindz.app/mentions-legales/", changeFrequency: "yearly", priority: 0.3 },
  ]
}
