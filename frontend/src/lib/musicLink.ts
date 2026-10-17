/**
 * Reconnaissance d'un lien de musique pendant la saisie, pour dire tout de
 * suite au joueur ce qu'il a colle. Memes formes que le serveur
 * (backend/src/services/profileImportService.ts, parseProfileUrl) :
 *   open.spotify.com/user/{id}, open.spotify.com/playlist/{id 22 car.}
 *   deezer.com/[xx/]profile/{id}, deezer.com/[xx/]playlist/{id}
 * L'adresse rendue (url) est celle que le serveur accepte : https ajoute s'il
 * manque, segment /intl-xx/ des liens Spotify partages depuis un ordinateur
 * retire. Les liens courts des applis (link.deezer.com, deezer.page.link,
 * spotify.link) ne s'ouvrent qu'en suivant une redirection : le serveur les
 * refuse, on explique quoi faire.
 */
export type MusicLinkProvider = "spotify" | "deezer"

export type MusicLinkRecognition =
  | { kind: "empty" }
  | { kind: "ok"; provider: MusicLinkProvider; type: "user" | "playlist"; url: string }
  | { kind: "short" }
  | { kind: "unknown" }

const SHORT_HOSTS = new Set(["link.deezer.com", "deezer.page.link", "spotify.link", "spotify.app.link"])
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
  const host = url.hostname.replace(/^www\./, "")
  if (SHORT_HOSTS.has(host)) return { kind: "short" }

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
