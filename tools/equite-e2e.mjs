// Verifie : (1) repartition equitable des titres entre joueurs qui ont chacun
// leur musique, (2) bouton "Je sais pas" -> manches courtes quand personne ne sait.
import { chromium, devices } from "@playwright/test"
import fs from "fs"

const B = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { problems.push(m); say("  !! " + m) }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }

import { execSync } from "child_process"
// Seed SQL : copie des titres DEJA hydrates (URLs fraiches) vers le compte de
// test, avec des external_id synthetiques pour ne pas voler la propriete des
// vrais comptes. Zero appel Deezer : le VPS est rate-limite par Akamai.
const seedLibrary = (userId, fromUserId, n) => {
  const sql = `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata)
    SELECT provider, 'e2e-' || md5(random()::text || id::text), ${userId}, title, artist, album_cover, audio_url, duration_ms, metadata
    FROM audio_sources WHERE user_id = ${fromUserId} AND audio_url IS NOT NULL AND audio_url <> '' LIMIT ${n};`
  execSync(`docker exec blindify-postgres psql -U blindify -d blindify -qc "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`)
}
const grabUserId = page => new Promise(resolve => {
  page.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      try { const d = await r.json(); const id = d?.data?.user?.id; if (id) resolve(id) } catch { /* pas ce call */ }
    }
  })
})

const hostCtx = await mk({ viewport: { width: 1440, height: 900 } })
const host = await hostCtx.newPage()
const hostIdP = grabUserId(host)
await host.goto(`${B}/`, { waitUntil: "networkidle", timeout: 90000 })
await host.locator("input").first().fill("Tymeo")
await host.getByRole("button", { name: /continuer/i }).click()
// URL vide -> Continuer -> ecran Creer/Rejoindre
await host.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
const hostId = await hostIdP
seedLibrary(hostId, 3101, 20)
say(`hote guest ${hostId} seede avec 20 titres (copie de 3101)`) 
await host.getByText(/créer une partie/i).click()
await host.waitForURL(/\/modes/, { timeout: 40000 })
await host.getByText("Autour d'une table").first().click()
await host.getByText("Je présente seulement").waitFor({ timeout: 40000 })
await host.getByText("Je présente seulement").click()
await host.getByText("CODE DE LA SALLE").waitFor({ timeout: 40000 })
await host.getByRole("button", { name: "10", exact: true }).click()
const sevenBtn = host.getByRole("button", { name: "7s", exact: true })
if (await sevenBtn.isVisible().catch(() => false)) { await sevenBtn.click(); say("duree 7s selectionnee (nouveau bouton OK)") }
else { bad("bouton 7s absent du lobby"); await host.getByRole("button", { name: "10s", exact: true }).click() }
const code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
say(`room ${code}`)

// deux joueurs, chacun SA musique (profils deezer differents)
const players = []
for (const [name, seedFrom] of [["Lea", 3103], ["Max", null]]) {
  const ctx = await mk({ ...devices["iPhone 13"] })
  const p = await ctx.newPage()
  const idP = grabUserId(p)
  await p.goto(`${B}/?join=${code}`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(name)
  await p.getByRole("button", { name: /continuer/i }).click()
  if (seedFrom) {
    const uid = await idP
    seedLibrary(uid, seedFrom, 20)
    say(`  ${name}: guest ${uid} seede avec 20 titres (copie de ${seedFrom})`)
  }
  await p.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
  await p.getByText("Tu es dans la partie").waitFor({ timeout: 90000 })
  players.push({ name, page: p, imported: Boolean(seedFrom) })
}

await host.getByRole("button", { name: /lancer la partie/i }).click()
say("partie lancee : tout le monde passe des que possible\n")

// boucle : chaque joueur clique "Je sais pas" des qu'il voit le champ ; on note
// l'heure de chaque debut de manche et le "Proposé par X" du reveal cote hote.
const roundStarts = []
const owners = []
let lastRound = 0
const t0 = Date.now()
while (Date.now() - t0 < 5 * 60 * 1000) {
  const hs = await host.evaluate(() => {
    const txt = document.body.innerText || ""
    const r = txt.match(/Événement\s+(?:REVEAL|\d+s)\s+(\d+)\s*\/\s*(\d+)/)
    const owner = (txt.match(/Proposé par ([^\n]+)/) || [])[1]
    return { round: r ? Number(r[1]) : null, owner: owner?.trim() ?? null, fin: /FIN DE LA FACE|On rejoue \?/i.test(txt) }
  }).catch(() => ({}))
  if (hs.fin) break
  if (hs.round && hs.round !== lastRound) { lastRound = hs.round; roundStarts.push(Date.now()) }
  if (hs.owner && owners[lastRound] === undefined) owners[lastRound] = hs.owner
  for (const { page } of players) {
    await page.getByText(/Je sais pas, passer/i).click({ timeout: 300 }).catch(() => {})
  }
  await sleep(400)
}

const durations = roundStarts.slice(1).map((t, i) => (t - roundStarts[i]) / 1000)
const avg = durations.length ? (durations.reduce((a, c) => a + c, 0) / durations.length).toFixed(1) : "?"
say(`manches jouees: ${lastRound}, duree moyenne d'un cycle: ${avg}s (${durations.map(d => d.toFixed(0)).join(", ")})`)
if (durations.length && durations.every(d => d > 14)) bad("le pass ne raccourcit pas les manches (cycle > 14s alors que tout le monde passe)")
else say("  [ok] passer raccourcit les manches")

const tally = {}
owners.forEach(o => { if (o) tally[o] = (tally[o] ?? 0) + 1 })
say("repartition 'Proposé par':", JSON.stringify(tally))
const importedPlayers = players.filter(p => p.imported).length + 1 // + hote
const distinct = Object.keys(tally).length
if (distinct < Math.min(2, importedPlayers)) bad(`un seul contributeur dans la partie alors que ${importedPlayers} ont importe`)
else {
  const counts = Object.values(tally)
  if (Math.max(...counts) - Math.min(...counts) > 2) bad(`repartition desequilibree: ${JSON.stringify(tally)}`)
  else say("  [ok] repartition equitable entre contributeurs")
}

say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(p => say("  - " + p))
await b.close()
// menage : les bibliotheques synthetiques ne doivent pas s'accumuler en base
try { execSync(`docker exec blindify-postgres psql -U blindify -d blindify -qc "DELETE FROM audio_sources WHERE external_id LIKE 'e2e-%'"`) } catch { /* tant pis */ }
process.exit(problems.length ? 1 : 0)

