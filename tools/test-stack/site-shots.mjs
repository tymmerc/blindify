// Captures et verifications des pages publiques (landing, FAQ, comparatif) sur
// la pile de test, en 390x844 et 1440x900. Sert d'avant/apres pour la mention
// beta et l'ajout de Blinest au comparatif.
//
//   campagne-ref.sh <ref> --script /abs/tools/test-stack/site-shots.mjs <avant|apres> <dossier>
//
// En "avant" on se contente des captures (main n'a ni la mention ni Blinest) ;
// en "apres" les verifications de contenu comptent et le code de sortie suit.
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const APP = "http://blindz-test.localhost:3180/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const MODE = process.argv[2] === "apres" ? "apres" : "avant"
const OUT = process.argv[3] || `/tmp/site-shots-${MODE}`
fs.mkdirSync(OUT, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { problems.push(m); say("  !! " + m) }
const ok = m => say("  [ok] " + m)
// En "avant", une verification de contenu ratee est attendue : on la note sans echouer.
const expect = (cond, msg) => (cond ? ok(msg) : MODE === "apres" ? bad(msg) : say("  (avant) absent : " + msg))

const VIEWS = [
  { tag: "390", opts: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { tag: "1440", opts: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
]

const browser = await chromium.launch()

async function open(view, route) {
  const ctx = await browser.newContext(view.opts)
  await ctx.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
  const page = await ctx.newPage()
  page.on("pageerror", e => bad(`${view.tag} ${route} : erreur JS ${String(e).slice(0, 160)}`))
  await page.goto(`${APP}${route}`, { waitUntil: "networkidle", timeout: 120000 })
  await sleep(1500)
  return page
}

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  say(`  capture ${name}.png`)
}

async function commonChecks(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  if (overflow) bad(`${label} : la page deborde horizontalement`)
  else ok(`${label} : pas de debordement horizontal`)
  const dash = await page.evaluate(() => document.body.innerText.includes("\u2014"))
  if (dash) bad(`${label} : tiret cadratin dans le texte`)
}

async function landing(view) {
  say(`-- landing ${view.tag}`)
  const page = await open(view, "/")
  await shot(page, `landing-${view.tag}-haut`)
  await commonChecks(page, `landing ${view.tag}`)

  // En-tete : la mention ne doit pas pousser la nav ni la chevaucher
  const head = await page.evaluate(() => {
    const h = document.querySelector("header")
    const brand = h?.querySelector("a")
    const nav = h?.querySelector("nav")
    const b = brand?.getBoundingClientRect()
    const n = nav?.getBoundingClientRect()
    return { text: brand?.textContent || "", brandRight: b?.right, navLeft: n?.left, navRight: n?.right, height: h?.getBoundingClientRect().height, vw: window.innerWidth }
  })
  say(`  en-tete : marque "${head.text}" fin ${Math.round(head.brandRight)} px, nav ${Math.round(head.navLeft)} a ${Math.round(head.navRight)} px, hauteur ${Math.round(head.height)} px, ecran ${head.vw}`)
  if (head.brandRight > head.navLeft) bad(`landing ${view.tag} : la marque chevauche la nav`)
  if (head.navRight > head.vw) bad(`landing ${view.tag} : la nav sort de l'ecran`)
  expect(/bêta/.test(head.text), `landing ${view.tag} : "bêta" a cote du nom`)

  await page.evaluate(() => document.querySelector("footer")?.scrollIntoView({ block: "end" }))
  await sleep(900)
  await shot(page, `landing-${view.tag}-pied`)
  const footer = await page.evaluate(() => document.querySelector("footer")?.innerText || "")
  expect(/en bêta/.test(footer), `landing ${view.tag} : phrase beta dans le pied de page`)

  // Le lien du pied ouvre le formulaire de signalement existant (sans l'envoyer)
  const btn = page.getByRole("button", { name: /signale-le/i })
  if (await btn.count()) {
    await btn.first().click()
    await sleep(600)
    const dialog = await page.getByRole("heading", { name: "Signaler un bug" }).isVisible().catch(() => false)
    expect(dialog, `landing ${view.tag} : le lien ouvre "Signaler un bug"`)
    await shot(page, `landing-${view.tag}-signaler`)
    await page.getByRole("button", { name: "Fermer" }).click().catch(() => {})
  } else {
    expect(false, `landing ${view.tag} : bouton "signale-le" dans le pied`)
  }
  await page.context().close()
}

async function faq(view) {
  say(`-- faq ${view.tag}`)
  const page = await open(view, "/faq/")
  await commonChecks(page, `faq ${view.tag}`)
  const ld = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join("\n"))
  expect(/bêta/.test(ld), `faq ${view.tag} : la question beta est dans le JSON-LD FAQPage`)
  const q = page.locator("summary", { hasText: "bêta" })
  if (await q.count()) {
    await q.first().scrollIntoViewIfNeeded()
    await q.first().click()
    await sleep(500)
    await q.first().evaluate(el => el.closest("details")?.scrollIntoView({ block: "center" }))
    await sleep(400)
    await shot(page, `faq-${view.tag}-beta`)
  }
  await page.context().close()
}

async function comparatif(view) {
  say(`-- comparatif ${view.tag}`)
  const page = await open(view, "/comparatif-blind-test/")
  await shot(page, `comparatif-${view.tag}-haut`)
  await commonChecks(page, `comparatif ${view.tag}`)

  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("table tbody tr")].map(tr => tr.querySelector("td")?.textContent?.trim())
    const ext = [...document.querySelectorAll("a[href^='http']")].map(a => ({ href: a.href, rel: a.rel }))
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join("\n")
    const h3 = [...document.querySelectorAll("h3")].map(h => h.textContent)
    return { rows, ext, ld, h3 }
  })
  say(`  lignes du tableau : ${info.rows.join(", ")}`)
  expect(info.rows.includes("Blinest"), `comparatif ${view.tag} : ligne Blinest dans le tableau`)
  expect(info.h3.includes("Blinest"), `comparatif ${view.tag} : fiche Blinest`)
  expect(/Blinest/.test(info.ld), `comparatif ${view.tag} : Blinest dans le JSON-LD`)
  const external = info.ext.filter(l => !l.href.startsWith(APP))
  const unsafe = external.filter(l => !/\bnoopener\b/.test(l.rel) || !/\bnofollow\b/.test(l.rel))
  if (unsafe.length) bad(`comparatif ${view.tag} : liens externes sans noopener nofollow : ${unsafe.map(l => l.href).join(" ")}`)
  else ok(`comparatif ${view.tag} : ${external.length} liens externes, tous en noopener nofollow`)
  const blinestSources = external.filter(l => /blinest\.com|github\.com\/mchev/.test(l.href)).length
  expect(blinestSources > 0, `comparatif ${view.tag} : ${blinestSources} source(s) Blinest liee(s)`)

  await page.evaluate(() => document.querySelector("table")?.scrollIntoView({ block: "start" }))
  await page.evaluate(() => window.scrollBy(0, -90))
  await sleep(700)
  await shot(page, `comparatif-${view.tag}-tableau`)

  // Sur mobile, le tableau defile dans son cadre : la colonne Service doit rester lisible
  if (view.tag === "390") {
    const sticky = await page.evaluate(() => {
      const box = document.querySelector("table")?.parentElement
      if (!box) return null
      box.scrollLeft = 330
      const cell = document.querySelector("table tbody td")
      const r = cell?.getBoundingClientRect()
      return { scrolled: box.scrollLeft, cellLeft: r?.left, cellRight: r?.right }
    })
    await sleep(400)
    say(`  tableau defile de ${sticky?.scrolled} px, 1re colonne de ${Math.round(sticky?.cellLeft)} a ${Math.round(sticky?.cellRight)} px`)
    expect(sticky && sticky.cellRight > 40, `comparatif 390 : la colonne Service reste visible quand le tableau defile`)
    await shot(page, `comparatif-390-tableau-defile`)
  }

  const fiche = page.locator("h3", { hasText: /^Blinest$/ })
  if (await fiche.count()) {
    await fiche.first().evaluate(el => el.scrollIntoView({ block: "start" }))
    await page.evaluate(() => window.scrollBy(0, -40))
    await sleep(500)
    await shot(page, `comparatif-${view.tag}-fiche-blinest`)
  }
  await page.context().close()
}

try {
  for (const view of VIEWS) {
    await landing(view)
    await faq(view)
    await comparatif(view)
  }
} catch (e) {
  bad(`exception : ${e?.stack || e}`)
} finally {
  await browser.close()
}

say(`\n${MODE} : ${problems.length ? problems.length + " probleme(s)" : "tout est vert"} ; captures dans ${OUT}`)
for (const p of problems) say(" - " + p)
process.exit(problems.length ? 1 : 0)
