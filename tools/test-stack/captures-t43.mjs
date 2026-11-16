// Captures des points facon Kahoot (T43) sur la pile de test : une partie
// « À distance » au telephone (375x667), clair et sombre. Max repond juste et
// vite, avec le bon « qui a ajoute » quand il le sait, pour montrer le detail
// des points, la serie et l'ecart avec le joueur devant.
//
//   campagne-ref.sh <branche> --script /chemin/captures-t43.mjs /dossier/des/captures
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { oracle, seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/captures-t43"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const say = m => console.log(m)
const PHONE = { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const ROUNDS = 4
const SECONDS = 15

async function until(test, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await test()) return true
    await sleep(200)
  }
  throw new Error(what)
}

const setTheme = (page, theme) => page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme).catch(() => {})

async function snap(page, name) {
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme)
    await sleep(150)
    await page.screenshot({ path: path.join(OUT, `${name}-${theme === "light" ? "clair" : "sombre"}.png`), fullPage: true }).catch(e => problems.push(`${name} : ${e.message}`))
  }
  await setTheme(page, "light")
  say(`  capture ${name}`)
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const contexts = []
const bots = []
try {
  const max = await newPage(browser, PHONE, "Max", problems)
  contexts.push(max.ctx)
  const sp = max.page
  await sp.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await sp.locator("input").first().fill("Max")
  await sp.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !sp.__uid; i++) await sleep(250)
  if (!sp.__uid) throw new Error("Max : aucune identite")
  seedUser(sp.__uid, Array.from({ length: 24 }, (_, i) => 100 + i))
  await sp.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  await sp.getByText("Créer une partie").click()
  await sp.waitForURL(/\/modes/, { timeout: 30000 })
  await sp.getByText("À distance").first().click()
  await sp.getByTestId("lobby-inviter").waitFor({ timeout: 30000 })
  const code = await sp.locator("[data-code]").first().getAttribute("data-code")
  await sp.getByRole("button", { name: String(ROUNDS), exact: true }).click()
  await sp.getByRole("button", { name: `${SECONDS}s`, exact: true }).click()

  // Tom trouve tout, Ines a moitie : le classement bouge et Max a quelqu'un devant ou derriere.
  const plans = [() => ({ action: "juste" }), r => ({ action: r % 2 ? "proche" : "juste" })]
  for (const [i, name] of ["Tom", "Ines"].entries()) {
    const b = new Bot({ name, plan: plans[i], random: rng(900 + i) })
    await b.enter()
    seedUser(b.id, Array.from({ length: 24 }, (_, k) => 200 + i * 50 + k))
    const j = await b.join(code)
    if (!j.ok) throw new Error(`${name} ne peut pas entrer`)
    b.others = [sp.__uid]
    bots.push(b)
  }
  await sleep(2500)
  await sp.getByRole("button", { name: /lancer la partie/i }).click()

  const lead = bots[0]
  for (let r = 1; r <= ROUNDS; r++) {
    await until(() => lead.rounds.has(r), 60000, `manche ${r} absente`)
    const truth = oracle(code, r)
    const title = sp.getByPlaceholder(/morceau qui tourne/i)
    await title.waitFor({ timeout: 10000 }).catch(() => {})
    await sleep(1200 + r * 400)
    if (truth && r !== 3) {
      await title.fill(truth.title, { timeout: 3000 }).catch(() => {})
      await sp.getByPlaceholder(/qui chante/i).fill(truth.artist, { timeout: 3000 }).catch(() => {})
      const owner = bots.find(b => b.id === truth.ownerId)
      if (owner) await sp.getByRole("button", { name: owner.name, exact: true }).first().click({ timeout: 2000 }).catch(() => {})
    } else {
      // Manche 3 : le titre seul, la moitie des points.
      await title.fill(truth?.title ?? "jsp", { timeout: 3000 }).catch(() => {})
    }
    await sp.getByRole("button", { name: /valider/i }).first().click({ timeout: 3000 }).catch(() => {})
    await until(() => lead.reveals.has(r), (SECONDS + 10) * 1000, `manche ${r} jamais revelee`)
    await sleep(3600) // les reponses arrivent une par une
    await snap(sp, `distance-reponse-m${r}`)
    if (r === ROUNDS) break
    await until(() => sp.locator('[data-step="scores"]').count().then(n => n > 0), 12000, `pas de classement apres la manche ${r}`)
    await sleep(1600)
    await snap(sp, `distance-classement-m${r}`)
  }
  await until(() => sp.getByTestId("podium").first().isVisible().catch(() => false), 20000, "pas de podium")
  await sleep(7200)
  await snap(sp, "distance-podium")
  if (!(await sp.getByTestId("ecran-fin").count())) problems.push("pas d'ecran de fin")
} catch (e) {
  problems.push(`arret : ${e.message.split("\n").slice(0, 3).join(" | ")}`)
  for (const [i, c] of contexts.entries()) for (const pg of c.pages()) await pg.screenshot({ path: path.join(OUT, `erreur-${i}.png`) }).catch(() => {})
} finally {
  for (const b of bots) b.close()
  for (const c of contexts) await c.close().catch(() => {})
  await browser.close()
}
say(problems.length ? `ECHEC :\n - ${problems.join("\n - ")}` : `OK : captures dans ${OUT}`)
process.exit(problems.length ? 1 : 0)
