// Garde-fou charge AVANT le backend de test (node -r no-egress.cjs ...).
//
// Le backend de test ne doit JAMAIS sortir sur Internet : a l'echelle d'une
// campagne, les appels a api.deezer.com feraient bloquer l'IP du VPS par
// Akamai, et ce blocage touche les vrais joueurs (vu deux fois en 2026).
// Toute connexion vers autre chose que la boucle locale est refusee au niveau
// du socket, pour tous les clients HTTP (axios, fetch/undici, pg...), et
// chaque tentative est journalisee : le rapport de campagne en fait le compte.
"use strict"
const net = require("net")
const fs = require("fs")

const LOG = process.env.NO_EGRESS_LOG || "/tmp/no-egress.log"
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""])
const isLocal = host => {
  if (host == null) return true
  const h = String(host).replace(/^\[|\]$/g, "")
  return LOCAL.has(h) || h.startsWith("127.") || h.endsWith(".localhost")
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
  if (!isLocal(host)) {
    const line = `${new Date().toISOString()} REFUSE ${host}:${port}\n`
    try { fs.appendFileSync(LOG, line) } catch { /* journal indisponible : on refuse quand meme */ }
    process.stderr.write(`[no-egress] ${line}`)
    const err = Object.assign(new Error(`no-egress: connexion refusee vers ${host}:${port}`), { code: "ENOEGRESS" })
    process.nextTick(() => this.destroy(err))
    return this
  }
  return original.apply(this, args)
}
