// Garde-fou charge AVANT le backend de test (node -r no-egress.cjs ...).
//
// Le backend de test ne doit JAMAIS sortir sur Internet : a l'echelle d'une
// campagne, les appels a api.deezer.com feraient bloquer l'IP du VPS par
// Akamai, et ce blocage touche les vrais joueurs (vu deux fois en 2026).
// Il ne doit pas non plus toucher les services LOCAUX de prod : la base
// blindify-postgres ecoute sur 127.0.0.1:5432, sur la meme machine. D'ou une
// liste blanche de ports (NO_EGRESS_ALLOW_PORTS) en plus de la boucle locale :
// base de test, serveur local de la pile, backend de test lui-meme.
//
// Toute connexion refusee est journalisee : le rapport de campagne en fait le
// compte, et une seule suffit a la faire echouer.
"use strict"
const net = require("net")
const fs = require("fs")

const LOG = process.env.NO_EGRESS_LOG || "/tmp/no-egress.log"
const ALLOW_PORTS = new Set(
  String(process.env.NO_EGRESS_ALLOW_PORTS || "").split(",").map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0),
)

/** Boucle locale seulement. Le prefixe 127. ne vaut que pour une IP litterale :
 *  "127.exemple.com" est un nom de domaine qui peut resoudre n'importe ou. */
function isLoopback(host) {
  if (host == null || host === "") return true // Node vise localhost par defaut
  const h = String(host).replace(/^\[|\]$/g, "").toLowerCase()
  if (net.isIPv4(h)) return h.startsWith("127.")
  if (net.isIPv6(h)) return h === "::1" || /^::ffff:127\./.test(h)
  return h === "localhost" || h.endsWith(".localhost")
}

function refuse(sock, host, port, why) {
  const line = `${new Date().toISOString()} REFUSE ${host}:${port} (${why})\n`
  try { fs.appendFileSync(LOG, line) } catch { /* journal indisponible : on refuse quand meme */ }
  process.stderr.write(`[no-egress] ${line}`)
  const err = Object.assign(new Error(`no-egress: connexion refusee vers ${host}:${port} (${why})`), { code: "ENOEGRESS" })
  process.nextTick(() => sock.destroy(err))
  return sock
}

const original = net.Socket.prototype.connect
net.Socket.prototype.connect = function patchedConnect(...args) {
  let opts = args[0]
  if (Array.isArray(opts)) opts = opts[0] // forme interne normalisee
  let host
  let port
  if (opts && typeof opts === "object") {
    if (opts.path) return original.apply(this, args) // socket unix
    host = opts.host
    port = opts.port
  } else {
    port = opts
    host = typeof args[1] === "string" ? args[1] : undefined
  }
  if (!isLoopback(host)) return refuse(this, host, port, "hors boucle locale")
  if (ALLOW_PORTS.size && !ALLOW_PORTS.has(Number(port))) return refuse(this, host, port, "port local non autorise")
  return original.apply(this, args)
}
