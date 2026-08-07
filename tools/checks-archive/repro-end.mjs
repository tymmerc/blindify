import { chromium } from "@playwright/test"
import fs from "fs"
const BASE = "https://dev.tymmerc.eu/blindify"
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const b = await chromium.launch()
const mk = async (w,h) => { const c = await b.newContext({viewport:{width:w,height:h}}); await c.setExtraHTTPHeaders({"X-E2E-Key":E2E_KEY}); return c }
const screenOf = async (p) => {
  const t = (await p.locator("body").textContent().catch(()=>"")) || ""
  if (/Fin de la face|Titres joués|Retour modes/.test(t)) return "RESULTATS(rejouer)"
  if (/Partie terminée/.test(t)) return "GAME-FINISHED"
  if (/morceau qui tourne|Extrait en cours|ont répondu/.test(t)) return "EN-JEU"
  if (/Rejoignez la partie|CODE DE LA SALLE/.test(t)) return "LOBBY"
  return "?("+t.replace(/[\n\t ]+/g," ").slice(0,40)+")"
}

const host = await (await mk(1440,900)).newPage()
await host.goto(`${BASE}/`, {waitUntil:"networkidle",timeout:45000})
await host.locator("input").first().fill("EndDJ")
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
// config mini : 3 manches, 5s
await host.getByRole("button",{name:"5",exact:true}).click().catch(()=>{})
await host.getByRole("button",{name:"5s",exact:true}).click().catch(()=>{})
const code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
console.log("room", code)

const p1 = await (await mk(390,844)).newPage()
await p1.goto(`${BASE}/?join=${code}`, {waitUntil:"networkidle",timeout:45000})
await p1.locator("input").first().fill("EndPote")
await p1.getByRole("button",{name:/continuer/i}).click()
await p1.getByRole("button",{name:/rejoindre la partie/i}).click()
await p1.getByText("Tu es dans la partie").waitFor({timeout:45000})
await host.getByText("EndPote").first().waitFor({timeout:15000})
await host.getByRole("button",{name:/lancer la partie/i}).click()

// poll les ecrans host + pote pendant 60s, log les transitions
let lastH="", lastP=""
for (let i=0;i<60;i++){
  const sh = await screenOf(host), sp = await screenOf(p1)
  if (sh!==lastH){ console.log(`t${i}s HOST -> ${sh}`); lastH=sh }
  if (sp!==lastP){ console.log(`t${i}s POTE -> ${sp}`); lastP=sp }
  // repondre vite pour finir les manches
  await host.locator('input[placeholder*="morceau qui tourne"]').fill("x").catch(()=>{})
  await p1.locator('input[placeholder*="morceau qui tourne"]').fill("x").catch(()=>{})
  await host.waitForTimeout(1000)
}
await b.close(); console.log("done")
