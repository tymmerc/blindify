// Faux chat Twitch de la pile de test (T5b). La pile n'a pas Internet : le
// backend de test lit ce serveur au lieu de wss://irc-ws.chat.twitch.tv.
//
//   ws://127.0.0.1:3180/twitch-irc-stub        IRC sur WebSocket, comme Twitch :
//                                              CAP, NICK justinfan…, JOIN #chaine,
//                                              001 de bienvenue, PING/PONG
//   POST /twitch-irc-stub/say                  { channel, login, displayName?, text }
//                                              -> PRIVMSG a ceux qui ont rejoint #chaine
//   POST /twitch-irc-stub/drop                 coupe toutes les connexions (reprise)
//   GET  /twitch-irc-stub/state                connexions ouvertes et chaines rejointes
//
// WebSocket fait main (texte seulement, RFC 6455) : aucune dependance, comme
// le reste du serveur local.
import crypto from "node:crypto"

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
const clients = new Set()
const log = []

function frame(text) {
  const payload = Buffer.from(text)
  const len = payload.length
  const head = len < 126 ? Buffer.from([0x81, len])
    : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255])
    : null
  if (!head) throw new Error("trame trop longue pour le faux IRC")
  return Buffer.concat([head, payload])
}

/** Decode les trames texte masquees du client ; rend [messages, reste]. */
function unframe(buf) {
  const out = []
  let off = 0
  while (buf.length - off >= 2) {
    const op = buf[off] & 0x0f
    let len = buf[off + 1] & 0x7f
    let p = off + 2
    if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2 }
    else if (len === 127) { if (buf.length - p < 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8 }
    const masked = (buf[off + 1] & 0x80) !== 0
    const mask = masked ? buf.subarray(p, p + 4) : null
    if (masked) p += 4
    if (buf.length - p < len) break
    const data = Buffer.from(buf.subarray(p, p + len))
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4]
    out.push({ op, text: data.toString("utf8") })
    off = p + len
  }
  return [out, buf.subarray(off)]
}

function send(client, line) {
  if (!client.socket.destroyed) client.socket.write(frame(line))
}

function onLine(client, line) {
  log.push({ at: Date.now(), from: client.nick, line })
  if (log.length > 500) log.shift()
  const [cmd, ...rest] = line.split(" ")
  if (cmd === "NICK") {
    client.nick = rest[0]
    send(client, `:tmi.twitch.tv 001 ${client.nick} :Welcome, GLHF!`)
  } else if (cmd === "JOIN") {
    const channel = (rest[0] || "").replace(/^#/, "")
    client.channels.add(channel)
    send(client, `:${client.nick}!${client.nick}@${client.nick}.tmi.twitch.tv JOIN #${channel}`)
  } else if (cmd === "PING") {
    send(client, `PONG ${rest.join(" ")}`)
  }
}

export function handleIrcUpgrade(req, socket) {
  const key = req.headers["sec-websocket-key"]
  if (!key) { socket.destroy(); return }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64")
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"))
  const client = { socket, nick: null, channels: new Set(), buf: Buffer.alloc(0) }
  clients.add(client)
  socket.on("data", chunk => {
    const [msgs, rest] = unframe(Buffer.concat([client.buf, chunk]))
    client.buf = rest
    for (const m of msgs) {
      if (m.op === 0x8) { socket.end(); return }
      if (m.op === 0x1) for (const l of m.text.split("\r\n").filter(Boolean)) onLine(client, l)
    }
  })
  const drop = () => clients.delete(client)
  socket.on("close", drop)
  socket.on("error", drop)
}

const tagValue = v => String(v).replace(/[ ;\\\r\n]/g, "")

function say({ channel, login, displayName, text }) {
  const ch = String(channel || "").replace(/^#/, "")
  const lg = String(login || "").toLowerCase()
  const line = `@display-name=${tagValue(displayName || login)};user-type= :${lg}!${lg}@${lg}.tmi.twitch.tv PRIVMSG #${ch} :${String(text)}`
  let delivered = 0
  for (const c of clients) if (c.channels.has(ch)) { send(c, line); delivered++ }
  return delivered
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", d => { body += d; if (body.length > 64 * 1024) reject(new Error("corps trop long")) })
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}) } catch (e) { reject(e) } })
  })
}

export async function ircStub(req, res) {
  const json = (code, v) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(v)) }
  const path = (req.url || "").split("?")[0]
  try {
    if (req.method === "POST" && path === "/twitch-irc-stub/say") {
      const body = await readJson(req)
      const messages = Array.isArray(body) ? body : [body]
      return json(200, { delivered: messages.reduce((n, m) => n + say(m), 0) })
    }
    if (req.method === "POST" && path === "/twitch-irc-stub/drop") {
      const n = clients.size
      for (const c of clients) c.socket.destroy()
      clients.clear()
      return json(200, { dropped: n })
    }
    if (req.method === "GET" && path === "/twitch-irc-stub/state") {
      return json(200, { clients: [...clients].map(c => ({ nick: c.nick, channels: [...c.channels] })), log: log.slice(-50) })
    }
    json(404, { error: "introuvable" })
  } catch (e) {
    json(400, { error: e.message })
  }
}
