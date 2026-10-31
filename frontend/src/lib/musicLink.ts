/**
 * Reconnaissance d'un lien de musique pendant la saisie, pour dire tout de
 * suite au joueur ce qu'il a colle. Memes formes que le serveur
 * (backend/src/services/profileImportService.ts, parseProfileUrl) :
 *   open.spotify.com/user/{id}, open.spotify.com/playlist/{id 22 car.}
 *   deezer.com/[xx/]profile/{id}, deezer.com/[xx/]playlist/{id}
 * L'adresse rendue (url) est celle que le serveur accepte : https ajoute s'il
 * manque, segment /intl-xx/ des liens Spotify partages depuis un ordinateur
 * retire. Les liens courts du bouton Partager des applis (link.deezer.com,
 * spotify.link, spotify.app.link) sont acceptes : le serveur
 * suit lui-meme leur redirection, sous bonne garde
 * (backend/src/services/shortLinkResolver.ts). On les envoie en https, sur le
 * port par defaut et sans identifiants, seule forme qu'il accepte.
 */
export type MusicLinkProvider = "spotify" | "deezer"

export type MusicLinkRecognition =
  | { kind: "empty" }
  | { kind: "ok"; provider: MusicLinkProvider; type: "user" | "playlist"; url: string }
  | { kind: "short"; provider: MusicLinkProvider; url: string }
  | { kind: "unknown" }

const SHORT_HOSTS: Record<string, MusicLinkProvider> = {
  "link.deezer.com": "deezer",
  "spotify.link": "spotify",
  "spotify.app.link": "spotify",
}
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const DEEZER_ID = /^\d{1,20}$/

export function recognizeMusicLink(raw: string): MusicLinkRecognition {
  const trimmed = raw.trim()
  if (!trimmed) return { kind: "empty" }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return { kind: "unknown" }
  }
  const shortProvider = Object.hasOwn(SHORT_HOSTS, url.hostname) ? SHORT_HOSTS[url.hostname] : undefined
  if (shortProvider) {
    if (url.port || url.username || url.password) return { kind: "unknown" }
    const clean = new URL(url.toString())
    clean.protocol = "https:"
    return { kind: "short", provider: shortProvider, url: clean.toString() }
  }

  const host = url.hostname.replace(/^www\./, "")
  if (host === "open.spotify.com") {
    const segments = url.pathname.split("/").filter(Boolean).filter(s => !/^intl-[a-z]{2}$/i.test(s))
    const [type, id] = segments
    const clean = new URL(url.toString())
    clean.protocol = "https:"
    clean.pathname = `/${segments.join("/")}`
    if (type === "user" && id) return { kind: "ok", provider: "spotify", type: "user", url: clean.toString() }
    if (type === "playlist" && id && SPOTIFY_ID.test(id)) return { kind: "ok", provider: "spotify", type: "playlist", url: clean.toString() }
    return { kind: "unknown" }
  }

  if (host === "deezer.com") {
    const [type, id] = url.pathname.split("/").filter(Boolean).filter(s => !/^[a-z]{2}$/.test(s))
    url.protocol = "https:"
    if (type === "profile" && id && DEEZER_ID.test(id)) return { kind: "ok", provider: "deezer", type: "user", url: url.toString() }
    if (type === "playlist" && id && DEEZER_ID.test(id)) return { kind: "ok", provider: "deezer", type: "playlist", url: url.toString() }
    return { kind: "unknown" }
  }

  return { kind: "unknown" }
}
