// Verifie le fix round-2 : une partie STREAMER terminee normalement doit
// solder la room en base (status='finished'), sinon zombie 'in_progress' +
// faux game:lost au resync tardif. Pilotage direct par API + socket, sans
// navigateur. Solo submode, 1 manche, seed SQL (zero Deezer).
import fs from "fs"
import { execSync } from "child_process"
import { createRequire } from "module"

const requireFront = createRequire("/opt/blindify/frontend/package.json")
const { io } = requireFront("socket.io-client")

const B = "https://dev.tymmerc.eu/blindify"
const ORIGIN = "https://dev.tymmerc.eu"
const SOCKET_PATH = "/blindify/socket.io"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const say = (...a) => console.log(a.join(" "))
const problems = []
const bad = m => { problems.push(m); say("  !! " + m) }
const okk = m => say("  [ok] " + m)

const psql = sql => execSync(
  `docker exec blindify-postgres psql -U blindify -d blindify -qAt -c "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`
).toString().trim()

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-E2E-Key": KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

// Hote streamer
const guest = await api("/api/auth/guest", { method: "POST", body: { nickname: "StreamerHost" } })
const token = guest.data?.sessionToken
const hostId = guest.data?.user?.id
if (!token || !hostId) { bad("pas de session hote"); process.exit(1) }
psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata)
  SELECT provider, 'e2e-' || md5(random()::text || id::text), ${hostId}, title, artist, album_cover, audio_url, duration_ms, metadata
  FROM audio_sources WHERE user_id = 3103 AND audio_url IS NOT NULL AND audio_url <> '' LIMIT 5`)
say(`hote streamer ${hostId} seede`)

// Room streamer
const room = await api("/api/rooms/create", { method: "POST", token, body: { mode: "streamer", questionCount: 1 } })
const code = room.data?.room?.room_code || room.data?.room_code || room.data?.roomCode
if (!code) { bad(`room non creee: ${JSON.stringify(room).slice(0,200)}`); process.exit(1) }
say(`room streamer ${code} (statut initial ${psql(`SELECT status FROM multiplayer_rooms WHERE room_code='${code}'`)})`)

// Deux viewers connectes ET seedes (en streamer, la musique vient des viewers,
// l'hote est exclu des contributeurs).
const vSocks = []
for (const nick of ["Viewer1", "Viewer2"]) {
  const viewer = await api("/api/auth/guest", { method: "POST", body: { nickname: nick } })
  const vToken = viewer.data?.sessionToken
  const vId = viewer.data?.user?.id
  psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata)
    SELECT provider, 'e2e-' || md5(random()::text || id::text), ${vId}, title, artist, album_cover, audio_url, duration_ms, metadata
    FROM audio_sources WHERE user_id = 3103 AND audio_url IS NOT NULL AND audio_url <> '' LIMIT 5`)
  await api(`/api/rooms/${code}/join`, { method: "POST", token: vToken })
  const vSock = io(ORIGIN, { path: SOCKET_PATH, auth: { token: vToken }, extraHeaders: { "X-E2E-Key": KEY }, transports: ["websocket"] })
  await new Promise(r => { vSock.on("connect", () => { vSock.emit("room:join", { roomCode: code }); r() }) })
  vSocks.push(vSock)
}
say("2 viewers connectes et seedes")

// Socket hote : recevra state:sync jusqu'a GAME_OVER
const sock = io(ORIGIN, { path: SOCKET_PATH, auth: { token }, extraHeaders: { "X-E2E-Key": KEY }, transports: ["websocket"] })
let lastPhase = null
sock.on("state:sync", s => { if (s?.roomCode === code) lastPhase = s.phase })
sock.on("round:start", s => { if (s?.roomCode === code) lastPhase = s.phase })
await new Promise(r => { sock.on("connect", () => { sock.emit("room:join", { roomCode: code }); r() }) })

// Lancer en solo (seul l'hote devine -> 1 manche courte)
const start = await api(`/api/rooms/${code}/start`, { method: "POST", token, body: { source: "library", subMode: "solo" } })
if (start.status !== 200) { bad(`start KO ${start.status}: ${JSON.stringify(start.error)}`) }
say(`partie lancee, statut room = ${psql(`SELECT status FROM multiplayer_rooms WHERE room_code='${code}'`)}`)

const totalRounds = Number(psql(`SELECT total_rounds FROM game_sessions WHERE room_code='${code}' ORDER BY id DESC LIMIT 1`)) || 1
say(`${totalRounds} manche(s), on avance jusqu'au game over...`)
// Avancer : on relance host:start a chaque ROUND_ENDED (ou LOBBY), chaque
// manche solo dure ~18s (countdown 3s + guess solo 15s, personne ne repond).
await sleep(1500)
sock.emit("host:start", { roomCode: code })
const t0 = Date.now()
let lastAdvance = Date.now()
while (Date.now() - t0 < 30000 * totalRounds + 20000 && lastPhase !== "GAME_OVER") {
  if ((lastPhase === "ROUND_ENDED" || lastPhase === "LOBBY") && Date.now() - lastAdvance > 2000) {
    sock.emit("host:start", { roomCode: code })
    lastAdvance = Date.now()
  }
  await sleep(1000)
}
say(`phase finale observee: ${lastPhase}`)

await sleep(1500)
const status = psql(`SELECT status FROM multiplayer_rooms WHERE room_code='${code}'`)
if (status === "finished") okk(`room streamer passee a 'finished' en base au game over (etait le bug: restait 'in_progress')`)
else bad(`room streamer status='${status}' apres game over (attendu 'finished' -> zombie + faux game:lost)`)

sock.close()
vSocks.forEach(v => v.close())
say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(p => say("  - " + p))
try { psql("DELETE FROM audio_sources WHERE external_id LIKE 'e2e-%'") } catch { /* tant pis */ }
process.exit(problems.length ? 1 : 0)
