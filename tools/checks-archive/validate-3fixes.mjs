import { chromium } from "@playwright/test"
import fs from "fs"
const BASE = "https://dev.tymmerc.eu/blindify"
const SHOTS = "/opt/blindify/maquettes/shots/review"
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const log = (n, ok, d="") => console.log(`${ok?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`)
const b = await chromium.launch()
const mk = async (w,h) => { const c = await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5}); await c.setExtraHTTPHeaders({"X-E2E-Key":E2E_KEY}); return c }

// ===== BUG 1 : indice solo ne fuit pas entre les manches =====
try {
  const s = await (await mk(390,844)).newPage()
  await s.goto(`${BASE}/`, {waitUntil:"networkidle",timeout:45000})
  await s.locator("input").first().fill("SoloTest")
  await s.getByRole("button",{name:/continuer/i}).click()
  await s.locator('input[placeholder^="https://"]').fill("https://www.deezer.com/profile/2529")
  await s.getByRole("button",{name:/importer ma musique/i}).click()
  await s.getByText(/titres? importés?/).waitFor({timeout:40000})
  // aller au solo via /solo direct
  await s.goto(`${BASE}/solo/`, {waitUntil:"networkidle",timeout:45000})
  // demarrer une partie solo (bouton jouer / lancer)
  const startBtn = s.getByRole("button",{name:/jouer|lancer|commencer|go/i}).first()
  await startBtn.click({timeout:10000}).catch(()=>{})
  await s.locator('input').first().waitFor({timeout:30000})
  // utiliser l'indice titre a la manche 1
  const hint = s.getByRole("button",{name:/indice.*titre/i}).first()
  await hint.click({timeout:8000})
  await s.getByText(/Commence par/i).first().waitFor({timeout:5000})
  const round1 = await s.locator("header, body").first().textContent()
  // repondre faux pour passer a la manche suivante
  await s.locator('input').first().fill("zzz")
  await s.getByRole("button",{name:/valider|répondre|envoyer/i}).first().click().catch(()=>{})
  await s.waitForTimeout(9000) // laisser le reveal + passage manche 2
  const leaked = await s.getByText(/Commence par/i).first().isVisible().catch(()=>false)
  log("BUG1 solo: indice n'apparait PAS en manche 2", !leaked)
} catch(e){ log("BUG1 solo", false, e.message?.slice(0,110)) }

// ===== BUG 2 + 3 : event =====
let code=""
const host = await (await mk(1440,900)).newPage()
try {
  await host.goto(`${BASE}/`, {waitUntil:"networkidle",timeout:45000})
  await host.locator("input").first().fill("FixDJ")
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
  await host.getByRole("button",{name:"5",exact:true}).click().catch(()=>{})
  await host.getByRole("button",{name:"5s",exact:true}).click().catch(()=>{})
  code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
  // BUG3 : QR compact
  const qrBox = await host.locator("svg").first().boundingBox()
  log("BUG3 QR compact (<=200px)", qrBox && qrBox.width <= 205, qrBox?`${Math.round(qrBox.width)}px`:"?")
  await host.screenshot({path:`${SHOTS}/fix-qr-lobby.png`, fullPage:true})
} catch(e){ log("event setup", false, e.message?.slice(0,110)) }

// joueur + jouer 3 manches
try {
  const p1 = await (await mk(390,844)).newPage()
  await p1.goto(`${BASE}/?join=${code}`, {waitUntil:"networkidle",timeout:45000})
  await p1.locator("input").first().fill("FixPote")
  await p1.getByRole("button",{name:/continuer/i}).click()
  await p1.getByRole("button",{name:/rejoindre la partie/i}).click()
  await p1.getByText("Tu es dans la partie").waitFor({timeout:45000})
  await host.getByText("FixPote").first().waitFor({timeout:15000})
  await host.getByRole("button",{name:/lancer la partie/i}).click()

  // laisser la partie se derouler (3 manches x 5s + reveals + filet), on tape des reponses
  const deadline = Date.now()+120000
  let reachedResults=false
  while(Date.now()<deadline){
    const t = (await host.locator("body").textContent().catch(()=>"")) || ""
    if(/Fin de la face|Titres joués|Retour modes/.test(t)){ reachedResults=true; break }
    await host.locator('input[placeholder*="morceau qui tourne"]').fill("x").catch(()=>{})
    await p1.locator('input[placeholder*="morceau qui tourne"]').fill("x").catch(()=>{})
    // cliquer "manche suivante"/pret si dispo pour accelerer
    await host.getByRole("button",{name:/suivant|prêt|continuer|manche/i}).first().click({timeout:500}).catch(()=>{})
    await p1.getByRole("button",{name:/suivant|prêt|continuer|manche/i}).first().click({timeout:500}).catch(()=>{})
    await host.waitForTimeout(1500)
  }
  log("BUG2: ecran de fin (classement) atteint", reachedResults)
  if(reachedResults){
    await host.screenshot({path:`${SHOTS}/fix-results-t0.png`, fullPage:true})
    // LE test : rester 8s et verifier que le classement est TOUJOURS la
    await host.waitForTimeout(8000)
    const still = (await host.locator("body").textContent().catch(()=>"")) || ""
    const stillResults = /Fin de la face|Titres joués|Retour modes/.test(still)
    const backToLobby = /Rejoignez la partie|CODE DE LA SALLE/.test(still)
    log("BUG2: classement TOUJOURS affiche apres 8s (ne part plus tout seul)", stillResults && !backToLobby, stillResults?"reste":"parti -> "+(backToLobby?"lobby":"?"))
    await host.screenshot({path:`${SHOTS}/fix-results-t8.png`, fullPage:true})
  }
} catch(e){ log("BUG2 game", false, e.message?.slice(0,140)) }

await b.close(); console.log("done")
