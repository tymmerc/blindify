// Captures de la FAQ : la section teaser sur la landing + la page /faq/,
// desktop et mobile. Verifie aussi qu'on ne deborde pas horizontalement et
// que la FAQ est atteignable depuis l'en-tete.
import { chromium, devices } from "@playwright/test"
import fs from "fs"

const B = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/faq"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }
const okk = m => console.log("  [ok] " + m)

const b = await chromium.launch()
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }

for (const [tag, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["mobile", devices["iPhone 13"]]]) {
  const ctx = await mk(opts)
  const page = await ctx.newPage()

  // 1. La section FAQ de la landing
  await page.goto(`${B}/`, { waitUntil: "networkidle", timeout: 120000 })
  await sleep(1000)
  const teaser = page.getByText("Ce qu'on nous demande avant de lancer").first()
  if (await teaser.count() === 0) bad(`${tag}: section FAQ absente de la landing`)
  else {
    await teaser.scrollIntoViewIfNeeded()
    await sleep(700)
    await page.screenshot({ path: `${SHOTS}/${tag}-1-landing-faq.png` })
    okk(`${tag}: section FAQ visible sur la landing`)
  }

  // 2. L'en-tete mene a la FAQ
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(400)
  const headerFaq = page.locator("header a", { hasText: /^FAQ$/ }).first()
  if (await headerFaq.count() === 0) bad(`${tag}: lien FAQ absent de l'en-tete`)
  else {
    // Navigation client Next : attendre l'URL, pas networkidle (deja idle avant le clic).
    await headerFaq.click()
    const arrived = await page.waitForURL(/\/faq\/?$/, { timeout: 15000 }).then(() => true).catch(() => false)
    if (!arrived) bad(`${tag}: l'en-tete ne mene pas a /faq/ (${page.url()})`)
    else okk(`${tag}: l'en-tete mene a /faq/`)
  }

  // 3. La page FAQ
  await page.goto(`${B}/faq/`, { waitUntil: "networkidle", timeout: 120000 })
  await sleep(900)
  await page.screenshot({ path: `${SHOTS}/${tag}-2-page-haut.png` })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
  await sleep(700)
  await page.screenshot({ path: `${SHOTS}/${tag}-3-page-questions.png` })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await sleep(700)
  await page.screenshot({ path: `${SHOTS}/${tag}-4-page-bas.png` })

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  overflow ? bad(`${tag}: /faq/ deborde horizontalement`) : okk(`${tag}: /faq/ ne deborde pas`)

  const nQ = await page.locator("dt").count()
  nQ >= 10 ? okk(`${tag}: ${nQ} questions sur /faq/`) : bad(`${tag}: seulement ${nQ} questions sur /faq/`)

  const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
  ld.some(t => t.includes("FAQPage")) ? okk(`${tag}: JSON-LD FAQPage present`) : bad(`${tag}: JSON-LD FAQPage absent`)

  await ctx.close()
}

// Le FAQPage ne doit exister QUE sur /faq/ (pas de doublon sur la landing).
const ctx = await mk({ viewport: { width: 1280, height: 800 } })
const p = await ctx.newPage()
await p.goto(`${B}/`, { waitUntil: "networkidle", timeout: 120000 })
const homeLd = await p.locator('script[type="application/ld+json"]').allTextContents()
homeLd.some(t => t.includes("FAQPage"))
  ? bad("la landing porte aussi un FAQPage : source dupliquee")
  : okk("pas de FAQPage duplique sur la landing")
await ctx.close()

await b.close()
console.log(problems.length ? `\n${problems.length} probleme(s)` : "\nTout est vert")
process.exit(problems.length ? 1 : 0)
