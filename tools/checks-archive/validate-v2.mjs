import { chromium } from "@playwright/test"
import fs from "fs"
const BASE = "https://dev.tymmerc.eu/blindify"
const SHOTS = "/opt/blindify/maquettes/shots/review"
const DEEZER = "https://www.deezer.com/profile/2529"
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const log = (n, ok, d="") => console.log(`${ok?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`)
const b = await chromium.launch()
const mk = async (w,h) => { const c = await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5}); await c.setExtraHTTPHeaders({"X-E2E-Key":E2E_KEY}); return c }
const guestImport = async (p, nick) => {
  await p.goto(`${BASE}/`, {waitUntil:"networkidle",timeout:45000})
  await p.locator("input").first().fill(nick)
  await p.getByRole("button",{name:/continuer/i}).click()
  await p.locator('input[placeholder^="https://"]').fill(DEEZER)
  await p.getByRole("button",{name:/importer ma musique/i}).click()
  await p.getByText(/titres? importés?/).waitFor({timeout:40000})
}

// ===== BUG 1 : indice solo ne fuit pas =====
try {
  const s = await (await mk(390,844)).newPage()
  await guestImport(s, "SoloT")
  await s.goto(`${BASE}/solo/?source=quickplay&quickUrl=${encodeURIComponent(DEEZER)}&count=5`, {waitUntil:"networkidle",timeout:45000})
  // attendre le jeu solo (champ de reponse)
  await s.locator('input').first().waitFor({timeout:40000})
  await s.waitForTimeout(1500)
  const hint = s.getByRole("button",{name:/indice.*titre/i}).first()
  await hint.click({timeout:10000})
  await s.getByText(/Commence par/i).first().waitFor({timeout:5000})
  log("BUG1: indice affiche en manche 1", true)
  // repondre pour finir la manche + laisser passer a la manche 2
  await s.locator('input').first().fill("zzzznope")
  await s.getByRole("button",{name:/valider|répondre|envoyer|deviner/i}).first().click().catch(()=>{})
  // attendre le changement de manche (le compteur X/5 change ou nouvel input vide)
  await s.waitForTimeout(11000)
  const leaked = await s.getByText(/Commence par/i).first().isVisible().catch(()=>false)
  log("BUG1: indice DISPARU en manche suivante (ne fuit plus)", !leaked)
  await s.screenshot({path:`${SHOTS}/fix-solo-hint-r2.png`, fullPage:true})
} catch(e){ log("BUG1 solo", false, e.message?.slice(0,120)) }

// ===== BUG 2 + 3 : event, lancer et LAISSER finir sans interagir =====
const host = await (await mk(1440,900)).newPage()
let code=""
try {
  await guestImport(host, "FixDJ2")
  await host.getByText("Créer une partie").click()
  await host.waitForURL(/\/modes/,{timeout:20000})
  await host.getByText("Autour d'une table").first().click()
  await host.getByText("Je joue aussi").waitFor({timeout:20000})
  await host.getByText("Je joue aussi").click()
  await host.getByText("CODE DE LA SALLE").waitFor({timeout:25000})
  await host.getByRole("button",{name:"5",exact:true}).click()      // 5 manches
  await host.getByRole("button",{name:"10s",exact:true}).click()    // 10s (mini reel)
  code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
  // BUG3 mobile : mesurer le QR sur telephone
  const m = await (await mk(390,844)).newPage()
  await m.goto(`${BASE}/multiplayer/?mode=event&intent=host&nickname=FixDJ2`, {waitUntil:"networkidle",timeout:45000}).catch(()=>{})
  // reutilise la salle courante de host plutot : on screenshot le host mobile
  await host.setViewportSize({width:390,height:844})
  await host.waitForTimeout(800)
  const qr = host.locator('div.bg-white svg').first()
  const box = await qr.boundingBox()
  log("BUG3: QR compact sur mobile (<=150px)", box && box.width <= 150 && box.width >= 90, box?`${Math.round(box.width)}px`:"?")
  await host.screenshot({path:`${SHOTS}/fix-qr-mobile.png`, fullPage:true})
  await host.setViewportSize({width:1440,height:900})
  await m.close()
} catch(e){ log("event setup", false, e.message?.slice(0,120)) }

try {
  const p1 = await (await mk(390,844)).newPage()
  await p1.goto(`${BASE}/?join=${code}`, {waitUntil:"networkidle",timeout:45000})
  await p1.locator("input").first().fill("FixPote2")
  await p1.getByRole("button",{name:/continuer/i}).click()
  await p1.getByRole("button",{name:/rejoindre la partie/i}).click()
  await p1.getByText("Tu es dans la partie").waitFor({timeout:45000})
  await host.getByText("FixPote2").first().waitFor({timeout:15000})
  await host.getByRole("button",{name:/lancer la partie/i}).click()
  // NE PAS interagir : le filet anti-AFK (10s/manche) mene la partie au bout.
  const isResults = async () => { const t=(await host.locator("body").textContent().catch(()=>""))||""; return /Fin de la face|Titres joués|Retour modes/.test(t) }
  const isLobby = async () => { const t=(await host.locator("body").textContent().catch(()=>""))||""; return /Rejoignez la partie|CODE DE LA SALLE/.test(t) }
  let reached=false
  for(let i=0;i<80;i++){ if(await isResults()){reached=true;break} await host.waitForTimeout(2000) }
  log("BUG2: classement atteint en fin de partie", reached)
  if(reached){
    await host.screenshot({path:`${SHOTS}/fix-results-A.png`, fullPage:true})
    await host.waitForTimeout(9000)
    const stillR = await isResults(), gone = await isLobby()
    log("BUG2: classement TOUJOURS la apres 9s (ne part plus tout seul)", stillR && !gone, stillR?"reste":(gone?"parti->lobby":"parti"))
    await host.screenshot({path:`${SHOTS}/fix-results-B.png`, fullPage:true})
  }
} catch(e){ log("BUG2 game", false, e.message?.slice(0,140)) }

await b.close(); console.log("done")
