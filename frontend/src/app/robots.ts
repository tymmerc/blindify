import type { MetadataRoute } from "next"

// Export statique : genere /robots.txt au build.
export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://blindz.app/sitemap.xml",
    host: "https://blindz.app",
  }
}
