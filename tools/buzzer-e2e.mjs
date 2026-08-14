// E2E du mode "un seul tel" (?tap : un clic pose/leve le doigt).
// Scenario : 3 joueurs, tous posent, musique, Lea lache la premiere, Max lache
// dans la fenetre de grace. Lea repond FAUX (pas de reveal), le tel passe a Max
// qui repond juste (titre reel du round, lu depuis l'API) -> points + reveal.
import { chromium, devices } from "@playwright/test"
import fs from "fs"

const B = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/buzzer"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { problems.push(m); say("  !! " + m) }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const ctx = await b.newContext({ ...devices["iPhone 13"] })
await ctx.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
const page = await ctx.newPage()
page.on("pageerror", e => bad(`crash JS: ${String(e).slice(0, 140)}`))

// le round en cours expose son titre via l'API solo -> on l'intercepte pour "connaitre" les reponses
let apiTracks = []
page.on("response", async r => {
  if (r.url().includes("/api/games/solo") && r.request().method() === "POST") {
    try { apiTracks = (await r.json()).data.tracks } catch { /* pas ce call */ }
  }
})

// il faut une session + musique importee : on passe par l'accueil comme un humain
await page.goto(`${B}/`, { waitUntil: "networkidle", timeout: 90000 })
await page.locator("input").first().fill("Tymeo")
await page.getByRole("button", { name: /continuer/i }).click()
await page.locator('input[placeholder^="https://"]').fill("https://www.deezer.com/profile/2529")
await page.getByRole("button", { name: /importer ma musique/i }).click()
await page.getByText(/titres? importés?/).waitFor({ timeout: 90000 })
say("musique importee")

await page.goto(`${B}/buzzer/?tap`, { waitUntil: "networkidle", timeout: 60000 })
await page.locator('input[placeholder="Joueur 1"]').fill("Lea")
await page.locator('input[placeholder="Joueur 2"]').fill("Max")
await page.getByRole("button", { name: /ajouter un joueur/i }).click()
await page.locator('input[placeholder="Joueur 3"]').fill("Zoe")
await page.getByRole("button", { name: "5", exact: true }).click()
await page.getByRole("button", { name: /lancer la partie/i }).click()
await page.getByText(/posez tous votre doigt/i).waitFor({ timeout: 60000 })
say("plateau affiche")
await page.screenshot({ path: `${SHOTS}/1-plateau.png` })

const zone = name => page.locator("div").filter({ hasText: new RegExp(`^${name}`) }).locator("visible=true").last()
const tapZone = async name => { await page.getByText(name, { exact: true }).click({ force: true }) }

// tout le monde pose le doigt
for (const n of ["Lea", "Max", "Zoe"]) await tapZone(n)
await page.getByText(/LÂCHE POUR RÉPONDRE/i).first().waitFor({ timeout: 15000 })
say("3-2-1 passe, musique lancee, plateau rouge")
await page.screenshot({ path: `${SHOTS}/2-rouge.png` })

// Lea lache, puis Max dans la fenetre de grace
await tapZone("Lea")
await sleep(300)
await tapZone("Max")
await page.getByText(/Lea !/).waitFor({ timeout: 8000 })
say("handoff : Lea prend le tel")
await page.screenshot({ path: `${SHOTS}/3-handoff.png` })
await page.getByRole("button", { name: /je suis caché/i }).click()
await page.locator('input[placeholder="Titre du morceau"]').fill("reponse totalement fausse")
await page.getByRole("button", { name: /^valider$/i }).click()
await page.getByText("FAUX.").waitFor({ timeout: 5000 })
const wrongTxt = await page.evaluate(() => document.body.innerText)
if (apiTracks[0] && wrongTxt.includes(apiTracks[0].title)) bad("la reponse est revelee sur l'ecran FAUX")
else say("FAUX affiche, reponse non revelee")
if (!/Passe le tel à Max/i.test(wrongTxt)) bad(`le tel ne passe pas a Max (${wrongTxt.replace(/\s+/g, " ").slice(0, 120)})`)
await page.screenshot({ path: `${SHOTS}/4-faux.png` })

await page.getByRole("button", { name: /continuer/i }).click()
await page.getByText(/Max !/).waitFor({ timeout: 5000 })
await page.getByRole("button", { name: /je suis caché/i }).click()
const t0 = apiTracks[0]
await page.locator('input[placeholder="Titre du morceau"]').fill(t0?.title ?? "x")
await page.locator('input[placeholder="Artiste (bonus)"]').fill(t0?.artist ?? "")
await page.getByRole("button", { name: /^valider$/i }).click()
await page.getByText(/Max \+3 pts/).waitFor({ timeout: 5000 }).catch(async () => {
  bad(`pas de +3 pour Max au reveal (${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 160)})`)
})
say("Max marque 3 pts, reveal affiche")
await page.screenshot({ path: `${SHOTS}/5-reveal.png` })

// on enchaine les manches restantes vite fait : Zoe trouve tout
for (let r = 1; r < 5; r++) {
  await page.getByRole("button", { name: /manche suivante/i }).click()
  await page.getByText(/posez tous votre doigt/i).waitFor({ timeout: 10000 })
  for (const n of ["Lea", "Max", "Zoe"]) await tapZone(n)
  await page.getByText(/LÂCHE POUR RÉPONDRE/i).first().waitFor({ timeout: 15000 })
  await tapZone("Zoe")
  await page.getByText(/Zoe !/).waitFor({ timeout: 8000 })
  await page.getByRole("button", { name: /je suis caché/i }).click()
  const t = apiTracks[r]
  await page.locator('input[placeholder="Titre du morceau"]').fill(t?.title ?? "x")
  await page.locator('input[placeholder="Artiste (bonus)"]').fill(t?.artist ?? "")
  await page.getByRole("button", { name: /^valider$/i }).click()
  await page.getByText(/Manche suivante|Voir le classement/i).waitFor({ timeout: 8000 })
  say(`manche ${r + 1} jouee`)
}
await page.getByRole("button", { name: /voir le classement/i }).click()
await page.getByText(/Rejouer/i).waitFor({ timeout: 8000 })
const podium = await page.evaluate(() => document.body.innerText)
say("podium:", podium.replace(/\s+/g, " ").slice(0, 160))
if (!/Zoe/.test(podium)) bad("Zoe absente du podium")
await page.screenshot({ path: `${SHOTS}/6-podium.png` })

say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(p => say("  - " + p))
await b.close()
process.exit(problems.length ? 1 : 0)
