/**
 * Prefix a path with the app basePath so assets work both locally and once exported.
 * Default matches next.config.mjs ("/blindify"); can be overridden with NEXT_PUBLIC_BASE_PATH.
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/blindify").replace(/\/+$/, "")

export function publicPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  if (!BASE_PATH) return normalized
  return `${BASE_PATH}${normalized}`
}

/**
 * Adresse complete d'une page du site, pour les liens a partager : origine
 * courante + basePath. Jamais de domaine en dur : le meme code tourne sur
 * blindz.app, sur dev.tymmerc.eu/blindify et sur la pile de test. (Le lien de
 * defi pointait encore sur tymmerc.eu/blindify, simple redirection vers
 * blindz.app, trouve par la campagne de tests le 30/09/2026.)
 */
export function absoluteUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}${publicPath(path)}`
}

/** Adresse du site a afficher (texte ou image partages) : "blindz.app" en prod. */
export function siteLabel(): string {
  return absoluteUrl("/").replace(/^https?:\/\//, "").replace(/\/+$/, "")
}
