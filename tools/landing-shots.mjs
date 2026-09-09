// Captures de la landing (desktop + mobile, plusieurs positions de scroll)
// + verification que /?join=CODE redirige vers le wizard sans perdre le code.
import { chromium, devices } from "@playwright/test"
import fs from "fs"

const B = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/landing"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { problems.push(m); say("  !! " + m) }
const okk = m => say("  [ok] " + m)

const b = await chromium.launch()
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }

const shoot = async (page, tag) => {
  await page.goto(`${B}/`, { waitUntil: "networkidle", timeout: 120000 })
  await sleep(1200)
  await page.screenshot({ path: `${SHOTS}/${tag}-1-hero.png` })
  // Scroll dans les modes : le split-screen doit etre epingle, le disque a tourne
  await page.evaluate(() => document.querySelector('[data-mode="untel"]')?.scrollIntoView({ block: "center" }))
  await sleep(900)
  await page.screenshot({ path: `${SHOTS}/${tag}-2-modes.png` })
  await page.evaluate(() => document.querySelector("#comment-ca-marche")?.scrollIntoView({ block: "start" }))
  await sleep(900)
  await page.screenshot({ path: `${SHOTS}/${tag}-3-comment.png` })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await sleep(900)
  await page.screenshot({ path: `${SHOTS}/${tag}-4-fin.png` })
  // Pas de scroll horizontal (regle : le body ne deborde jamais)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  if (overflow) bad(`${tag}: la page deborde horizontalement`)
  else okk(`${tag}: pas de debordement horizontal`)
  const h1 = await page.locator("h1").first().innerText().catch(() => "")
  if (!/vos/i.test(h1)) bad(`${tag}: H1 inattendu "${h1}"`)
  else okk(`${tag}: H1 = "${h1.replace(/\s+/g, " ")}"`)
}

const desk = await mk({ viewport: { width: 1440, height: 900 } })
await shoot(await desk.newPage(), "desktop")
const mob = await mk({ ...devices["iPhone 13"] })
await shoot(await mob.newPage(), "mobile")

// QR : /?join=CODE doit atterrir sur le wizard avec le code prerempli
const qr = await (await mk({ ...devices["iPhone 13"] })).newPage()
await qr.goto(`${B}/?join=ab12cd`, { waitUntil: "networkidle", timeout: 120000 })
await sleep(2500)
const url = qr.url()
if (!/\/jouer\/\?join=AB12CD/.test(url)) bad(`redirection QR ratee, URL finale: ${url}`)
else okk(`QR /?join=ab12cd -> ${url.replace(B, "")}`)
const txt = await qr.evaluate(() => document.body.innerText)
if (!/Comment tu t/.test(txt)) bad("le wizard n'apparait pas apres la redirection QR")
else okk("le wizard s'affiche apres la redirection QR")
await qr.screenshot({ path: `${SHOTS}/mobile-5-qr-redirect.png` })

// Le bouton Jouer mene bien au wizard
const p = await (await mk({ ...devices["iPhone 13"] })).newPage()
await p.goto(`${B}/`, { waitUntil: "networkidle", timeout: 120000 })
await p.getByRole("link", { name: /jouer, c'est gratuit/i }).click()
await p.waitForURL(/\/jouer\//, { timeout: 60000 })
okk("CTA 'Jouer' -> /jouer/")

say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(x => say("  - " + x))
await b.close()
process.exit(problems.length ? 1 : 0)
