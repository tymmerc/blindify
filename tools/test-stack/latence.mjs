// Proxy HTTP local qui ajoute un delai reseau, pour jouer la pile comme depuis
// un telephone. Sur la pile, le navigateur et le serveur sont sur la meme
// machine (aller-retour < 1 ms) : les courses entre requetes qui n'apparaissent
// qu'avec un vrai reseau (4G, wifi de bar, serveur a Falkenstein) y sont
// invisibles. Le navigateur passe par ce proxy (option "proxy" de Playwright) ;
// chaque sens de chaque echange (requete, reponse, trames websocket) attend
// `delayMs`, soit un aller-retour de 2 x delayMs en plus.
//
// N'accepte que la pile (blindz-test.localhost:3180), ecoute sur 127.0.0.1.
import http from "node:http"
import net from "node:net"

const STACK = { host: "127.0.0.1", port: 3180, name: "blindz-test.localhost" }

const isTarget = (target, host, port) => host === target.name && Number(port) === target.port

/** Recopie a -> b en retardant chaque morceau (l'ordre est garde : meme delai). */
function delayedPipe(a, b, delayMs) {
  a.on("data", chunk => setTimeout(() => { if (!b.destroyed) b.write(chunk) }, delayMs))
  a.on("end", () => setTimeout(() => b.end(), delayMs))
  a.on("close", () => setTimeout(() => b.destroy(), delayMs))
  a.on("error", () => b.destroy())
}

function forwardHttp(req, res, { delayMs, stats, target }) {
  let url
  try { url = new URL(req.url) } catch { res.writeHead(400); res.end(); return }
  if (!isTarget(target, url.hostname, url.port)) { res.writeHead(403); res.end("hors pile"); return }
  stats.http++
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith("proxy-")))
  const body = []
  req.on("data", c => body.push(c))
  req.on("end", () => setTimeout(() => {
    if (res.destroyed) return
    const up = http.request({ host: target.host, port: target.port, method: req.method, path: url.pathname + url.search, headers }, upRes => {
      setTimeout(() => {
        if (res.destroyed) { upRes.destroy(); return }
        res.writeHead(upRes.statusCode || 502, upRes.headers)
        upRes.pipe(res)
      }, delayMs)
    })
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end() })
    // Le navigateur abandonne la requete (XHR annulee) : on coupe aussi en amont,
    // comme le ferait la vraie connexion.
    res.on("close", () => { if (!res.writableFinished) up.destroy() })
    up.end(Buffer.concat(body))
  }, delayMs))
}

/** Websocket demande en forme absolue (GET http://... + Upgrade). */
function forwardUpgrade(req, socket, head, { delayMs, stats, target }) {
  let url
  try { url = new URL(req.url) } catch { socket.destroy(); return }
  if (!isTarget(target, url.hostname, url.port)) { socket.destroy(); return }
  stats.upgrades++
  // Le navigateur peut couper pendant le delai : sans ecoute, l'erreur tuerait le script.
  socket.on("error", () => socket.destroy())
  setTimeout(() => {
    const up = net.connect(target.port, target.host, () => {
      const lines = [`${req.method} ${url.pathname}${url.search} HTTP/1.1`]
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (!/^proxy-/i.test(req.rawHeaders[i])) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      }
      up.write(lines.join("\r\n") + "\r\n\r\n")
      if (head?.length) up.write(head)
      delayedPipe(up, socket, delayMs)
      delayedPipe(socket, up, delayMs)
    })
    up.on("error", () => socket.destroy())
  }, delayMs)
}

/** Tunnel CONNECT (websocket passe par un tunnel selon le navigateur). */
function forwardTunnel(req, socket, head, { delayMs, stats, target }) {
  const [host, port] = String(req.url).split(":")
  if (!isTarget(target, host, port)) { socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return }
  stats.tunnels++
  socket.on("error", () => socket.destroy())
  setTimeout(() => {
    const up = net.connect(target.port, target.host, () => {
      setTimeout(() => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head?.length) up.write(head)
        delayedPipe(up, socket, delayMs)
        delayedPipe(socket, up, delayMs)
      }, delayMs)
    })
    up.on("error", () => socket.destroy())
  }, delayMs)
}

/** Demarre le proxy ; renvoie { url, stats, close }. `target` ne sert qu'aux
 *  essais du proxy lui-meme (par defaut : la pile). */
export function startLatencyProxy(delayMs, target = STACK) {
  const ctx = { delayMs, stats: { http: 0, upgrades: 0, tunnels: 0 }, target }
  const { stats } = ctx
  const server = http.createServer((req, res) => forwardHttp(req, res, ctx))
  server.on("upgrade", (req, socket, head) => forwardUpgrade(req, socket, head, ctx))
  server.on("connect", (req, socket, head) => forwardTunnel(req, socket, head, ctx))
  server.on("clientError", (_err, socket) => socket.destroy())
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      const close = () => new Promise(r => { server.closeAllConnections(); server.close(() => r()) })
      resolve({ url: `http://127.0.0.1:${port}`, stats, close })
    })
  })
}
