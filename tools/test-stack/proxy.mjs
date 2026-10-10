// Serveur local de la pile de test, ecoute UNIQUEMENT sur 127.0.0.1.
// Il joue le role de nginx pour le front de test :
//   /blindify/api/*        -> backend de test (prefixe retire, comme nginx)
//   /blindify/socket.io/*  -> backend de test, websocket compris
//   /test-audio/*.mp3      -> extraits synthetiques locaux (pas de Deezer)
//   /blindify/*            -> export statique du front de test
// Et le role du proxy de Discord pour l'Activite :
//   /.proxy/blindz/*       -> la meme chose que /blindify/* (correspondance
//                             "/blindz -> blindz.app" du portail developpeur)
//   /discord-stub/*        -> faux Discord : echange du code OAuth2, utilisateur,
//                             et qui est dans quel salon (pour le harnais)
//   /discord-harness.html  -> le harnais : la page qui joue le client Discord
//                             (RPC du SDK par postMessage) autour de l'iframe
// Aucune dependance : node:http et node:net seulement.
import http from "node:http"
import net from "node:net"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pipeline } from "node:stream"

const HERE = path.dirname(fileURLToPath(import.meta.url))

// Une requete mal formee ne doit jamais tuer le serveur en pleine campagne :
// les scenarios suivants echoueraient en "connexion refusee" sans cause lisible.
process.on("uncaughtException", err => console.error(`[proxy] exception rattrapee : ${err?.stack || err}`))

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

const plain = (res, code, text) => { if (!res.headersSent) res.writeHead(code, { "Content-Type": "text/plain" }); res.end(text) }
// pipeline detruit le flux de lecture si le client coupe en cours de route.
const stream = (file, res, opts) => pipeline(fs.createReadStream(file, opts), res, () => {})

/** Plage HTTP -> [debut, fin] inclusifs, null si absente, false si hors fichier. */
function parseRange(header, size) {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === "" && m[2] === "")) return null
  let start, end
  if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1 } // suffixe : les N derniers octets
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1) }
  if (start >= size || end < start) return false
  return [start, end]
}

function sendFile(req, res, file) {
  try {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return plain(res, 404, "introuvable")
      const type = TYPES[path.extname(file)] || "application/octet-stream"
      const range = parseRange(req.headers.range, st.size)
      if (range === false) {
        res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); res.end(); return
      }
      if (range) {
        // Les lecteurs audio demandent des plages : sans 206, Chrome ne sait pas
        // reprendre la lecture ni connaitre la duree.
        const [start, end] = range
        res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 })
        return stream(file, res, { start, end })
      }
      res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" })
      stream(file, res)
    })
  } catch {
    plain(res, 400, "chemin invalide") // ex. octet nul : fs.stat leve de facon synchrone
  }
}

/** Resolution facon export Next (trailingSlash) : /x/ -> /x/index.html. */
function frontFile(urlPath) {
  let rel
  try { rel = decodeURIComponent(urlPath.replace(/^\/blindify/, "")) || "/" } catch { return null } // %, %zz...
  if (rel.includes("\0")) return null
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

/* ─── Faux Discord ──────────────────────────────────────────────────────
 * Le backend de test y est branche via DISCORD_API_BASE : l'echange du code
 * OAuth2 et la lecture de l'utilisateur, comme chez Discord mais sans reseau.
 * Un code vaut un joueur : "test-code-<n>" donne le jeton "test-token-<n>",
 * qui donne l'utilisateur n (identifiant a 18 chiffres, comme un vrai).
 * Le harnais s'en sert aussi comme registre : qui est dans quel salon, pour
 * repondre a getInstanceConnectedParticipants et pousser les mises a jour. */
const snowflake = n => String(100000000000000000n + BigInt(n))
const NAMES = new Map()        // uid -> nom d'affichage donne par le harnais
const INSTANCES = new Map()    // instance -> Map(uid -> participant)
const stubUser = uid => ({ id: snowflake(uid), username: `joueur${uid}`, global_name: NAMES.get(String(uid)) ?? `Joueur ${uid}`, discriminator: "0", avatar: null, flags: 0, bot: false })
const participantsOf = iid => [...(INSTANCES.get(iid)?.values() ?? [])]

function readBody(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", c => { body += c; if (body.length > max) { reject(new Error("corps trop long")); req.destroy() } })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

async function discordStub(req, res) {
  const u = new URL(req.url, "http://x")
  const p = u.pathname.replace(/^\/discord-stub/, "")
  if (STUB_LOG) fs.appendFile(STUB_LOG, `${new Date().toISOString()} discord ${req.method} ${p}\n`, () => {})
  const json = (body, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)) }
  let m
  if (p === "/oauth2/token" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req))
    const code = form.get("code") || ""
    const uid = (m = /^test-code-(\d+)$/.exec(code)) ? m[1] : null
    if (!uid || form.get("grant_type") !== "authorization_code" || !form.get("client_secret")) return json({ error: "invalid_grant" }, 400)
    return json({ access_token: `test-token-${uid}`, token_type: "Bearer", expires_in: 604800, refresh_token: `test-refresh-${uid}`, scope: "identify" })
  }
  if (p === "/users/@me") {
    const uid = (m = /^Bearer test-token-(\d+)$/.exec(req.headers.authorization || "")) ? m[1] : null
    if (!uid) return json({ message: "401: Unauthorized", code: 0 }, 401)
    return json(stubUser(uid))
  }
  if ((m = p.match(/^\/instances\/([A-Za-z0-9_.:-]{1,64})\/participants$/))) {
    const iid = m[1]
    if (req.method === "POST") {
      let body = {}
      try { body = JSON.parse(await readBody(req) || "{}") } catch { return json({ error: "json" }, 400) }
      const uid = String(body.uid ?? "")
      if (!/^\d{1,6}$/.test(uid)) return json({ error: "uid" }, 400)
      if (typeof body.name === "string" && body.name.trim()) NAMES.set(uid, body.name.trim().slice(0, 32))
      if (!INSTANCES.has(iid)) INSTANCES.set(iid, new Map())
      INSTANCES.get(iid).set(uid, stubUser(uid))
    }
    return json({ participants: participantsOf(iid) })
  }
  if ((m = p.match(/^\/instances\/([A-Za-z0-9_.:-]{1,64})\/participants\/(\d{1,6})\/leave$/))) {
    INSTANCES.get(m[1])?.delete(m[2])
    return json({ participants: participantsOf(m[1]) })
  }
  return json({ message: "404: Not Found", code: 0 }, 404)
}

const server = http.createServer((req, res) => {
  try { route(req, res) } catch (e) { console.error(`[proxy] ${req.url} : ${e?.message}`); plain(res, 500, "erreur du serveur local") }
})

/** Le proxy de Discord sert la correspondance "/blindz" sous /.proxy/blindz : ici, c'est /blindify. */
const unproxy = url => url.replace(/^\/\.proxy\/blindz(?=\/|\?|$)/, "/blindify")

function route(req, res) {
  req.url = unproxy(req.url || "/")
  const url = req.url
  if (url.startsWith("/discord-stub/")) { discordStub(req, res).catch(e => plain(res, 500, `faux Discord : ${e.message}`)); return }
  if (url.split("?")[0] === "/discord-harness.html") return sendFile(req, res, path.join(HERE, "discord-harness.html"))
  if (url.startsWith("/deezer-stub/")) return deezerStub(req, res)
  if (url.startsWith("/blindify/api/") || url.startsWith("/blindify/socket.io/")) return toBackend(req, res)
  // Depuis l'Activite, l'extrait (sur l'hote de l'API) est demande a travers le proxy : /.proxy/blindz/test-audio/...
  if (url.startsWith("/test-audio/") || url.startsWith("/blindify/test-audio/")) return sendFile(req, res, path.join(AUDIO, path.basename(url.split("?")[0])))
  if (url === "/" || url === "/blindify") { res.writeHead(302, { Location: "/blindify/" }); res.end(); return }
  if (url.startsWith("/blindify/")) {
    const file = frontFile(url.split("?")[0])
    if (!file) { res.writeHead(400); res.end(); return }
    return sendFile(req, res, file)
  }
  res.writeHead(404, { "Content-Type": "text/plain" }); res.end("introuvable")
}

// Websocket : on rejoue la requete d'upgrade vers le backend et on branche les
// deux sockets l'un sur l'autre.
server.on("upgrade", (req, socket, head) => {
  const up = net.connect(BACKEND.port, BACKEND.host, () => {
    const lines = [`${req.method} ${unproxy(req.url).replace(/^\/blindify/, "")} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    up.write(lines.join("\r\n") + "\r\n\r\n")
    if (head?.length) up.write(head)
    up.pipe(socket); socket.pipe(up)
  })
  const close = () => { up.destroy(); socket.destroy() }
  up.on("error", close); socket.on("error", close)
})

server.listen(PORT, "127.0.0.1", () => console.log(`proxy de test sur http://127.0.0.1:${PORT} (backend ${BACKEND.port})`))
