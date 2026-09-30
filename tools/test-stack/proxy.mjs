// Serveur local de la pile de test, ecoute UNIQUEMENT sur 127.0.0.1.
// Il joue le role de nginx pour le front de test :
//   /blindify/api/*        -> backend de test (prefixe retire, comme nginx)
//   /blindify/socket.io/*  -> backend de test, websocket compris
//   /test-audio/*.mp3      -> extraits synthetiques locaux (pas de Deezer)
//   /blindify/*            -> export statique du front de test
// Aucune dependance : node:http et node:net seulement.
import http from "node:http"
import net from "node:net"
import fs from "node:fs"
import path from "node:path"

const PORT = Number(process.env.PROXY_PORT || 3180)
const BACKEND = { host: "127.0.0.1", port: Number(process.env.BACKEND_PORT || 3098) }
const FRONT = process.env.FRONT_DIR
const AUDIO = process.env.AUDIO_DIR

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".mp3": "audio/mpeg",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".xml": "application/xml",
}

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("introuvable"); return }
    const type = TYPES[path.extname(file)] || "application/octet-stream"
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range)
    if (range) {
      // Les lecteurs audio demandent des plages : sans 206, Chrome ne sait pas
      // reprendre la lecture ni connaitre la duree.
      const start = range[1] ? Number(range[1]) : 0
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 })
      fs.createReadStream(file, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" })
    fs.createReadStream(file).pipe(res)
  })
}

/** Resolution facon export Next (trailingSlash) : /x/ -> /x/index.html. */
function frontFile(urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/blindify/, "")) || "/"
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "")
  let file = path.join(FRONT, safe)
  if (!file.startsWith(FRONT)) return null
  if (safe.endsWith("/")) file = path.join(file, "index.html")
  else if (!path.extname(safe)) file = path.join(file, "index.html")
  return file
}

function toBackend(req, res) {
  const upstream = http.request({
    ...BACKEND,
    method: req.method,
    path: req.url.replace(/^\/blindify/, ""),
    headers: { ...req.headers, "x-forwarded-for": req.socket.remoteAddress || "127.0.0.1", "x-forwarded-proto": "http" },
  }, up => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res) })
  upstream.on("error", err => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" })
    res.end(`backend de test injoignable : ${err.message}`)
  })
  req.pipe(upstream)
}

/* ─── Faux Deezer ───────────────────────────────────────────────────────
 * Le backend de test y est branche via DEEZER_API_BASE. Il repond avec le
 * catalogue synthetique : une "playlist" N contient 12 morceaux du catalogue
 * a partir de N modulo 48, et la recherche d'extrait retrouve un morceau par
 * son titre. Chaque appel est journalise (le rapport les compte). */
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "http://blindz-test.localhost:3180"
let CATALOG = null
const catalogue = () => (CATALOG ??= JSON.parse(fs.readFileSync(path.join(AUDIO, "catalog.json"), "utf8")))
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const item = t => ({
  id: 900000 + t.k, title: t.title, duration: 30, preview: `${PUBLIC_ORIGIN}/test-audio/${t.file}`,
  artist: { id: 700 + (t.k % 8), name: t.artist }, album: { id: 800 + t.k, title: "Album de test", cover_medium: null, cover_big: null },
})
const playlistTracks = id => { const c = catalogue(); const start = Number(id) % c.length; return Array.from({ length: 12 }, (_, i) => c[(start + i) % c.length]) }
const STUB_LOG = process.env.STUB_LOG

function deezerStub(req, res) {
  const u = new URL(req.url, "http://x")
  const p = u.pathname.replace(/^\/deezer-stub/, "")
  if (STUB_LOG) fs.appendFile(STUB_LOG, `${new Date().toISOString()} ${p}${u.search}\n`, () => {})
  const json = (body, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)) }
  let m
  if ((m = p.match(/^\/playlist\/(\d+)\/tracks$/))) return json({ data: playlistTracks(m[1]).map(item), next: null, total: 12 })
  if ((m = p.match(/^\/playlist\/(\d+)$/))) return json({ id: Number(m[1]), title: `Playlist de test ${m[1]}`, nb_tracks: 12, picture_medium: null })
  if ((m = p.match(/^\/user\/(\d+)\/playlists$/))) return json({ data: [{ id: Number(m[1]), title: `Playlist de test ${m[1]}`, nb_tracks: 12, picture_medium: null }], next: null })
  if ((m = p.match(/^\/user\/(\d+)$/))) return json({ id: Number(m[1]), name: `Profil de test ${m[1]}` })
  if ((m = p.match(/^\/track\/(\d+)$/))) { const t = catalogue()[Number(m[1]) - 900000]; return t ? json(item(t)) : json({ error: { code: 800 } }) }
  if (p === "/search/playlist") return json({ data: [] })
  if (p === "/search") {
    const q = norm(u.searchParams.get("q"))
    const hit = catalogue().find(t => q.includes(norm(t.title)))
    return json({ data: hit ? [item(hit)] : [], total: hit ? 1 : 0 })
  }
  return json({ error: { type: "DataException", message: "no data", code: 800 } })
}

const server = http.createServer((req, res) => {
  const url = req.url || "/"
  if (url.startsWith("/deezer-stub/")) return deezerStub(req, res)
  if (url.startsWith("/blindify/api/") || url.startsWith("/blindify/socket.io/")) return toBackend(req, res)
  if (url.startsWith("/test-audio/")) return sendFile(req, res, path.join(AUDIO, path.basename(url.split("?")[0])))
  if (url === "/" || url === "/blindify") { res.writeHead(302, { Location: "/blindify/" }); res.end(); return }
  if (url.startsWith("/blindify/")) {
    const file = frontFile(url.split("?")[0])
    if (!file) { res.writeHead(400); res.end(); return }
    return sendFile(req, res, file)
  }
  res.writeHead(404, { "Content-Type": "text/plain" }); res.end("introuvable")
})

// Websocket : on rejoue la requete d'upgrade vers le backend et on branche les
// deux sockets l'un sur l'autre.
server.on("upgrade", (req, socket, head) => {
  const up = net.connect(BACKEND.port, BACKEND.host, () => {
    const lines = [`${req.method} ${req.url.replace(/^\/blindify/, "")} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    up.write(lines.join("\r\n") + "\r\n\r\n")
    if (head?.length) up.write(head)
    up.pipe(socket); socket.pipe(up)
  })
  const close = () => { up.destroy(); socket.destroy() }
  up.on("error", close); socket.on("error", close)
})

server.listen(PORT, "127.0.0.1", () => console.log(`proxy de test sur http://127.0.0.1:${PORT} (backend ${BACKEND.port})`))
