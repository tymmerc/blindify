import type { MetadataRoute } from "next"

// Export statique : genere /robots.txt au build.
export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // Accueil explicite des crawlers IA : on VEUT etre cite par ChatGPT,
      // Claude, Perplexity et les reponses IA de Google.
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended"], allow: "/" },
    ],
    sitemap: "https://blindz.app/sitemap.xml",
    host: "https://blindz.app",
  }
}
