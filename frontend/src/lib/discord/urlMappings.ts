import { attemptRemap, patchUrlMappings } from "@discord/embedded-app-sdk"

/**
 * Dans l'iframe d'une Activite, la page vit sous https://<id>.discordsays.com
 * et sa politique de securite n'autorise que cette origine. Tout domaine
 * externe passe par le proxy de Discord, sous /.proxy/<prefixe>, selon les
 * correspondances ("URL Mappings") declarees dans le portail developpeur.
 *
 * Deux correspondances suffisent a Blindz :
 *   /blindz             -> blindz.app            (API et socket)
 *   /dzcdn/{subdomain}  -> {subdomain}.dzcdn.net (extraits Deezer, plusieurs
 *                                                 sous-domaines cdnt-preview, cdns-preview-x...)
 * Les constantes ci-dessous DOIVENT rester identiques au portail
 * (docs/DISCORD-POUR-TYM.md). patchUrlMappings du SDK reecrit fetch, XHR et
 * WebSocket ; l'element audio, lui, n'est pas dans le DOM : createPreviewSrcMapper
 * fait la meme reecriture pour l'audioManager.
 */
export type UrlMapping = { prefix: string; target: string }

export const DISCORD_PROXY_PREFIX = "/.proxy"
export const BLINDZ_MAPPING_PREFIX = `${DISCORD_PROXY_PREFIX}/blindz`
export const DEEZER_MAPPING_PREFIX = `${DISCORD_PROXY_PREFIX}/dzcdn/{subdomain}`
export const DEEZER_MAPPING_TARGET = "{subdomain}.dzcdn.net"

/** Cible d'une correspondance : hote (port compris) et chemin de base, sans protocole ni barre finale. */
export function buildUrlMappings(apiBaseUrl: string): UrlMapping[] {
  const api = new URL(apiBaseUrl)
  const target = `${api.host}${api.pathname.replace(/\/+$/, "")}`
  return [
    { prefix: BLINDZ_MAPPING_PREFIX, target },
    { prefix: DEEZER_MAPPING_PREFIX, target: DEEZER_MAPPING_TARGET },
  ]
}

/** Branche la reecriture des requetes de la page (fetch, XHR, WebSocket) et rend les correspondances. */
export function installUrlMappings(apiBaseUrl: string): UrlMapping[] {
  const mappings = buildUrlMappings(apiBaseUrl)
  patchUrlMappings(mappings, { patchFetch: true, patchWebSocket: true, patchXhr: true, patchSrcAttributes: false })
  return mappings
}

/** Reecrit une adresse absolue vers le proxy quand une correspondance la couvre ; sinon la rend telle quelle. */
export function remapUrl(url: string, mappings: UrlMapping[]): string {
  if (!/^https?:\/\//i.test(url)) return url
  try {
    return attemptRemap({ url: new URL(url), mappings }).toString()
  } catch {
    return url
  }
}

export function createPreviewSrcMapper(mappings: UrlMapping[]): (src: string) => string {
  return src => remapUrl(src, mappings)
}
