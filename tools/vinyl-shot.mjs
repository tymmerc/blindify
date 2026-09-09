// Capture rapprochee du disque du hero (desktop + mobile), pour verifier
// l'etiquette centrale.
import { chromium, devices } from "@playwright/test"
import fs from "fs"
const B = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/landing"
fs.mkdirSync(SHOTS, { recursive: true })
const b = await chromium.launch()
for (const [tag, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["mobile", devices["iPhone 13"]]]) {
  const c = await b.newContext(opts); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
  const p = await c.newPage()
  await p.goto(`${B}/`, { waitUntil: "networkidle", timeout: 120000 })
  await p.waitForTimeout(1500)
  const disc = p.locator("section").first().locator("div.relative > div.relative").first()
  await disc.scrollIntoViewIfNeeded()
  await p.waitForTimeout(600)
  const box = await disc.boundingBox()
  if (box) await p.screenshot({ path: `${SHOTS}/vinyle-${tag}.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 40), width: box.width + 80, height: box.height + 80 } })
  else await p.screenshot({ path: `${SHOTS}/vinyle-${tag}.png` })
  console.log(`[ok] ${tag}: capture du disque`)
  await c.close()
}
await b.close()
