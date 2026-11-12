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
 *
 * YouTube et YouTube Music (backend/src/services/youtubeImportService.ts) :
 * seulement les playlists (?list=, music.youtube.com/browse/VL...). Une video
 * seule, un mix automatique ou les listes privees par nature (J'aime, A
 * regarder plus tard) sont refuses tout de suite, avec la raison.
 */
export type MusicLinkProvider = "spotify" | "deezer" | "youtube"
export type YoutubeRefusal = "video" | "mix" | "private"

export type MusicLinkRecognition =
  | { kind: "empty" }
  | { kind: "ok"; provider: MusicLinkProvider; type: "user" | "playlist"; url: string }
  | { kind: "short"; provider: MusicLinkProvider; url: string }
  | { kind: "refused"; provider: "youtube"; reason: YoutubeRefusal }
  | { kind: "unknown" }

const SHORT_HOSTS: Record<string, MusicLinkProvider> = {
  "link.deezer.com": "deezer",
  "spotify.link": "spotify",
  "spotify.app.link": "spotify",
}
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const DEEZER_ID = /^\d{1,20}$/
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"])
const YOUTUBE_LIST = /^[A-Za-z0-9_-]{2,64}$/

function recognizeYoutube(url: URL, host: string): MusicLinkRecognition {
  const browse = host === "music.youtube.com" ? url.pathname.match(/^\/browse\/VL([A-Za-z0-9_-]{2,64})\/?$/) : null
  const list = url.searchParams.get("list") ?? browse?.[1] ?? null
  if (!list || !YOUTUBE_LIST.test(list)) {
    // Une video seule (watch?v=, youtu.be/ID, shorts) : il faut le lien de la playlist.
    return /^\/(watch|shorts\/|live\/)/.test(url.pathname) || host === "youtu.be"
      ? { kind: "refused", provider: "youtube", reason: "video" }
      : { kind: "unknown" }
  }
  if (/^(LL|LM|WL)$/.test(list)) return { kind: "refused", provider: "youtube", reason: "private" }
  if (/^RD/.test(list) && !/^RDCLAK5uy_/.test(list)) return { kind: "refused", provider: "youtube", reason: "mix" }
  // L'adresse de la liste seule : ni la video, ni le ?si= du partage.
  const family = host === "music.youtube.com" ? "music" : "www"
  return { kind: "ok", provider: "youtube", type: "playlist", url: `https://${family}.youtube.com/playlist?list=${list}` }
}

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

  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (YOUTUBE_HOSTS.has(host)) return recognizeYoutube(url, host)

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
