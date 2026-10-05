// Faux blindz.app, faux Deezer et faux Resend pour les tests de la sonde
// (checks.test.mjs, passage.test.mjs). Pas un fichier de test lui-meme, et
// jamais copie sur le serveur par installer.sh.

export const BASE = "https://blindz.app"
export const CSP = "default-src 'self'; media-src 'self' data: blob: https://*.scdn.co https://*.dzcdn.net; connect-src 'self'"
export const PREVIEW = "https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnea=exp=1~hmac=x"
export const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0])
export const DEEZER = { id: "deezer", provider: "deezer", label: "Deezer, playlist Top France", url: "https://www.deezer.com/fr/playlist/1109890291" }
export const SPOTIFY = { id: "spotify", provider: "spotify", label: "Spotify, playlist", url: "https://open.spotify.com/playlist/6QfyfBMAoQy8YxbbPL0hkZ" }

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
export const tracks = (n, url = PREVIEW) => Array.from({ length: n }, (_, i) => ({ round: i + 1, title: `t${i}`, artist: "a", audio_url: url }))
export const quickPlayOk = n => json({ success: true, data: { session: { id: 0 }, tracks: tracks(n) }, error: null })
export const quickPlayKo = (code, status = 400, details) => json({ success: false, data: null, error: { code, message: "Pas assez de titres avec extrait audio disponible.", ...(details ? { details } : {}) } }, status)
export const audio = () => new Response(MP3, { status: 206, headers: { "content-type": "audio/mpeg" } })
export const soloHtml = '<html><script src="/_next/static/chunks/app/solo/page-2245b9a9e3449968.js"></script></html>'

/** Faux fetch : routes = (url, init) => Response | Error a lever. Garde la trace des appels. */
export function fakeFetch(routes) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url, init })
    const out = routes(url, init)
    if (out instanceof Error) throw out
    return out
  }
  return { fn, calls }
}

/** Le vrai blindz.app, Deezer et Resend, rejoues. Chaque option remplace une reponse. */
export function prodRoutes({ quickPlay = () => quickPlayOk(10), preview = audio, deezerSearch, resend = () => json({ id: "faux" }) } = {}) {
  return (url, init) => {
    if (url === `${BASE}/api/health`) return json({ success: true, data: { status: "ok" }, error: null })
    if (url === `${BASE}/solo/`) return new Response(soloHtml, { status: 200, headers: { "content-type": "text/html", "content-security-policy": CSP } })
    if (url.startsWith(`${BASE}/_next/`)) return new Response("x", { status: 200, headers: { "content-type": "application/javascript" } })
    if (url === `${BASE}/api/quick-play`) return quickPlay(JSON.parse(init.body))
    if (url.startsWith("https://cdnt-preview.dzcdn.net/")) return preview()
    if (url.startsWith("https://api.deezer.com/search")) return deezerSearch()
    if (url === "https://api.resend.com/emails") return resend(JSON.parse(init.body))
    return new Error(`route inattendue ${url}`)
  }
}

export const noSleep = async () => {}
