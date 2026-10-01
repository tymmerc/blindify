import { publicPath } from "./publicPath"

/** basePath du build ("" a la racine sur blindz.app, "/blindify" sur le dev). */
const BASE_PATH = publicPath("/").replace(/\/$/, "")

/**
 * Ou revenir apres la connexion. returnTo arrive dans l'adresse de la page :
 * n'importe qui peut fabriquer un lien .../auth/login?returnTo=https://autre-site
 * (redirection ouverte, pratique pour l'hameconnage) ou ?returnTo=javascript:...
 * On n'accepte qu'un chemin interne au site : il commence par un seul "/", sans
 * antislash (le navigateur lit "/\site" comme "//site") ni caractere de controle.
 * Sinon on retombe sur la page par defaut.
 *
 * Le basePath est retire s'il est present : le routeur de Next le rajoute
 * lui-meme, sinon on arrivait sur /blindify/blindify/... en dev.
 */
export function safeReturnTo(raw: string | null, fallback: string, basePath: string = BASE_PATH): string {
  if (!raw) return fallback
  // eslint-disable-next-line no-control-regex
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) {
    return fallback
  }
  if (basePath && (raw === basePath || raw.startsWith(`${basePath}/`))) {
    return raw.slice(basePath.length) || "/"
  }
  return raw
}

/** Chemin de la page courante, sans le basePath, a passer dans returnTo. */
export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/"
  return safeReturnTo(window.location.pathname + window.location.search, "/")
}
