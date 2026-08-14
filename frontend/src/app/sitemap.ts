import type { MetadataRoute } from "next"

// Export statique : genere /sitemap.xml au build.
export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://blindz.app/", changeFrequency: "weekly", priority: 1 },
    { url: "https://blindz.app/modes/", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://blindz.app/solo/", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://blindz.app/faq/", changeFrequency: "monthly", priority: 0.8 },
    { url: "https://blindz.app/confidentialite/", changeFrequency: "yearly", priority: 0.3 },
    { url: "https://blindz.app/mentions-legales/", changeFrequency: "yearly", priority: 0.3 },
  ]
}
