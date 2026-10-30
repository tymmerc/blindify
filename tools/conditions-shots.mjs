// Captures de T17ac (29/10/2026) : la page /conditions/, la question « Un bug,
// une idee ? » de la FAQ, le lien « Le serveur Blindz » sous le bouton Discord
// de la landing et le pied de page, en bureau et en mobile. Verifie aussi
// qu'aucune page ne deborde horizontalement et que les liens sont les bons.
//
//   node tools/conditions-shots.mjs [base]   (via heavy : navigateur)
// base par defaut : un export local servi sur 127.0.0.1:4317.
import { chromium, devices } from "@playwright/test"
import fs from "fs"

const B = (process.argv[2] || "http://127.0.0.1:4317").replace(/\/$/, "")
const SHOTS = process.env.SHOTS || "/opt/blindify/maquettes/shots/conditions"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }
const okk = m => console.log("  [ok] " + m)

async function noOverflow(page, tag, what) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  over ? bad(`${tag}: ${what} deborde horizontalement`) : okk(`${tag}: ${what} ne deborde pas`)
}

const b = await chromium.launch()
try {
  for (const [tag, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["mobile", devices["iPhone 13"]]]) {
    const ctx = await b.newContext(opts)
    const page = await ctx.newPage()

    // 1. La page /conditions/
    await page.goto(`${B}/conditions/`, { waitUntil: "networkidle", timeout: 60000 })
    await sleep(600)
    await page.screenshot({ path: `${SHOTS}/${tag}-1-conditions-haut.png` })
    await page.screenshot({ path: `${SHOTS}/${tag}-2-conditions-entiere.png`, fullPage: true })
    await noOverflow(page, tag, "/conditions/")
    const mail = await page.locator("a[href='mailto:contact@blindz.app']").count()
    mail > 0 ? okk(`${tag}: contact@blindz.app sur /conditions/`) : bad(`${tag}: pas de contact@blindz.app sur /conditions/`)
    const srv = await page.locator("a[href='https://discord.gg/8pyAtVDFzU']").count()
    srv > 0 ? okk(`${tag}: serveur Discord sur /conditions/`) : bad(`${tag}: pas de serveur Discord sur /conditions/`)

    // 2. La FAQ, question « Un bug, une idee ? » ouverte
    await page.goto(`${B}/faq/`, { waitUntil: "networkidle", timeout: 60000 })
    const q = page.locator("summary", { hasText: /Un bug, une idée/ })
    if (await q.count() === 0) bad(`${tag}: question « Un bug, une idee ? » absente`)
    else {
      await q.click()
      await sleep(500)
      await q.locator("xpath=..").screenshot({ path: `${SHOTS}/${tag}-3-faq-bug-idee.png` })
      okk(`${tag}: question FAQ ouverte`)
    }
    await noOverflow(page, tag, "/faq/")

    // 3. La landing : le lien sous le bouton « Jouer sur Discord »
    await page.goto(`${B}/`, { waitUntil: "networkidle", timeout: 60000 })
    const support = page.getByTestId("discord-support").first()
    if (await support.count() === 0) bad(`${tag}: lien « Le serveur Blindz » absent de la landing`)
    else {
      await page.getByTestId("discord-play").first().scrollIntoViewIfNeeded()
      await sleep(900)
      await page.getByTestId("discord-play").first().screenshot({ path: `${SHOTS}/${tag}-4-landing-discord.png` })
      okk(`${tag}: lien du serveur sous le bouton Discord`)
    }
    // 4. Le pied de page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(900)
    await page.screenshot({ path: `${SHOTS}/${tag}-5-pied-de-page.png` })
    const foot = await page.locator("footer a[href^='/conditions']").count()
    foot > 0 ? okk(`${tag}: Conditions dans le pied de page`) : bad(`${tag}: Conditions absent du pied de page`)
    await noOverflow(page, tag, "/")

    // 5. Mentions legales : bloc editeur avec la nouvelle adresse
    await page.goto(`${B}/mentions-legales/`, { waitUntil: "networkidle", timeout: 60000 })
    await sleep(500)
    await page.screenshot({ path: `${SHOTS}/${tag}-6-mentions.png` })
    const html = await page.content()
    ;/gmail/i.test(html) ? bad(`${tag}: Gmail encore present dans /mentions-legales/`) : okk(`${tag}: pas de Gmail dans /mentions-legales/`)
    await ctx.close()
  }
} finally {
  await b.close()
}

console.log(problems.length ? `\n${problems.length} probleme(s)` : "\nTout est bon")
process.exit(problems.length ? 1 : 0)
