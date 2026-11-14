// T30 : maquette du mode sombre sur les vraies pages de prod.
// Charge la page en clair, capture, puis remplace chaque couleur calculee par
// son equivalent "nuit chaude" (par propriete : texte, fond, bordure, ombre)
// et capture a nouveau. Sert seulement a montrer la palette a Tym avant de coder.
import { chromium } from "@playwright/test"
import fs from "fs"
import { NUIT, nuitChaude, poserBouton, soleilApres } from "./t30-nuit.mjs"

const B = "https://blindz.app"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const OUT = process.argv[2] || "/opt/blindify-wt/t30/maquettes/t30"
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const shots = [
  { path: "/", name: "accueil", bouton: "entete" },
  { path: "/jouer/", name: "jouer", bouton: "pile" },
]
const views = [
  { tag: "tel", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { tag: "ordi", viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 },
]

const b = await chromium.launch()
try {
  for (const v of views) {
    const ctx = await b.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch, colorScheme: "light", reducedMotion: "reduce" })
    await ctx.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
    for (const s of shots) {
      const page = await ctx.newPage()
      await page.goto(B + s.path, { waitUntil: "networkidle", timeout: 120000 })
      await sleep(2500)
      if (s.bouton) await page.evaluate(poserBouton, s.bouton)
      await page.screenshot({ path: `${OUT}/${s.name}-${v.tag}-clair.png` })
      await page.evaluate(nuitChaude, NUIT)
      await page.evaluate(soleilApres)
      await sleep(600)
      await page.screenshot({ path: `${OUT}/${s.name}-${v.tag}-sombre.png` })
      console.log("ok", s.name, v.tag)
      await page.close()
    }
    await ctx.close()
  }
} finally {
  await b.close()
}

