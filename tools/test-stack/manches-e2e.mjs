// Nombre de manches au lancement, sur la pile de test.
//
// Vu en prod le 07/10/2026 (salle 3Y9YRK) : 20 manches demandees, 16 jouees,
// sans un mot. Tymeo avait 50 titres, kaaris aucun. Ce script rejoue :
//   1. 50 titres dont 30 jouables chez l'hote, l'invite sans musique, 20
//      demandees (par l'API) : 20 manches, toutes jouables ;
//   2. 50 titres dont 12 jouables, 20 demandees, l'hote sur un iPhone : 12
//      manches, et l'ecran de jeu dit « 12 manches au lieu de 20 ».
// Un titre est « jouable » si le faux Deezer le connait (son catalogue de 48) ;
// les autres sont des titres qu'il ne trouve pas, comme un morceau sans extrait.
//
//   campagne-ref.sh <branche> --script /chemin/manches-e2e.mjs /dossier/des/preuves
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, api } from "./bot.mjs"
import { psql } from "./testdb.mjs"
import { catalog } from "./catalog.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/manches-e2e"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); shots.push(f) }

const CAT = catalog()
const RUN = Date.now().toString(36)
const q = v => `'${String(v).replace(/'/g, "''")}'`

/**
 * Donne a un joueur `total` titres sans extrait en cache (comme apres un
 * import), dont `playable` du catalogue du faux Deezer (a partir de `from`) ;
 * les autres, le faux Deezer ne les trouve pas.
 */
function seedLibrary(userId, total, playable, from = 0) {
  const linkId = psql(`INSERT INTO imported_links (user_id, url, normalized_url, provider, kind, label)
    VALUES (${Number(userId)}, 'test://manches/${Number(userId)}', 'manches:${Number(userId)}', 'deezer', 'playlist', 'Manches ${Number(userId)}') RETURNING id`).split("\n")[0]
  const values = Array.from({ length: total }, (_, i) => {
    const t = i < playable ? CAT[(from + i) % CAT.length] : null
    const title = t ? t.title : `Titre absent ${RUN} ${i}`
    const artist = t ? t.artist : "Personne"
    const meta = t ? `'{"test":true,"k":${t.k}}'::jsonb` : `'{"test":true}'::jsonb`
    return `('deezer', ${q(`manches-${RUN}-${userId}-${i}`)}, ${Number(userId)}, ${q(title)}, ${q(artist)}, NULL, 30000, ${meta}, ${linkId})`
  })
  psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, audio_url, duration_ms, metadata, link_id)
    VALUES ${values.join(",")}`)
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
try {
  /* ---------- 1. Le cas de 3Y9YRK : 30 jouables sur 50 ---------- */
  say("== 1. 20 manches demandees, 50 titres dont 30 jouables, l'invite sans musique ==")
  const [tymeo, kaaris] = await Promise.all(["Tymeo", "kaaris"].map(name => new Bot({ name, plan: () => ({ action: "muet" }), random: Math.random }).enter()))
  seedLibrary(tymeo.id, 50, 30, 0)
  const created = await api("/api/rooms/create", { method: "POST", token: tymeo.token, body: { mode: "friends", questionCount: 20, nickname: "Tymeo" } })
  const room = created.data?.room?.room_code
  await api(`/api/rooms/${room}/config`, { method: "POST", token: tymeo.token, body: { questionCount: 20, roundSeconds: 10 } })
  await tymeo.connect(); tymeo.socket.emit("room:join", { roomCode: room })
  await kaaris.join(room)
  await sleep(800)
  const start = await api(`/api/rooms/${room}/start`, { method: "POST", token: tymeo.token, body: { source: "library" } })
  const s1 = start.data?.session
  say(`  salle ${room} : HTTP ${start.status}, ${s1?.totalRounds} manches sur ${s1?.requestedRounds} demandees`)
  start.status === 200 ? ok("la partie part") : bad(`lancement : HTTP ${start.status} ${start.error?.code ?? ""}`)
  s1?.totalRounds === 20 ? ok("20 manches sur 20") : bad(`${s1?.totalRounds} manches au lieu de 20`)
  const rounds1 = Number(psql(`SELECT count(*) FROM game_rounds gr JOIN multiplayer_rooms m ON m.session_id = gr.session_id
    JOIN audio_sources a ON a.id = gr.audio_source_id WHERE m.room_code = ${q(room)} AND a.audio_url IS NOT NULL AND a.title NOT LIKE 'Titre absent%'`))
  rounds1 === 20 ? ok("en base : 20 manches, toutes avec un extrait") : bad(`en base : ${rounds1} manches jouables`)
  for (const b of [tymeo, kaaris]) b.socket?.close()

  /* ---------- 2. Pas assez de titres jouables : l'ecran le dit ---------- */
  say("\n== 2. 50 titres dont 12 jouables, 20 demandees, l'hote sur iPhone ==")
  const phone = await newPage(browser, { ...devices["iPhone 13"] }, "hote", problems)
  const p = phone.page
  await p.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill("Hote")
  await p.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
  if (!p.__uid) throw new Error("pas d'identifiant d'invite pour l'hote")
  seedLibrary(p.__uid, 50, 12, 30)
  await p.getByRole("button", { name: /continuer/i }).click()
  await p.getByText("Créer une partie").click()
  await p.waitForURL(/\/modes/, { timeout: 40000 })
  await p.getByText("À distance").first().click()
  await p.getByText(/CODE|copie le code|invite/i).first().waitFor({ timeout: 40000 }).catch(() => {})
  await sleep(2500)
  const code = (p.url().match(/code=([A-Z0-9]{6})/) || [])[1]
  if (!code) throw new Error("pas de code de salle cote hote")
  psql(`UPDATE multiplayer_rooms SET question_count = 20, round_duration_ms = 15000 WHERE room_code = ${q(code)}`)
  const ami = await new Bot({ name: "Ami", plan: () => ({ action: "muet" }), random: Math.random }).enter()
  const joined = await ami.join(code)
  if (!joined.ok) bad(`l'ami ne peut pas entrer (${joined.status})`)
  await sleep(3500)
  await shot(p, "1-lobby")

  const startResp = p.waitForResponse(r => r.url().includes(`/api/rooms/${code}/start`), { timeout: 30000 }).catch(() => null)
  await p.getByRole("button", { name: /lancer/i }).first().click()
  const started = await startResp
  const body = started ? await started.json().catch(() => null) : null
  const s2 = body?.data?.session
  say(`  salle ${code} : HTTP ${started?.status()}, ${s2?.totalRounds} manches sur ${s2?.requestedRounds} demandees`)
  s2?.totalRounds === 12 ? ok("12 manches : tous les titres jouables y sont") : bad(`${s2?.totalRounds} manches au lieu de 12`)
  s2?.requestedRounds === 20 ? ok("la reponse dit que 20 etaient demandees") : bad(`requestedRounds = ${s2?.requestedRounds}`)
  const notice = p.getByText("12 manches au lieu de 20 : pas assez de titres jouables dans vos playlists")
  const seen = await notice.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
  await sleep(4000) // les animations du debut de manche
  await shot(p, "2-manche-1")
  seen ? ok("l'ecran de jeu affiche le message pendant la 1re manche") : bad("message introuvable a l'ecran")
  const box = seen ? await notice.boundingBox() : null
  const width = p.viewportSize()?.width ?? 0
  box && box.x >= 0 && box.x + box.width <= width + 1
    ? ok(`message dans l'ecran (x ${Math.round(box.x)} a ${Math.round(box.x + box.width)} sur ${width})`)
    : bad(`message hors de l'ecran : ${JSON.stringify(box)}`)
  await phone.ctx.close()
  ami.socket?.close()
} catch (e) {
  bad(`arret : ${e.message}`)
} finally {
  await browser.close()
}

say(`\n=== ${problems.length ? `${problems.length} PROBLEME(S)` : "AUCUN PROBLEME"} ===`)
problems.forEach(m => say(`  - ${m}`))
say(`captures : ${shots.map(f => path.basename(f)).join(", ")}`)
fs.writeFileSync(path.join(OUT, "resume.txt"), `${new Date().toISOString()}\n${lines.join("\n")}\n`)
process.exit(problems.length ? 1 : 0)
