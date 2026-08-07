import { chromium } from "@playwright/test"
import fs from "fs"
const BASE = "https://dev.tymmerc.eu/blindify"
const SHOTS = "/opt/blindify/maquettes/shots/review"
const DEEZER = "https://www.deezer.com/profile/2529"
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const log = (n, ok, d="") => console.log(`${ok?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`)
const b = await chromium.launch()
const c = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5}); await c.setExtraHTTPHeaders({"X-E2E-Key":E2E_KEY})
const s = await c.newPage()
try {
  await s.goto(`${BASE}/`, {waitUntil:"networkidle",timeout:45000})
  await s.locator("input").first().fill("SoloHint")
  await s.getByRole("button",{name:/continuer/i}).click()
  await s.locator('input[placeholder^="https://"]').fill(DEEZER)
  await s.getByRole("button",{name:/importer ma musique/i}).click()
  await s.getByText(/titres? importés?/).waitFor({timeout:40000})
  await s.goto(`${BASE}/solo/?source=quickplay&quickUrl=${encodeURIComponent(DEEZER)}&count=5`, {waitUntil:"networkidle",timeout:45000})
  await s.getByText(/QUESTION 1 SUR/i).waitFor({timeout:40000})
  await s.waitForTimeout(1200)

  // Manche 1 : utiliser l'indice titre
  await s.getByRole("button",{name:/indice.*titre/i}).first().click({timeout:10000})
  await s.getByText(/Commence par/i).first().waitFor({timeout:5000})
  log("manche 1: indice affiche", true)

  // repondre faux -> dialogue -> Manche suivante
  await s.locator('input').first().fill("zzz")
  await s.getByRole("button",{name:/valider|deviner|répondre|envoyer/i}).first().click().catch(()=>{})
  await s.getByRole("button",{name:/manche suivante/i}).waitFor({timeout:10000})
  await s.getByRole("button",{name:/manche suivante/i}).click()
  await s.getByText(/QUESTION 2 SUR/i).waitFor({timeout:15000})
  await s.waitForTimeout(1200)
  log("passe en manche 2", true)

  // L'indice de la manche 1 ne doit PLUS etre affiche
  const leaked = await s.getByText(/Commence par/i).first().isVisible().catch(()=>false)
  log("BUG1 FIX: indice de la manche 1 ABSENT en manche 2", !leaked)
  // et le bouton indice doit etre re-cliquable (pas en etat "revele")
  const btnLabel = await s.getByRole("button",{name:/indice.*titre|commence par/i}).first().textContent().catch(()=>"")
  log("BUG1 FIX: bouton indice re-arme en manche 2", /indice/i.test(btnLabel||""), (btnLabel||"").trim())
  await s.screenshot({path:`${SHOTS}/fix-solo-hint-manche2.png`, fullPage:true})
} catch(e){ log("solo-hint", false, e.message?.slice(0,140)) }
await b.close(); console.log("done")
