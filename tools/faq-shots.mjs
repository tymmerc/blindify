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

  const nQ = await page.locator("details summary").count()
  nQ >= 10 ? okk(`${tag}: ${nQ} questions sur /faq/`) : bad(`${tag}: seulement ${nQ} questions sur /faq/`)

  // L'accordeon est natif : une reponse repliee doit rester dans le DOM (c'est
  // ce que lisent les moteurs et les IA), et le clic doit l'ouvrir.
  const open0 = await page.locator("details").first().evaluate(d => d.open)
  open0 ? okk(`${tag}: premiere question ouverte au chargement`) : bad(`${tag}: premiere question fermee au chargement`)

  const closed = page.locator("details").nth(1)
  if (await closed.evaluate(d => d.open)) bad(`${tag}: la deuxieme question est deja ouverte`)
  const hiddenText = (await closed.locator("p").innerText({ timeout: 5000 }).catch(() => "")) ||
    (await closed.locator("p").evaluate(el => el.textContent).catch(() => ""))
  hiddenText.length > 40
    ? okk(`${tag}: reponse repliee presente dans le DOM (${hiddenText.length} car.)`)
    : bad(`${tag}: reponse repliee absente du DOM`)

  await closed.locator("summary").click()
  await sleep(400)
  await closed.evaluate(d => d.open)
    ? okk(`${tag}: le clic ouvre la question`)
    : bad(`${tag}: le clic n'ouvre pas la question`)

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

// Le test decisif : le HTML BRUT servi par le serveur, sans navigateur, doit
// deja contenir les reponses repliees. Sinon l'accordeon couterait le SEO.
for (const [path, phrase] of [["/", "liens courts du bouton Partager"], ["/faq/", "incendie du datacenter OVH"]]) {
  const html = await fetch(`${B}${path}`, { headers: { "X-E2E-Key": KEY } }).then(r => r.text())
  html.includes(phrase)
    ? okk(`HTML brut de ${path} : reponse repliee presente`)
    : bad(`HTML brut de ${path} : reponse repliee ABSENTE ("${phrase}")`)
}

// Les guides reutilisent le meme accordeon (Guide.tsx -> FaqAccordion) : on
// verifie qu'il s'affiche aussi dans le gabarit guide, sur fond papier.
const gctx = await mk({ viewport: { width: 1280, height: 900 } })
const gp = await gctx.newPage()
await gp.goto(`${B}/blind-test-soiree/`, { waitUntil: "networkidle", timeout: 120000 })
const gq = gp.locator("details summary")
const nG = await gq.count()
if (nG < 4) bad(`guide soiree : ${nG} questions repliees (attendu 4)`)
else {
  okk(`guide soiree : ${nG} questions repliees`)
  await gq.first().scrollIntoViewIfNeeded()
  await sleep(600)
  await gp.screenshot({ path: `${SHOTS}/guide-faq.png` })
}
await gctx.close()

await b.close()
console.log(problems.length ? `\n${problems.length} probleme(s)` : "\nTout est vert")
process.exit(problems.length ? 1 : 0)
