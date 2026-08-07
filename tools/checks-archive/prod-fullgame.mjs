import { chromium } from "@playwright/test"
import { execSync } from "child_process"
import fs from "fs"
const BASE = "https://tymmerc.eu/blindify"
const SHOTS = "/opt/blindify/maquettes/shots/review"
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const log = (n, ok, d="") => console.log(`${ok?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`)
const b = await chromium.launch()
const mk = async (w,h) => { const c = await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5}); await c.setExtraHTTPHeaders({"X-E2E-Key":E2E_KEY}); return c }

const host = await (await mk(1440,900)).newPage()
await host.goto(`${BASE}/`, {waitUntil:"networkidle",timeout:45000})
await host.locator("input").first().fill("ProdDJ")
await host.getByRole("button",{name:/continuer/i}).click()
await host.locator('input[placeholder^="https://"]').fill("https://www.deezer.com/profile/2529")
await host.getByRole("button",{name:/importer ma musique/i}).click()
await host.getByText(/titres? importés?/).waitFor({timeout:40000})
await host.getByText("Créer une partie").waitFor({timeout:8000})
await host.getByText("Créer une partie").click()
await host.waitForURL(/\/modes/,{timeout:20000})
await host.getByText("Autour d'une table").first().click()
await host.getByText("Je joue aussi").waitFor({timeout:20000})
await host.getByText("Je joue aussi").click()
await host.getByText("CODE DE LA SALLE").waitFor({timeout:25000})
const code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
console.log("room:", code)

// Reglages : 5 manches, 10s
try {
  await host.getByText("Réglages").waitFor({timeout:8000})
  await host.getByRole("button",{name:"5",exact:true}).click()
  await host.getByRole("button",{name:"10s",exact:true}).click()
  await host.waitForTimeout(800)
  const db = execSync(`docker compose -f /opt/blindify/docker-compose.yml exec -T postgres psql -U blindify -d blindify -t -A -c "SELECT question_count||'|'||COALESCE(round_duration_ms,0) FROM multiplayer_rooms WHERE room_code='${code}'"`, {encoding:"utf8"}).trim()
  log("reglages: 5 manches + 10s sauves en DB", db.includes("5|10000"), db)
  await host.screenshot({path:`${SHOTS}/ideas-01-reglages.png`, fullPage:true})
} catch(e){ log("reglages", false, e.message?.slice(0,120)) }

// 1 joueur
const p1 = await (await mk(390,844)).newPage()
await p1.goto(`${BASE}/?join=${code}`, {waitUntil:"networkidle",timeout:45000})
await p1.locator("input").first().fill("ProdPote")
await p1.getByRole("button",{name:/continuer/i}).click()
await p1.getByRole("button",{name:/rejoindre la partie/i}).click()
await p1.getByText("Tu es dans la partie").waitFor({timeout:45000})
await host.getByText("ProdPote").first().waitFor({timeout:15000})

// Lancement -> 3-2-1
await host.getByRole("button",{name:/lancer la partie/i}).click()
let sawIntro = false
for (let i=0;i<14;i++) {
  const n = await host.locator("span.font-display").filter({hasText:/^[123]$/}).first().isVisible().catch(()=>false)
  if (n) { sawIntro = true; await host.screenshot({path:`${SHOTS}/ideas-02-321.png`}); break }
  await host.waitForTimeout(250)
}
log("compte a rebours 3-2-1 sur l'ecran central", sawIntro)

// Config appliquee : header X/5
await host.locator('input[placeholder*="morceau qui tourne"]').waitFor({timeout:45000})
const header = await host.locator("header").textContent()
log("config appliquee: total 5 manches dans le header", /\/5/.test(header||""), (header||"").slice(0,60))

// Attendre la fin (5 manches, filet anti-AFK inclus) -> ecran resultats
await host.getByText(/Résultats|Partie terminée/).first().waitFor({timeout:220000})
await host.waitForTimeout(800)
await host.screenshot({path:`${SHOTS}/ideas-03-fin-confettis.png`, fullPage:true})
const rejouer = host.getByRole("button",{name:/rejouer/i})
log("ecran de fin: bouton Rejouer present", await rejouer.first().isVisible().catch(()=>false))

// Rejouer -> nouvelle partie round 1/5
await rejouer.first().click()
await host.locator('input[placeholder*="morceau qui tourne"]').waitFor({timeout:45000})
const h2 = await host.locator("header").textContent()
log("rejouer relance une partie (round 1/5)", /1\/5/.test(h2||""), (h2||"").slice(0,50))
await host.screenshot({path:`${SHOTS}/ideas-04-rematch.png`})
await b.close()
console.log("done")
