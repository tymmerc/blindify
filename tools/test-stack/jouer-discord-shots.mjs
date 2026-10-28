// « Jouer sur Discord » (T16) sur la pile de test : le bouton et la ligne
// discrete sont la ou il faut, menent au lien d'installation dans un nouvel
// onglet, ne debordent pas sur telephone, et restent absents de l'Activite et
// d'un QR scanne. Captures en 360 px (Chromium), iPhone 13 (WebKit) et bureau.
//
//   campagne-ref.sh <ref> --script /abs/tools/test-stack/jouer-discord-shots.mjs <dossier>
import { chromium, webkit, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const APP = "http://blindz-test.localhost:3180/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const OUT = process.argv[2] || "/tmp/jouer-discord-shots"
const INSTALL = "https://discord.com/oauth2/authorize?client_id=1559906854111420416"
fs.mkdirSync(OUT, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const check = (cond, msg) => { if (cond) say("  [ok] " + msg); else { problems.push(msg); say("  !! " + msg) } }

const VIEWS = [
  { tag: "360", engine: chromium, opts: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { tag: "iphone", engine: webkit, opts: { ...devices["iPhone 13"] } },
  { tag: "1440", engine: chromium, opts: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
]

async function open(browser, view, route) {
  const ctx = await browser.newContext(view.opts)
  await ctx.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
  const page = await ctx.newPage()
  page.on("pageerror", e => problems.push(`${view.tag} ${route} : erreur JS ${String(e).slice(0, 160)}`))
  await page.goto(`${APP}${route}`, { waitUntil: "networkidle", timeout: 120000 })
  await sleep(1200)
  return { ctx, page }
}

async function noOverflow(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  check(sw <= iw + 1, `${label} : pas de defilement horizontal (${sw} <= ${iw})`)
}

async function checkLink(loc, label) {
  check(await loc.isVisible(), `${label} : visible`)
  check((await loc.getAttribute("href")) === INSTALL, `${label} : mene au lien d'installation`)
  check((await loc.getAttribute("target")) === "_blank", `${label} : nouvel onglet`)
}

async function shotAt(page, loc, file) {
  await loc.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -80))
  await sleep(600)
  await page.screenshot({ path: path.join(OUT, file) })
}

/** Pseudo saisi sur /jouer/ : la session invite existe ensuite (cookie). */
async function guest(page, name) {
  await page.locator("input").first().fill(name)
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => fetch("/blindify/api/auth/me", { credentials: "include" }).then(r => r.ok)).catch(() => false)
    if (ok) return
    await sleep(250)
  }
  throw new Error(`${name} : aucune session`)
}

async function runView(view) {
  say(`\n== ${view.tag}`)
  const browser = await view.engine.launch()
  try {
    // 1. Accueil : le bouton dans le mode « A distance »
    {
      const { ctx, page } = await open(browser, view, "/")
      const play = page.getByTestId("discord-play")
      check((await play.count()) === 1, "accueil : un seul bloc Discord")
      check((await page.locator('[data-mode="distance"] [data-testid="discord-play"]').count()) === 1, "accueil : dans le mode A distance")
      await checkLink(play.getByRole("link", { name: /jouer sur discord/i }), "accueil : bouton")
      await shotAt(page, play, `${view.tag}-1-accueil.png`)
      await noOverflow(page, "accueil")
      await ctx.close()
    }
    // 2. /jouer/ : la ligne discrete sous Continuer, depliee pour la capture
    {
      const { ctx, page } = await open(browser, view, "/jouer/")
      const hint = page.getByTestId("discord-hint")
      await checkLink(hint.getByRole("link"), "jouer : ligne")
      check(await page.getByRole("button", { name: /continuer/i }).isVisible(), "jouer : Continuer toujours la")
      await page.screenshot({ path: path.join(OUT, `${view.tag}-2-jouer.png`) })
      await hint.getByText("Comment ça marche ?").click()
      await sleep(400)
      check(await hint.getByText(/clique sur la fusée/i).isVisible(), "jouer : les 3 etapes se deplient")
      await page.screenshot({ path: path.join(OUT, `${view.tag}-2b-jouer-deplie.png`) })
      await noOverflow(page, "jouer")
      await ctx.close()
    }
    // 3. QR scanne : rien, ce joueur rejoint une partie deja lancee
    {
      const { ctx, page } = await open(browser, view, "/jouer/?join=ABC123")
      check((await page.getByTestId("discord-hint").count()) === 0, "jouer ?join= : pas de ligne Discord")
      await ctx.close()
    }
    // 4. Guide a distance
    {
      const { ctx, page } = await open(browser, view, "/blind-test-en-ligne-gratuit/")
      const play = page.getByTestId("discord-play")
      await checkLink(play.getByRole("link", { name: /jouer sur discord/i }), "guide en ligne : bouton")
      await shotAt(page, play, `${view.tag}-3-guide.png`)
      await noOverflow(page, "guide en ligne")
      await ctx.close()
    }
    // 5. FAQ
    {
      const { ctx, page } = await open(browser, view, "/faq/")
      const q = page.getByText("Peut-on jouer dans Discord ?")
      check(await q.isVisible(), "faq : la question est la")
      await q.click()
      await sleep(500)
      await shotAt(page, q, `${view.tag}-4-faq.png`)
      await ctx.close()
    }
    // 6. A distance, ecran d'entree puis lobby de l'hote
    {
      const { ctx, page } = await open(browser, view, "/jouer/")
      await guest(page, `Hote${view.tag}`)
      await page.goto(`${APP}/multiplayer/?mode=friends`, { waitUntil: "networkidle", timeout: 60000 })
      await sleep(1500)
      const hint = page.getByTestId("discord-hint")
      await checkLink(hint.getByRole("link"), "a distance, entree : ligne")
      check(await page.getByRole("button", { name: /créer une partie/i }).isEnabled(), "a distance, entree : Creer reste actif")
      await page.screenshot({ path: path.join(OUT, `${view.tag}-5-distance-entree.png`) })
      await noOverflow(page, "a distance, entree")

      await page.getByRole("button", { name: /créer une partie/i }).click()
      await page.locator("[data-code]").first().waitFor({ timeout: 30000 })
      await sleep(2000)
      const lobbyHint = page.getByTestId("lobby-salle").getByTestId("discord-hint")
      await checkLink(lobbyHint.getByRole("link"), "lobby hote : ligne")
      check(await page.locator("[data-code]").first().isVisible(), "lobby hote : le code est toujours la")
      await page.screenshot({ path: path.join(OUT, `${view.tag}-6-lobby-hote.png`) })
      await noOverflow(page, "lobby hote")
      await ctx.close()
    }
    // 7. L'Activite elle-meme : rien
    {
      const { ctx, page } = await open(browser, view, "/discord/")
      const n = await page.locator('[data-testid="discord-hint"], [data-testid="discord-play"]').count()
      check(n === 0, "activite /discord/ : aucun renvoi vers Discord")
      await ctx.close()
    }
  } catch (e) {
    problems.push(`${view.tag} : ${String(e).slice(0, 300)}`)
    say("  !! " + String(e).slice(0, 300))
  } finally {
    await browser.close()
  }
}

for (const view of VIEWS) await runView(view)

say(`\ncaptures : ${OUT}`)
say(problems.length ? `ROUGE, ${problems.length} probleme(s) :\n- ${problems.join("\n- ")}` : "VERT")
process.exit(problems.length ? 1 : 0)
