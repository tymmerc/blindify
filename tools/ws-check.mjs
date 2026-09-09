// Verification minimale du temps reel a travers le 443 : handshake socket.io,
// upgrade websocket, aller-retour. C'est ce que le multiplexage pourrait casser.
import { createRequire } from "module"
// meme resolution que les autres outils : les paquets vivent dans frontend/
const { io } = createRequire("/opt/blindify/frontend/package.json")("socket.io-client")
const ORIGIN = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu"
const PATH = process.argv[2] === "prod" ? "/socket.io/" : "/blindify/socket.io/"
const s = io(ORIGIN, { path: PATH, transports: ["websocket"], timeout: 15000 })
const fin = (code, msg) => { console.log(msg); s.close(); process.exit(code) }
setTimeout(() => fin(1, "!! aucune connexion en 20 s"), 20000)
s.on("connect", () => {
  console.log(`  [ok] websocket connecte (id ${s.id})`)
  console.log(`  [ok] transport = ${s.io.engine.transport.name}`)
  s.emit("room:join", { roomCode: "ZZZZZZ" })
  setTimeout(() => fin(0, "  [ok] echange effectue, le canal reste ouvert"), 2500)
})
s.on("connect_error", e => fin(1, `  !! echec de connexion : ${e.message}`))
