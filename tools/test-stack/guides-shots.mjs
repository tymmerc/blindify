// Pages par occasion (guides) sur la pile isolee : captures 390x844 et
// 1440x900, et verifications de ce que lisent les moteurs (titre, un seul H1,
// description, canonique, JSON-LD, liens internes, sitemap, pied de page de
// l'accueil). Lance par :
//   campagne-ref.sh <branche> --script <ce fichier> [dossier des captures]
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"

const APP = "http://blindz-test.localhost:3180/blindify"
const OUT = process.argv[2] || "/opt/mira/dossier/preuves/2026-10-05-blindz-usages"
const PAGES = [
  { slug: "blind-test-anniversaire", h1: /anniversaire/i },
  { slug: "blind-test-evjf-evg", h1: /EVJF/ },
  { slug: "blind-test-tv", h1: /télé/ },
  { slug: "blind-test-entre-collegues", h1: /collègues/ },
  { slug: "blind-test-soiree", h1: /apéro/ },
]
const VIEWS = [
  ["390", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
  ["1440", { viewport: { width: 1440, height: 900 } }],
]
const EM_DASH = String.fromCharCode(0x2014)
fs.mkdirSync(OUT, { recursive: true })

const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }
const ok = m => console.log("  [ok] " + m)
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function checkSeo(page, slug, h1) {
  const info = await page.evaluate(() => ({
    title: document.title,
    h1s: [...document.querySelectorAll("h1")].map(h => h.textContent.trim()),
    desc: document.querySelector('meta[name="description"]')?.content ?? "",
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? "",
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
    links: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")),
    text: document.body.innerText,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }))
  info.h1s.length === 1 && h1.test(info.h1s[0]) ? ok(`${slug}: un seul H1 « ${info.h1s[0]} »`) : bad(`${slug}: H1 ${JSON.stringify(info.h1s)}`)
  info.title.endsWith("· blindz.app") && info.title.length <= 60
    ? ok(`${slug}: titre « ${info.title} » (${info.title.length} car.)`)
    : bad(`${slug}: titre ${info.title} (${info.title.length} car.)`)
  info.desc.length > 80 && info.desc.length <= 160
    ? ok(`${slug}: description (${info.desc.length} car.)`)
    : bad(`${slug}: description de ${info.desc.length} car.`)
  info.canonical === `https://blindz.app/${slug}/` ? ok(`${slug}: canonique`) : bad(`${slug}: canonique ${info.canonical}`)
  const types = info.ld.map(t => { try { return JSON.parse(t)["@type"] } catch { return "INVALIDE" } })
  types.includes("WebPage") && types.includes("FAQPage") ? ok(`${slug}: JSON-LD ${types.join(" + ")}`) : bad(`${slug}: JSON-LD ${types}`)
  info.links.some(h => /\/jouer\/?$/.test(h)) ? ok(`${slug}: lien vers /jouer/`) : bad(`${slug}: pas de lien vers /jouer/`)
  const others = PAGES.filter(p => p.slug !== slug && !info.links.some(h => h.includes(`/${p.slug}/`)))
  others.length === 0 ? ok(`${slug}: liens vers les autres pages d'occasion`) : bad(`${slug}: pas de lien vers ${others.map(p => p.slug)}`)
  info.text.includes(EM_DASH) ? bad(`${slug}: tiret cadratin dans le texte`) : ok(`${slug}: pas de tiret cadratin`)
  return info.overflow
}

const browser = await chromium.launch()
try {
  // Le HTML exporte, tel que le lit un robot (sans JS) : FAQ repliee mais presente.
  for (const { slug } of PAGES) {
    const html = await (await fetch(`${APP}/${slug}/`)).text()
    html.includes("<details") && html.includes('"FAQPage"') ? ok(`${slug}: FAQ et JSON-LD dans le HTML brut`) : bad(`${slug}: HTML brut incomplet`)
  }
  const sitemap = await (await fetch(`${APP}/sitemap.xml`)).text()
  const missing = PAGES.filter(p => !sitemap.includes(`https://blindz.app/${p.slug}/`))
  missing.length === 0 ? ok("sitemap.xml : les 5 pages y sont") : bad(`sitemap.xml : manque ${missing.map(p => p.slug)}`)
  // React ecrit l'apostrophe &#x27; dans le HTML : on la remet pour comparer.
  const home = (await (await fetch(`${APP}/`)).text()).replaceAll("&#x27;", "'")
  home.includes("Blind test d'anniversaire")
    ? ok("accueil : le pied de page liste les nouvelles pages")
    : bad("accueil : nouvelles pages absentes du pied de page")
  // Texte attendu de go-prod-front.sh (grep -F sur le HTML brut de l'accueil).
  home.includes("Blind test EVJF et EVG") ? ok("accueil : texte attendu « Blind test EVJF et EVG » present") : bad("accueil : texte attendu absent")
  home.includes("12 places, écran compris") ? ok("accueil : mode Autour d'une table, « 12 places, écran compris »") : bad("accueil : libelle des 12 places absent")

  for (const [tag, opts] of VIEWS) {
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    for (const { slug, h1 } of PAGES) {
      const res = await page.goto(`${APP}/${slug}/`, { waitUntil: "networkidle", timeout: 60000 })
      res?.status() === 200 ? ok(`${tag} ${slug}: 200`) : bad(`${tag} ${slug}: HTTP ${res?.status()}`)
      await sleep(600)
      const overflow = await checkSeo(page, slug, h1)
      overflow ? bad(`${tag} ${slug}: debordement horizontal`) : ok(`${tag} ${slug}: pas de debordement horizontal`)
      await page.screenshot({ path: `${OUT}/${slug}-${tag}-haut.png` })
      await page.screenshot({ path: `${OUT}/${slug}-${tag}-entiere.png`, fullPage: true })
    }
    // Guides plus anciens qui partagent le gabarit des etapes (Steps) : capture seule.
    for (const slug of ["blind-test-spotify", "blind-test-deezer"]) {
      await page.goto(`${APP}/${slug}/`, { waitUntil: "networkidle", timeout: 60000 })
      await sleep(600)
      await page.screenshot({ path: `${OUT}/${slug}-${tag}-entiere.png`, fullPage: true })
    }
    // Le CTA mene bien au jeu (navigation client Next).
    await page.goto(`${APP}/blind-test-tv/`, { waitUntil: "networkidle" })
    await page.getByRole("link", { name: "Jouer, c'est gratuit" }).click()
    const arrived = await page.waitForURL(/\/jouer\/?$/, { timeout: 15000 }).then(() => true).catch(() => false)
    arrived ? ok(`${tag}: le bouton Jouer mene a /jouer/`) : bad(`${tag}: le bouton Jouer ne mene pas a /jouer/ (${page.url()})`)
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(problems.length ? `\nKO : ${problems.length} probleme(s)` : "\nTOUT EST VERT")
process.exit(problems.length ? 1 : 0)
