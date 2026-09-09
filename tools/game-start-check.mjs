// Preuve que le moteur de jeu demarre bien a travers le chemin 443.
// Pilotage par API + socket, sans navigateur : invite -> salon -> bibliotheque
// ensemencee en SQL -> lancement -> une manche recue. Zero appel Deezer.
import fs from "fs"
import { execSync } from "child_process"
import { createRequire } from "module"
const requireFront = createRequire("/opt/blindify/frontend/package.json")
const { io } = requireFront("socket.io-client")

const PROD = process.argv[2] === "prod"
const B = PROD ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const ORIGIN = PROD ? "https://blindz.app" : "https://dev.tymmerc.eu"
const SOCKET_PATH = PROD ? "/socket.io" : "/blindify/socket.io"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }
const okk = m => console.log("  [ok] " + m)
const psql = sql => execSync(`docker exec blindify-postgres psql -U blindify -d blindify -qAt -c "${sql.replace(/"/g, '\\"')}"`).toString().trim()

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-E2E-Key": KEY, "Origin": ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const guest = await api("/api/auth/guest", { method: "POST" })
const token = guest.data?.sessionToken
const userId = guest.data?.user?.id
if (!token || !userId) { bad(`session invite refusee (${guest.status} ${JSON.stringify(guest.error)})`); process.exit(1) }
okk(`session invite obtenue (utilisateur ${userId})`)

// Bibliotheque ensemencee en SQL : jamais d'import Deezer reel depuis le VPS.
// Ensemencement avec de VRAIS identifiants Deezer.
//
// Pourquoi pas la copie de lignes existantes, comme font les autres outils :
// l'index unique porte sur (provider, external_id) au niveau de TOUTE la table,
// pas par utilisateur. Copier une ligne oblige donc a brouiller l'identifiant,
// et le serveur ne peut alors plus rafraichir l'extrait quand l'URL en cache
// expire (signature exp=, 403 au bout de quelques jours). Le lancement de partie
// jette ces titres et echoue en "insufficient_tracks". C'est ce qui a fait
// pourrir soiree.mjs et anticheat-e2e.mjs en silence.
const MOTS = ["rock", "pop francaise", "rap", "jazz", "electro", "chanson"]
const candidats = []
for (const q of MOTS) {
  const r = await fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=25`).then(r => r.json()).catch(() => null)
  for (const t of r?.data ?? []) if (t.id && t.preview) candidats.push(t)
}
const deja = new Set(psql(`SELECT external_id FROM audio_sources WHERE provider='deezer'`).split("\n"))
const libres = candidats.filter(t => !deja.has(String(t.id)))
if (libres.length < 24) { bad(`pas assez de titres neufs chez Deezer (${libres.length})`); process.exit(1) }

// Guillemets simples doubles pour SQL. Surtout PAS la notation $$ de Postgres :
// la commande passe par un shell, qui remplacerait $$ par son numero de processus.
const sq = v => "'" + String(v ?? "").replace(/'/g, "''").replace(/\$/g, "") + "'"
const seed = (uid, lot) => {
  const vals = lot.map(t => `('deezer','${t.id}',${uid},${sq(t.title)},${sq(t.artist?.name ?? "?")},${sq(t.album?.cover_medium ?? "")},${sq(t.preview)},${(t.duration ?? 30) * 1000},'{}'::jsonb)`).join(",")
  psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata) VALUES ${vals} ON CONFLICT (provider, external_id) DO NOTHING`)
}
const lotA = libres.slice(0, 12)
seed(userId, lotA)
okk(`${lotA.length} morceaux ensemences pour le premier joueur (vrais identifiants Deezer)`)

const room = await api("/api/rooms/create", { method: "POST", token, body: { mode: "friends", questionCount: 1 } })
const code = room.data?.roomCode || room.data?.room?.room_code
if (!code) { bad(`creation de salon refusee (${room.status} ${JSON.stringify(room.error)})`); process.exit(1) }
okk(`salon cree : ${code}`)

// Deuxieme joueur : le mode a plusieurs exige 2 participants, et ca teste en
// prime le partage du canal temps reel entre deux sockets.
const g2 = await api("/api/auth/guest", { method: "POST" })
const t2 = g2.data?.sessionToken, u2 = g2.data?.user?.id
if (!t2) { bad("second invite refuse"); process.exit(1) }
const lotB = libres.slice(12, 24)
seed(u2, lotB)
const j2 = await api(`/api/rooms/${code}/join`, { method: "POST", token: t2 })
j2.status < 400 ? okk(`second joueur entre dans le salon (utilisateur ${u2})`) : bad(`entree du second joueur refusee (${j2.status})`)
const sock2 = io(ORIGIN, { path: SOCKET_PATH, auth: { token: t2 }, extraHeaders: { "X-E2E-Key": KEY }, transports: ["websocket"] })
await new Promise(r => { sock2.on("connect", r); setTimeout(r, 8000) })
sock2.emit("room:join", { roomCode: code })
await sleep(800)

let manche = null
const sock = io(ORIGIN, { path: SOCKET_PATH, auth: { token }, extraHeaders: { "X-E2E-Key": KEY }, transports: ["websocket"] })
await new Promise((res, rej) => { sock.on("connect", res); sock.on("connect_error", e => rej(new Error(e.message))); setTimeout(() => rej(new Error("timeout")), 15000) })
  .then(() => okk("websocket connecte et authentifie"))
  .catch(e => { bad(`websocket : ${e.message}`); process.exit(1) })
sock.emit("room:join", { roomCode: code })
sock.on("game:round:start", p => { manche = p })

const start = await api(`/api/rooms/${code}/start`, { method: "POST", token, body: { source: "library", subMode: "solo" } })
if (start.status >= 400) { bad(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`); }
else okk("partie lancee (API acceptee)")

for (let i = 0; i < 20 && !manche; i++) await sleep(500)
manche ? okk(`manche 1 recue par websocket (phase ${manche.phase ?? "?"})`) : bad("aucune manche recue en 10 s")

const sid = psql(`SELECT session_id FROM multiplayer_rooms WHERE room_code='${code}'`)
sid ? okk(`session de jeu creee en base (id ${sid})`) : bad("aucune session en base : le moteur n'a pas demarre")

// Menage : on ne laisse ni salon ni faux morceaux derriere nous.
sock.close(); sock2.close()
psql(`DELETE FROM audio_sources WHERE user_id IN (${userId}, ${u2})`)
psql(`UPDATE multiplayer_rooms SET status='finished' WHERE room_code='${code}'`)
okk("nettoyage fait")
console.log(problems.length ? `\n${problems.length} probleme(s)` : "\nLe moteur de jeu tourne a travers le nouveau chemin 443")
process.exit(problems.length ? 1 : 0)
