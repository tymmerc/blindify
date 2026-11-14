// Captures du rythme entre les manches (T38) sur la pile de test : ecran
// central (presentateur, 1440x900) et telephone (375x667), clair et sombre.
// Partie 1 « Autour d'une table » : ecran central + Zoe au telephone + 2 bots.
// Partie 2 « À distance » : Zoe hote au telephone + 2 bots.
//
//   campagne-ref.sh <branche> --script /chemin/captures-t38.mjs /dossier/des/captures
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/captures-t38"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const say = m => console.log(m)
const PHONE = { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const ROUNDS = 3
const SECONDS = 10

async function until(test, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await test()) return true
    await sleep(200)
  }
  throw new Error(what)
}

const setTheme = (page, theme) => page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme).catch(() => {})

/** Une capture claire et une sombre de chaque page. */
async function snap(pages, name) {
  for (const theme of ["light", "dark"]) {
    for (const [tag, page] of pages) await setTheme(page, theme)
    await sleep(150)
    for (const [tag, page] of pages) {
      await page.screenshot({ path: path.join(OUT, `${name}-${tag}-${theme === "light" ? "clair" : "sombre"}.png`) }).catch(e => problems.push(`${name} ${tag} : ${e.message}`))
    }
  }
  for (const [, page] of pages) await setTheme(page, "light")
  say(`  capture ${name}`)
}

async function guest(browser, name, opts) {
  const g = await newPage(browser, opts, name, problems)
  await g.page.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await g.page.locator("input").first().fill(name)
  await g.page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !g.page.__uid; i++) await sleep(250)
  if (!g.page.__uid) throw new Error(`${name} : aucune identite`)
  return g
}

/** Suit une partie et prend les ecrans entre les manches. */
async function shootGame(pages, bots, label, typer) {
  const lead = bots[0]
  await until(() => lead.rounds.has(1), 30000, `${label} : la manche 1 ne part pas`)
  for (let r = 1; r <= ROUNDS; r++) {
    await until(() => lead.rounds.has(r), 60000, `${label} : manche ${r} absente`)
    if (typer) await typer(r)
    await until(() => lead.reveals.has(r), (SECONDS + 10) * 1000, `${label} : manche ${r} jamais revelee`)
    await sleep(3200) // les reponses arrivent une par une
    await snap(pages, `${label}-reponse-m${r}`)
    if (r === ROUNDS) break
    const main = pages[0][1]
    await until(() => main.locator('[data-step="scores"]').count().then(n => n > 0), 12000, `${label} : pas de classement apres la manche ${r}`)
    await sleep(1400)
    await snap(pages, `${label}-classement-m${r}`)
    await until(() => main.getByText(/Prochaine manche|Dernière manche/).first().isVisible().catch(() => false), 10000, `${label} : pas de 3-2-1 avant la manche ${r + 1}`)
    await sleep(500)
    await snap(pages, `${label}-decompte-m${r + 1}`)
  }
  await until(() => pages[0][1].getByTestId("podium").first().isVisible().catch(() => false), 20000, `${label} : pas de podium`)
  await sleep(7200)
  await snap(pages, `${label}-podium`)
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const contexts = []
const bots = []
try {
  // ---------- Partie 1 : autour d'une table ----------
  say("== Autour d'une table : ecran central + telephone ==")
  const host = await guest(browser, "Lea", { viewport: { width: 1440, height: 900 } })
  contexts.push(host.ctx)
  seedUser(host.page.__uid, Array.from({ length: 24 }, (_, i) => i))
  const hp = host.page
  await hp.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  await hp.getByText("Créer une partie").click()
  await hp.waitForURL(/\/modes/, { timeout: 30000 })
  await hp.getByText("Autour d'une table").first().click()
  await hp.getByText("Je présente seulement").click({ timeout: 30000 })
  await hp.getByText("CODE DE LA SALLE").waitFor({ timeout: 30000 })
  const code = await hp.locator("[data-code]").first().getAttribute("data-code")
  await hp.getByRole("button", { name: String(ROUNDS), exact: true }).click()
  await hp.getByRole("button", { name: `${SECONDS}s`, exact: true }).click()

  const zoe = await newPage(browser, PHONE, "Zoe", problems)
  contexts.push(zoe.ctx)
  const zp = zoe.page
  await zp.goto(`${APP}/?join=${code}`, { waitUntil: "networkidle", timeout: 60000 })
  await zp.locator("input").first().fill("Zoe")
  await zp.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !zp.__uid; i++) await sleep(250)
  if (zp.__uid) seedUser(zp.__uid, Array.from({ length: 24 }, (_, i) => 48 + i))
  await zp.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
  await zp.getByText("Tu es dans la partie").waitFor({ timeout: 60000 })

  const plans = [r => ({ action: r % 2 ? "juste" : "proche" }), r => ({ action: r === 2 ? "muet" : "juste" })]
  for (const [i, name] of ["Tom", "Ines"].entries()) {
    const b = new Bot({ name, plan: plans[i], random: rng(500 + i) })
    await b.enter()
    seedUser(b.id, Array.from({ length: 24 }, (_, k) => 24 + i * 50 + k))
    const j = await b.join(code)
    if (!j.ok) throw new Error(`${name} ne peut pas entrer`)
    b.others = [zp.__uid].filter(Boolean)
    bots.push(b)
  }
  await sleep(2500)
  await hp.getByRole("button", { name: /lancer la partie/i }).click()
  await shootGame([["ecran-central", hp], ["telephone", zp]], bots, "table", async r => {
    const input = zp.getByPlaceholder(/titre du morceau/i)
    await input.waitFor({ timeout: 15000 }).catch(() => {})
    await input.fill(["papaoutai", "jsp", "la macarena"][r - 1] ?? "jsp").catch(() => {})
    await zp.getByRole("button", { name: /valider/i }).first().click().catch(() => {})
  })
  for (const b of bots.splice(0)) b.close()

  // ---------- Partie 2 : a distance, au telephone ----------
  say("== A distance : telephone ==")
  const solo = await guest(browser, "Max", PHONE)
  contexts.push(solo.ctx)
  const sp = solo.page
  seedUser(sp.__uid, Array.from({ length: 24 }, (_, i) => 100 + i))
  await sp.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  await sp.getByText("Créer une partie").click()
  await sp.waitForURL(/\/modes/, { timeout: 30000 })
  await sp.getByText("À distance").first().click()
  await sp.getByTestId("lobby-inviter").waitFor({ timeout: 30000 })
  const code2 = await sp.locator("[data-code]").first().getAttribute("data-code")
  await sp.getByRole("button", { name: String(ROUNDS), exact: true }).click()
  await sp.getByRole("button", { name: `${SECONDS}s`, exact: true }).click()
  for (const [i, name] of ["Tom", "Ines"].entries()) {
    const b = new Bot({ name, plan: plans[i], random: rng(700 + i) })
    await b.enter()
    seedUser(b.id, Array.from({ length: 24 }, (_, k) => 200 + i * 50 + k))
    const j = await b.join(code2)
    if (!j.ok) throw new Error(`${name} ne peut pas entrer`)
    b.others = [sp.__uid]
    bots.push(b)
  }
  await sleep(2500)
  await sp.getByRole("button", { name: /lancer la partie/i }).click()
  await shootGame([["telephone", sp]], bots, "distance", async r => {
    const input = sp.getByPlaceholder(/titre du morceau/i)
    await input.waitFor({ timeout: 15000 }).catch(() => {})
    await input.fill(["alors on dance", "", "formidable"][r - 1] ?? "").catch(() => {})
    await sp.getByRole("button", { name: /valider/i }).first().click().catch(() => {})
  })
} catch (e) {
  problems.push(`arret : ${e.message.split("\n")[0]}`)
} finally {
  for (const b of bots) b.close()
  for (const c of contexts) await c.close().catch(() => {})
  await browser.close()
}
say(problems.length ? `ECHEC :\n - ${problems.join("\n - ")}` : `OK : captures dans ${OUT}`)
process.exit(problems.length ? 1 : 0)
