// E2E du batch "retours de Tym" : bibliotheque de liens (cases cochees = ce qui
// joue), reglages dans le lobby a distance, pause hote, recap des reponses au
// reveal, matching genereux. Zero appel Deezer : bibliotheques seedees en SQL.
import { chromium, devices } from "@playwright/test"
import { execSync } from "child_process"
import fs from "fs"

const B = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/batch"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { problems.push(m); say("  !! " + m) }
const psql = q => execSync(`docker exec blindify-postgres psql -U blindify -d blindify -qtAc "${q.replace(/"/g, '\\"').replace(/\n/g, " ")}"`).toString().trim()

// Schema (le backend le cree a la demande ; nos INSERT SQL directs en ont besoin avant)
psql(`CREATE TABLE IF NOT EXISTS imported_links (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL, normalized_url TEXT NOT NULL, provider TEXT, kind TEXT, label TEXT, image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE, times_played INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), last_import_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_url))`)
psql(`ALTER TABLE audio_sources ADD COLUMN IF NOT EXISTS link_id INTEGER`)

// Cree une carte de bibliotheque + n titres copies d'un vrai compte (URLs fraiches)
const seedLink = (userId, label, fromUserId, n) => {
  const linkId = psql(`INSERT INTO imported_links (user_id, url, normalized_url, provider, kind, label)
    VALUES (${userId}, 'e2e://${label}', 'e2e-${userId}-${label}', 'deezer', 'playlist', '${label}') RETURNING id`)
  psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata, link_id)
    SELECT provider, 'e2e-' || md5(random()::text || id::text), ${userId}, title, artist, album_cover, audio_url, duration_ms, metadata, ${linkId}
    FROM audio_sources WHERE user_id = ${fromUserId} AND audio_url IS NOT NULL AND audio_url <> '' AND external_id NOT LIKE 'e2e-%' LIMIT ${n}`)
  return Number(linkId)
}

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }
const grabUserId = page => new Promise(resolve => {
  page.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      try { const d = await r.json(); const id = d?.data?.user?.id; if (id) resolve(id) } catch { /* autre */ }
    }
  })
})

// ---------- hote : 2 cartes, une cochee une decochee ----------
const hostCtx = await mk({ viewport: { width: 1440, height: 900 } })
const host = await hostCtx.newPage()
host.on("pageerror", e => bad(`HOTE crash: ${String(e).slice(0, 130)}`))
const hostIdP = grabUserId(host)
await host.goto(`${B}/`, { waitUntil: "networkidle", timeout: 90000 })
await host.locator("input").first().fill("Tymeo")
await host.getByRole("button", { name: /continuer/i }).click()
const cont = host.getByRole("button", { name: /^continuer$/i })
for (let i = 0; i < 30 && !(await cont.isEnabled().catch(() => false)); i++) await sleep(500)
await cont.click({ timeout: 20000 })
const hostId = await hostIdP
const linkA = seedLink(hostId, "SoireeTest", 3103, 15)
const linkB = seedLink(hostId, "RapExclu", 3103, 15)
say(`hote ${hostId} : cartes ${linkA} (SoireeTest) + ${linkB} (RapExclu)`)
await host.getByText(/créer une partie/i).click()
await host.waitForURL(/\/modes/, { timeout: 40000 })
await host.getByText("À distance").first().click()
await sleep(3000)
const code = (host.url().match(/code=([A-Z0-9]{6})/) || [])[1]
say("room", code)

// bibliotheque visible avec les 2 cartes ?
const lobbyTxt = await host.evaluate(() => document.body.innerText)
if (/SoireeTest/.test(lobbyTxt) && /RapExclu/.test(lobbyTxt)) say("  [ok] les 2 cartes de la bibliothèque s'affichent")
else bad(`bibliotheque absente du lobby (${lobbyTxt.replace(/\s+/g, " ").slice(0, 160)})`)
if (/réglages/i.test(lobbyTxt) && /durée d'une manche/i.test(lobbyTxt)) say("  [ok] panneau réglages présent dans le lobby à distance")
else {
  bad("panneau reglages absent du lobby a distance")
  say("  [debug] extrait:", lobbyTxt.replace(/\s+/g, " ").slice(0, 400))
}

// decocher RapExclu -> la partie ne doit JAMAIS piocher dedans
await host.getByLabel(/Jouer avec RapExclu/).uncheck({ timeout: 10000 })
await sleep(800)
say("  carte RapExclu décochée")
await host.screenshot({ path: `${SHOTS}/1-bibliotheque.png` })

// reglages : 5 manches, 10s
await host.getByRole("button", { name: "5", exact: true }).click()
await host.getByRole("button", { name: "10s", exact: true }).click()

// ---------- Lea : 1 carte ----------
const leaCtx = await mk({ ...devices["iPhone 13"] })
const lea = await leaCtx.newPage()
lea.on("pageerror", e => bad(`LEA crash: ${String(e).slice(0, 130)}`))
const leaIdP = grabUserId(lea)
await lea.goto(`${B}/?join=${code}`, { waitUntil: "networkidle", timeout: 90000 })
await lea.locator("input").first().fill("Lea")
await lea.getByRole("button", { name: /continuer/i }).click()
const leaId = await leaIdP
seedLink(leaId, "PlaylistLea", 3103, 12)
await lea.getByRole("button", { name: /rejoindre la partie/i }).click()
await lea.getByText(/dans la partie|équipage|lobby/i).first().waitFor({ timeout: 60000 }).catch(() => {})
await sleep(2500)

// compteur de titres par joueur dans le lobby hote
const cnt = await host.evaluate(() => document.body.innerText)
if (/Lea/.test(cnt) && /12 titres/.test(cnt)) say("  [ok] le lobby affiche 'Lea · 12 titres'")
else say(`  (compteur titres : ${(cnt.match(/Lea[^\n]*/) || ["?"])[0].slice(0, 60)})`)

// une reponse correcte connue d'avance : un titre de la carte cochee de l'hote
const known = psql(`SELECT title || '|' || artist FROM audio_sources WHERE link_id = ${linkA} LIMIT 1`).split("|")
say(`  titre temoin : ${known[0]} — ${known[1]}`)

// ---------- lancement + manche 1 : pause en pleine manche ----------
await host.getByRole("button", { name: /lancer/i }).first().click()
await sleep(8000)

say("  [test] pause en pleine manche")
await host.getByRole("button", { name: /^pause$/i }).click({ timeout: 10000 })
await sleep(2500)
const leaPause = await lea.evaluate(() => document.body.innerText)
if (/PAUSE/.test(leaPause)) say("  [ok] Lea voit l'overlay PAUSE")
else bad(`pas d'overlay pause chez Lea (${leaPause.replace(/\s+/g, " ").slice(0, 120)})`)
await lea.screenshot({ path: `${SHOTS}/2-pause-lea.png` })
await sleep(3000)
await host.getByRole("button", { name: /reprendre/i }).click({ timeout: 10000 })
await sleep(1500)
const afterResume = await lea.evaluate(() => document.body.innerText)
if (!/PAUSE/.test(afterResume)) say("  [ok] reprise : l'overlay disparaît")
else bad("l'overlay pause ne disparait pas a la reprise")

// ---------- jouer la partie : hote repond juste (forme SANS parentheses), Lea passe ----------
const answered = new Set()
let recapChecked = false
const t0 = Date.now()
while (Date.now() - t0 < 4 * 60 * 1000) {
  const hs = await host.evaluate(() => {
    const txt = document.body.innerText || ""
    const r = txt.match(/ROUND\s*(\d+)\s*\/\s*(\d+)/i)
    return {
      round: r ? Number(r[1]) : null,
      input: !!document.querySelector('input[placeholder="Titre du morceau"]'),
      recap: !!document.querySelector(".theater-recap"),
      fin: /On rejoue \?|FIN DE LA FACE/i.test(txt),
      txt: txt.replace(/\s+/g, " "),
    }
  }).catch(() => ({}))
  if (hs.fin) break
  if (hs.input && hs.round && !answered.has(hs.round)) {
    answered.add(hs.round)
    // titre de base sans les parentheses ni suffixe " - ..." : doit valider
    const base = known[0].replace(/\(.*?\)|\[.*?\]/g, " ").split(" - ")[0].trim()
    await host.locator('input[placeholder="Titre du morceau"]').fill(base).catch(() => {})
    await host.locator('input[placeholder="Tape ici..."]').fill(known[1].split(",")[0].trim()).catch(() => {})
    await host.locator('button[type="submit"]').first().click().catch(() => {})
  }
  await lea.getByText(/Je sais pas/i).first().click({ timeout: 250 }).catch(() => {})
  if (hs.recap && !recapChecked) {
    recapChecked = true
    const recapTxt = await host.evaluate(() => document.querySelector(".theater-recap")?.textContent ?? "")
    if (/Lea/.test(recapTxt) && /Tymeo|toi/.test(recapTxt)) say("  [ok] recap central du reveal : réponses des deux joueurs affichées")
    else bad(`recap incomplet: ${recapTxt.slice(0, 120)}`)
    await host.screenshot({ path: `${SHOTS}/3-recap.png` })
  }
  await sleep(500)
}
say(`manches repondues par l'hote : ${answered.size}`)

// le matching genereux a-t-il valide au moins une fois ? (score hote > 0 si la
// forme de base du titre temoin est passee sur SA manche)
const finTxt = await host.evaluate(() => document.body.innerText)
await host.screenshot({ path: `${SHOTS}/4-fin.png` })

// ---------- provenance : AUCUN titre de la carte decochee ----------
const roomSession = psql(`SELECT session_id FROM multiplayer_rooms WHERE room_code='${code}'`)
if (roomSession) {
  const fromB = psql(`SELECT count(*) FROM game_rounds gr JOIN audio_sources a ON a.id = gr.audio_source_id WHERE gr.session_id = ${roomSession} AND a.link_id = ${linkB}`)
  const fromA = psql(`SELECT count(*) FROM game_rounds gr JOIN audio_sources a ON a.id = gr.audio_source_id WHERE gr.session_id = ${roomSession} AND a.link_id = ${linkA}`)
  say(`  provenance des manches : carte cochée=${fromA}, carte DÉCOCHÉE=${fromB}`)
  if (Number(fromB) > 0) bad("des titres de la carte decochee ont joue !")
  else say("  [ok] la carte décochée n'a fourni aucun titre")
} else {
  say("  (pas de session_id, provenance non verifiable)")
}

say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(p => say("  - " + p))
await b.close()
// menage
psql(`DELETE FROM audio_sources WHERE external_id LIKE 'e2e-%'`)
psql(`DELETE FROM imported_links WHERE normalized_url LIKE 'e2e-%'`)
process.exit(problems.length ? 1 : 0)
