// T30 : capture d'une vraie manche "A distance" sur le dev, en clair puis en
// nuit chaude simulee. Hote sur ordi, invite sur telephone. Bibliotheques
// ensemencees en SQL (zero import Deezer), tout est supprime a la fin.
//
//   heavy node tools/t30-maquette-manche.mjs [dossier]
import { chromium, devices } from "@playwright/test"
import fs from "fs"
import { seedLibrary, cleanupSeeded, psql, entier, codeSalle } from "./seed-library.mjs"
import { NUIT, nuitChaude } from "./t30-nuit.mjs"

const B = "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const OUT = process.argv[2] || "/opt/blindify-wt/t30/maquettes/t30"
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const users = new Set(), codes = new Set(), ctxs = []
const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const page = async (opts, tag) => {
  const c = await b.newContext({ ...opts, colorScheme: "light", reducedMotion: "reduce" }); ctxs.push(c)
  await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
  const p = await c.newPage()
  p.on("pageerror", e => bad(`${tag} crash JS : ${String(e).slice(0, 140)}`))
  p.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      let id
      try { id = (await r.json())?.data?.user?.id } catch { /* pas ce call */ }
      if (id) { try { users.add(entier(id)); p.__uid = id } catch (e) { bad(`${tag} : ${e.message}`) } }
    }
  })
  return p
}
const wizard = async (p, nom, join) => {
  await p.goto(`${B}/jouer/${join ? `?join=${join}` : ""}`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(nom)
  await p.getByRole("button", { name: /continuer/i }).click()
  if (join) await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
  else await p.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
}
// Clair puis sombre. Le remappage fige les styles : on recharge pas, on capture
// le sombre en dernier pour chaque etat.
const deux = async (p, nom) => {
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" })
  await p.screenshot({ path: `${OUT}/${nom}-clair.png` })
  await p.evaluate(nuitChaude, NUIT)
  await sleep(400)
  await p.screenshot({ path: `${OUT}/${nom}-sombre.png` })
  console.log("  capture", nom)
}

try {
  const h = await page({ viewport: { width: 1366, height: 860 } }, "hote")
  await wizard(h, "Tymeo")
  await seedLibrary(h.__uid, 20)
  await h.getByText("Créer une partie").click()
  await h.waitForURL(/\/modes/, { timeout: 40000 })
  await h.getByText("À distance").first().click()
  await h.locator("[data-code]").waitFor({ timeout: 40000 })
  const code = codeSalle(await h.locator("[data-code]").first().getAttribute("data-code")); codes.add(code)
  const g = await page({ ...devices["iPhone 13"] }, "invite")
  await wizard(g, "Megane", code)
  await g.locator("[data-code]").waitFor({ timeout: 60000 })
  await seedLibrary(g.__uid, 12)
  await sleep(2500)
  await deux(g, "salon-tel")
  // Le remappage a fige l'invite : on recharge sa page pour la manche.
  await g.reload({ waitUntil: "networkidle" })
  await sleep(1500)
  await h.getByRole("button", { name: /^Lancer/ }).first().click({ timeout: 20000 })
  await g.locator("input").first().waitFor({ timeout: 60000 }).catch(() => bad("pas de champ de reponse cote invite"))
  await sleep(3500)
  await deux(g, "manche-tel")
  await deux(h, "manche-ordi")
} catch (e) {
  bad(`arret : ${e.message.split("\n")[0]}`)
} finally {
  for (const c of ctxs) await c.close().catch(() => {})
  await b.close()
  const ids = [...users].join(",")
  try {
    if (codes.size) psql(`UPDATE multiplayer_rooms SET status='finished' WHERE room_code IN (${[...codes].map(c => `'${c}'`).join(",")})`)
    cleanupSeeded([...users])
    if (ids) {
      psql(`DELETE FROM game_sessions WHERE host_user_id IN (${ids})`)
      psql(`DELETE FROM users WHERE id IN (${ids})`)
    }
    console.log(`menage : ${users.size} comptes, ${codes.size} salons`)
  } catch (e) { bad(`menage : ${e.message.split("\n")[0]}`) }
}
process.exit(problems.length ? 1 : 0)
