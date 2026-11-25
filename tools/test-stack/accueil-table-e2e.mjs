// Accueil des nouveaux autour d'une table (24/11), sur la pile de test.
//
// Vu en vrai : trois nouveaux venus, quatre manches sans une reponse, pause
// automatique, personne n'a relance. Ici : l'ecran central (presentateur,
// 1440x900), Zoe au telephone (375x667) et Tom (bot) ; personne ne repond.
// - avant la manche 1, l'ecran et le telephone expliquent ou sort la musique
//   et ou repondre, puis la manche part seule, sans clic, chrono entier ;
// - apres 3 manches muettes, la pause dit quoi faire chez tout le monde, et
//   seul l'hote a le gros bouton « Reprendre la partie », qui relance ;
// - revanche dans la meme salle : le 3-2-1 habituel, sans explication.
// Captures claires et sombres de l'ecran et du telephone.
//
//   campagne-ref.sh <branche> --script /chemin/accueil-table-e2e.mjs /dossier/des/captures
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/accueil-table-e2e"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const say = m => console.log(m)
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const PHONE = { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const ROUNDS = 5
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

async function snap(pages, name) {
  for (const theme of ["light", "dark"]) {
    for (const [, page] of pages) await setTheme(page, theme)
    await sleep(200)
    for (const [tag, page] of pages) {
      await page.screenshot({ path: path.join(OUT, `${name}-${tag}-${theme === "light" ? "clair" : "sombre"}.png`) }).catch(e => problems.push(`${name} ${tag} : ${e.message}`))
    }
  }
  for (const [, page] of pages) await setTheme(page, "light")
  say(`  capture ${name}`)
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow <= 0) ok(`${label} : rien ne deborde`)
  else bad(`${label} : deborde de ${overflow} px`)
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const contexts = []
let tom = null
try {
  say("== Autour d'une table : explication au depart, pause qui explique ==")
  const host = await newPage(browser, { viewport: { width: 1440, height: 900 } }, "Lea", problems)
  contexts.push(host.ctx)
  const hp = host.page
  await hp.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await hp.locator("input:not([type=file])").first().fill("Lea")
  await hp.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !hp.__uid; i++) await sleep(250)
  if (!hp.__uid) throw new Error("Lea : aucune identite")
  seedUser(hp.__uid, Array.from({ length: 24 }, (_, i) => i))
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
  await zp.locator("input:not([type=file])").first().fill("Zoe")
  await zp.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !zp.__uid; i++) await sleep(250)
  if (zp.__uid) seedUser(zp.__uid, Array.from({ length: 24 }, (_, i) => 48 + i))
  await zp.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
  await zp.getByText("Tu es dans la partie").waitFor({ timeout: 60000 })

  tom = new Bot({ name: "Tom", plan: () => ({ action: "muet" }), random: rng(2411) })
  await tom.enter()
  seedUser(tom.id, Array.from({ length: 24 }, (_, k) => 100 + k))
  const j = await tom.join(code)
  if (!j.ok) throw new Error(`Tom ne peut pas entrer (${j.status} ${j.code})`)
  tom.others = [zp.__uid].filter(Boolean)
  await sleep(2500)

  const pages = [["ecran", hp], ["telephone", zp]]
  await hp.getByRole("button", { name: /lancer la partie/i }).click()

  // ---- explication avant la manche 1 ----
  await until(() => tom.rounds.has(1), 30000, "la manche 1 ne part pas")
  const t1 = tom.timeline[1]
  const wait = t1.startAt - t1.received
  if (wait >= 8500 && wait <= 10500) ok(`la musique part ${Math.round(wait / 100) / 10} s apres l'annonce de la manche 1 (explication + 3-2-1)`)
  else bad(`attente avant la manche 1 : ${wait} ms, attendu environ 10 s`)
  if (t1.plannedReveal - t1.startAt === SECONDS * 1000) ok(`chrono de la manche 1 entier (${SECONDS} s apres le depart de la musique)`)
  else bad(`chrono de la manche 1 : ${t1.plannedReveal - t1.startAt} ms`)
  for (const [tag, page] of pages) {
    const intro = page.getByTestId("explication-table")
    await intro.waitFor({ timeout: 5000 }).catch(() => {})
    const text = (await intro.textContent().catch(() => "")) ?? ""
    const expected = tag === "ecran" ? "La musique va sortir de cet écran." : "La musique sort du grand écran."
    if (text.includes(expected)) ok(`${tag} : explication affichee (« ${expected} »)`)
    else bad(`${tag} : explication absente ou inattendue (${text})`)
  }
  await sleep(800)
  await snap(pages, "explication")
  await noOverflow(zp, "telephone pendant l'explication")

  // Personne ne clique : la manche part seule a l'heure du serveur.
  await sleep(Math.max(0, t1.startAt - Date.now()) + 1200)
  if (await zp.getByTestId("decompte-manche").count()) bad("telephone : le decompte est encore la apres le depart")
  else ok("la manche 1 a demarre seule, sans clic")
  if (await zp.getByPlaceholder(/morceau qui tourne/i).isVisible().catch(() => false)) ok("telephone : le champ du titre est la")
  else bad("telephone : pas de champ du titre apres le depart")

  // ---- 3 manches sans reponse : la pause qui explique ----
  await until(() => zp.getByTestId("pause-reason").isVisible().catch(() => false), 3 * (SECONDS + 16) * 1000, "pas de pause apres 3 manches muettes")
  ok(`pause apres la manche ${tom.reveals.size} sans reponse`)
  for (const [tag, page] of pages) {
    const reason = page.getByTestId("pause-reason")
    const text = (await reason.textContent().catch(() => "")) ?? ""
    const role = await reason.getAttribute("role").catch(() => null)
    if (text.includes("Personne n'a répondu.") && text.includes("téléphone") && /s'arrête dans \d+ min/.test(text)) ok(`${tag} : message clair (${text})`)
    else bad(`${tag} : message de pause inattendu (${text})`)
    if (role === "alert") ok(`${tag} : message annonce a l'apparition (role=alert)`)
    else bad(`${tag} : message sans role=alert`)
  }
  const resume = hp.getByRole("button", { name: "Reprendre la partie", exact: true })
  if (await resume.isVisible().catch(() => false)) ok("ecran : gros bouton « Reprendre la partie »")
  else bad("ecran : pas de bouton « Reprendre la partie »")
  if (await resume.evaluate(el => el === document.activeElement).catch(() => false)) ok("ecran : le focus est deja sur « Reprendre la partie »")
  else bad("ecran : le focus n'est pas sur « Reprendre la partie »")
  if (await zp.getByRole("button", { name: "Reprendre la partie", exact: true }).count()) bad("telephone : le bouton de l'hote est la")
  else ok("telephone : pas le bouton de l'hote")
  if (await zp.getByTestId("idle-present").isVisible().catch(() => false)) ok("telephone : « Je suis là » pour repartir")
  else bad("telephone : pas de « Je suis là »")
  await snap(pages, "pause")
  await noOverflow(zp, "telephone pendant la pause")

  // Au clavier : Entree sur le bouton deja focalise relance la partie.
  await hp.keyboard.press("Enter")
  await until(async () => !(await zp.getByTestId("pause-reason").isVisible().catch(() => false)), 10000, "la partie ne repart pas apres « Reprendre la partie »")
  ok("« Reprendre la partie » (clavier) relance la partie pour tout le monde")

  // ---- revanche dans la meme salle : le 3-2-1 habituel, sans explication ----
  await hp.getByRole("button", { name: "Arrêter la partie", exact: true }).first().click()
  const dialog = hp.getByRole("alertdialog")
  await dialog.waitFor({ timeout: 5000 })
  await dialog.getByRole("button", { name: "Arrêter la partie", exact: true }).click()
  await until(async () => await hp.getByRole("button", { name: /lancer la partie/i }).isVisible().catch(() => false), 15000, "l'hote n'est pas revenu dans la salle")
  await sleep(1500)
  await hp.getByRole("button", { name: /lancer la partie/i }).click()
  await until(() => zp.getByTestId("decompte-manche").isVisible().catch(() => false), 15000, "revanche : pas de decompte sur le telephone")
  for (const [tag, page] of pages) {
    const label = (await page.getByTestId("decompte-manche").getAttribute("aria-label").catch(() => "")) ?? ""
    const left = Number(/départ dans (\d+)/.exec(label)?.[1] ?? NaN)
    if (left <= 3) ok(`${tag} : revanche avec le 3-2-1 habituel (${label})`)
    else bad(`${tag} : decompte de revanche inattendu (${label})`)
    if (await page.getByTestId("explication-table").count()) bad(`${tag} : explication affichee a la revanche`)
    else ok(`${tag} : pas d'explication a la revanche`)
  }
  await snap(pages, "revanche")
} catch (err) {
  bad(`arret du scenario : ${err.message}`)
} finally {
  tom?.close()
  for (const ctx of contexts) await ctx.close().catch(() => {})
  await browser.close().catch(() => {})
}

say(problems.length ? `\n${problems.length} probleme(s)` : "\nTout est bon")
process.exit(problems.length ? 1 : 0)
