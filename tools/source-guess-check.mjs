// Verifie que le verdict fin et la devinette "qui a mis quoi" sont bien
// persistes dans round_responses (colonnes ajoutees le 28/09/2026).
//
// Vise DIRECTEMENT le backend de dev sur son port, pas le nom public : le
// point est de tester le code neuf sans dependre du routage nginx. Deux
// invites, une partie de deux manches. A chaque manche, le joueur A devine le
// bon proprietaire, le joueur B un mauvais. On relit ensuite la base.
import fs from "fs"
import { createRequire } from "module"
// psql sans shell + gardes SQL : ids et code viennent du backend de dev
import { seedLibrary, cleanupSeeded, psql, entier, codeSalle } from "./seed-library.mjs"
const { io } = createRequire("/opt/blindify/frontend/package.json")("socket.io-client")

const B = "http://127.0.0.1:3097"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }
const okk = m => console.log("  [ok] " + m)

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-E2E-Key": KEY, "Origin": "https://dev.tymmerc.eu", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await res.json().catch(() => null)
  return { status: res.status, data: j?.data, error: j?.error }
}

const invite = async (nom) => {
  const g = await api("/api/auth/guest", { method: "POST", body: { nickname: nom } })
  if (!g.data?.sessionToken) throw new Error(`invite ${nom} refuse (${g.status})`)
  return { token: g.data.sessionToken, id: entier(g.data.user.id), nom }
}
const socketDe = (j) => new Promise((res, rej) => {
  const s = io(B, { path: "/socket.io", auth: { token: j.token }, extraHeaders: { "X-E2E-Key": KEY }, transports: ["websocket"] })
  s.on("connect", () => res(s)); s.on("connect_error", e => rej(new Error(`socket ${j.nom}: ${e.message}`)))
  setTimeout(() => rej(new Error(`socket ${j.nom}: timeout`)), 15000)
})

const A = await invite("VerifA"), Bj = await invite("VerifB")
await seedLibrary(A.id, 12); await seedLibrary(Bj.id, 12)
okk(`deux invites ensemences (${A.id}, ${Bj.id})`)

const room = await api("/api/rooms/create", { method: "POST", token: A.token, body: { mode: "friends", questionCount: 2 } })
const code = codeSalle(room.data?.roomCode || room.data?.room?.room_code)
if (!code) { bad(`salon refuse (${room.status} ${JSON.stringify(room.error)})`); process.exit(1) }
const j2 = await api(`/api/rooms/${code}/join`, { method: "POST", token: Bj.token })
if (j2.status >= 400) { bad(`B ne peut pas rejoindre (${j2.status})`); process.exit(1) }
okk(`salon ${code}, B a rejoint`)

const sA = await socketDe(A), sB = await socketDe(Bj)
sA.emit("room:join", { roomCode: code }); sB.emit("room:join", { roomCode: code })
await sleep(600)

// A chaque depart de manche, chacun repond : A vise le vrai proprietaire (fourni
// par le serveur dans la trame de depart via ownerChoices ou le metadata), B
// vise deliberement l'autre joueur.
let manches = 0, reveals = 0, fini = false
const repondre = (payload) => {
  const round = payload?.round ?? payload?.currentRound
  const choix = payload?.track?.ownerChoices ?? payload?.ownerChoices ?? [A.id, Bj.id]
  // Le vrai proprietaire n'est pas dans la trame (anti-triche) : on repond avec
  // les deux candidats, l'un chacun ; le serveur, lui, sait lequel est juste.
  sA.emit("game:answer", { roomCode: code, guessTitle: "x", guessArtist: "y", sourceUserId: choix[0], round })
  sB.emit("game:answer", { roomCode: code, guessTitle: "x", guessArtist: "y", sourceUserId: choix[1] ?? choix[0], round })
  manches++
}
sA.on("game:round:start", repondre)
sA.on("game:round:reveal", () => { reveals++ })
sA.on("game:over", () => { reveals = Math.max(reveals, 2); fini = true })

const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: A.token, body: { source: "library" } })
if (start.status >= 400) { bad(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`); process.exit(1) }
okk("partie lancee")
for (let i = 0; i < 120 && reveals < 2; i++) await sleep(500)
okk(`${manches} manche(s) jouee(s), ${reveals} revelation(s) recue(s)`)
// On attend la fin de partie avant de couper : sinon la session reste
// 'in_progress' sans hote en base et passe pour une vraie partie abandonnee.
for (let i = 0; i < 90 && !fini; i++) await sleep(500)
fini ? okk("fin de partie recue") : bad("pas de game:over en 45 s")
await sleep(1500)

const sid = psql(`SELECT session_id FROM multiplayer_rooms WHERE room_code='${code}'`)
const rows = psql(`SELECT u.username||'|'||gr.round_index||'|'||coalesce(r.verdict,'NULL')||'|'||coalesce(r.source_guess::text,'NULL')||'|'||coalesce(r.source_owner::text,'NULL')||'|'||coalesce(r.source_correct::text,'NULL')
  FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id JOIN users u ON u.id=r.user_id
  WHERE gr.session_id=${sid || 0} ORDER BY gr.round_index, u.username`).split("\n").filter(Boolean)
console.log("  lignes ecrites :"); for (const l of rows) console.log("    " + l)

const verdicts = rows.filter(l => !l.includes("|NULL|") || l.split("|")[2] !== "NULL")
rows.length ? okk(`${rows.length} reponses persistees`) : bad("aucune reponse persistee")
rows.every(l => l.split("|")[2] !== "NULL") ? okk("verdict fin renseigne sur chaque ligne") : bad("verdict NULL sur au moins une ligne")
rows.every(l => l.split("|")[4] !== "NULL") ? okk("proprietaire du morceau fige sur chaque ligne") : bad("source_owner NULL : le serveur ne connait pas le proprietaire")
rows.every(l => l.split("|")[3] !== "NULL") ? okk("devinette du joueur enregistree") : bad("source_guess NULL : la devinette n'arrive pas")
const justes = rows.filter(l => l.split("|")[5] === "true").length, faux = rows.filter(l => l.split("|")[5] === "false").length
justes + faux === rows.length && justes >= 1 && faux >= 1
  ? okk(`source_correct juge : ${justes} juste(s), ${faux} fausse(s), coherent avec un joueur qui vise bien et un qui vise mal`)
  : bad(`source_correct incoherent (${justes} juste, ${faux} faux, ${rows.length - justes - faux} indetermine)`)

sA.close(); sB.close()
psql(`UPDATE multiplayer_rooms SET status='finished' WHERE room_code='${code}'`)
cleanupSeeded([A.id, Bj.id]); psql(`DELETE FROM users WHERE id IN (${A.id},${Bj.id})`)
// La partie elle-meme : les reponses sont deja parties avec les comptes (FK en
// cascade), il ne resterait qu'une session sans hote qui fausserait le tableau
// de bord. Les manches et participants suivent en cascade.
if (sid) psql(`DELETE FROM game_sessions WHERE id=${sid}`)
okk("nettoyage fait")
console.log(problems.length ? `\n${problems.length} probleme(s)` : "\nLes deux nouvelles mesures sont persistees")
process.exit(problems.length ? 1 : 0)
