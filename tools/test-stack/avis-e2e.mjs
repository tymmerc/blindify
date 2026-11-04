// Message de Tym aux joueurs (T24), de bout en bout sur la pile de test :
//   1. iPhone (390x844) : un 1er solo jusqu'a la fin, le Oui / Pas trop habituel ;
//   2. meme telephone, 2e solo : le bloc « Hello, je suis l'etudiant derriere
//      Blindz » remplace le Oui / Pas trop, champ ouvert ; message + contact
//      envoyes, merci affiche, ligne « mot » en base avec le contact ;
//   3. mail au faux Resend : objet, message et contact ; le contact et le
//      message ne sont dans aucun journal de la pile ;
//   4. 3e solo : le bloc ne revient pas ;
//   5. lien « Donne ton avis » du pied de page -> /avis/, message sans contact
//      (mode « site ») : en base, et groupe (pas de 2e mail tout de suite).
//
//   tools/test-stack/campagne-ref.sh <branche> --script <ce fichier> [--out DOSSIER]
//
// Captures dans --out (defaut : /opt/mira/dossier/preuves/2026-11-04-blindz-avis).
// Code de sortie 1 au moindre probleme.
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { APP, heardTrack, newPage, sleep } from "./probe.mjs"
import { psql } from "./testdb.mjs"

const LINK = "https://www.deezer.com/fr/playlist/"
const STUB = "http://127.0.0.1:3180/resend-stub/mails"
const LOGS = "/opt/blindify/.test-stack/logs"
const args = process.argv.slice(2)
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "/opt/mira/dossier/preuves/2026-11-04-blindz-avis"
// --pc : meme parcours sur un ecran d'ordinateur (1440x900) au lieu de l'iPhone.
const PC = args.includes("--pc")
const DEVICE = PC ? { viewport: { width: 1440, height: 900 } } : { ...devices["iPhone 13"] }
const SCREEN = PC ? "pc" : "iphone"
const INTRO = "Hello, je suis l'étudiant derrière Blindz. Un truc qui t'a plu, un truc qui t'a saoulé ? Écris-le ici, je lis tout."
const CONTACT_LABEL = "Ton Insta ou ton e-mail si tu veux que je te réponde (facultatif)"
// Marqueurs uniques : on les cherche ensuite dans les journaux de la pile.
const TAG = `e2e${Date.now().toString(36)}`
const MESSAGE = `Super jeu, mais le mode buzzer va trop vite (${TAG})`
const CONTACT = `@${TAG}.insta`
const SITE_MESSAGE = `Ajoute du rap FR stp (${TAG}-site)`

fs.mkdirSync(OUT, { recursive: true })
const problems = []
const notes = []
const shots = []
const check = (ok, what) => { (ok ? notes : problems).push(what); console.log(`${ok ? "[ok]" : "[ECHEC]"} ${what}`) }
const shot = async (page, name, opts = {}) => {
  const f = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: f, ...opts })
  shots.push(f)
}

/** Un solo de 5 manches jusqu'a « Partie terminee » (meme parcours que retours-e2e). */
async function playSolo(page, linkSeed) {
  await page.goto(`${APP}/solo/`, { waitUntil: "networkidle", timeout: 60000 })
  await page.getByPlaceholder(/open\.spotify\.com\/user/).first().fill(`${LINK}${linkSeed % 40}`)
  await page.getByRole("button", { name: "5", exact: true }).first().click()
  await page.getByRole("button", { name: /lancer le blind test/i }).click()
  for (let round = 1; round <= 5; round++) {
    const input = page.getByPlaceholder(/morceau qui tourne/i)
    await input.waitFor({ timeout: 30000 })
    const t = await heardTrack(page)
    await input.fill(t?.title ?? "?")
    await page.getByPlaceholder(/qui chante/i).fill(t?.artist ?? "?").catch(() => {})
    await page.getByRole("button", { name: /^valider$/i }).click()
    const next = page.getByRole("button", { name: /manche suivante|terminer/i })
    await Promise.race([
      next.waitFor({ timeout: 15000 }),
      page.getByText(/partie terminée/i).first().waitFor({ timeout: 15000 }),
    ]).catch(() => {})
    await sleep(1200)
    if (await next.isVisible().catch(() => false)) await next.click()
  }
  await page.getByText(/partie terminée/i).first().waitFor({ timeout: 20000 })
  await sleep(2500) // animations de l'ecran de fin
}

const quickBlock = page => page.getByRole("region", { name: /ça s'est bien passé/i })
const noteBlock = page => page.getByRole("region", { name: "Un mot pour l'étudiant derrière Blindz" })
const feedbackMails = async () => {
  const all = await (await fetch(STUB)).json()
  return (Array.isArray(all) ? all : all.mails ?? []).filter(m => /t'a écrit|t'ont écrit/.test(m.subject ?? ""))
}

async function phone(browser) {
  const { ctx, page } = await newPage(browser, DEVICE, SCREEN, problems)
  try {
    await playSolo(page, 21)
    check(await quickBlock(page).isVisible(), "1re partie : le « Ça s'est bien passé ? » habituel")
    check(!(await page.getByText(INTRO).isVisible().catch(() => false)), "1re partie : pas de message de Tym")

    await playSolo(page, 22)
    const region = noteBlock(page)
    await region.scrollIntoViewIfNeeded()
    check(await region.isVisible(), "2e partie : le bloc de Tym est la")
    check(await region.getByText(INTRO).isVisible(), "2e partie : le texte mot pour mot")
    check(!(await quickBlock(page).isVisible().catch(() => false)), "2e partie : plus de Oui / Pas trop")
    const field = region.getByRole("textbox", { name: "Ton message" })
    check(await field.isVisible(), "2e partie : le champ est ouvert sans clic")
    await shot(page, `1-fin-2e-partie-${SCREEN}-bloc`)
    await shot(page, `2-fin-2e-partie-${SCREEN}-page`, { fullPage: true })

    await field.fill(MESSAGE)
    await region.getByRole("textbox", { name: CONTACT_LABEL }).fill(CONTACT)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(overflow <= 2, `${SCREEN} : pas de debordement horizontal (${overflow} px)`)
    await shot(page, `3-fin-2e-partie-${SCREEN}-rempli`)
    await region.getByRole("button", { name: "Envoyer" }).click()
    await page.getByText("Merci, c'est bien arrivé. Je te réponds dès que je l'ai lu.").waitFor({ timeout: 10000 })
    check(true, "envoi : merci affiche (avec contact)")
    await shot(page, `4-fin-2e-partie-${SCREEN}-merci`)

    const row = psql(`SELECT kind || '|' || mode || '|' || coalesce(contact, '') FROM game_feedback WHERE message = '${MESSAGE.replace(/'/g, "''")}'`)
    check(row === `mot|solo|${CONTACT}`, `base : ligne « mot » solo avec le contact (${row})`)

    await sleep(1500)
    const mails = await feedbackMails()
    const mail = mails.at(-1)
    check(mails.length === 1, `faux Resend : un mail pour Tym (${mails.length})`)
    check(Boolean(mail && mail.subject === "Blindz : un joueur t'a écrit"), `faux Resend : objet (${mail?.subject})`)
    check(Boolean(mail?.text?.includes(MESSAGE) && mail.text.includes(`Contact laissé : ${CONTACT}`)), "faux Resend : message et contact dans le mail")

    await playSolo(page, 23)
    check(await quickBlock(page).isVisible(), "3e partie : retour au Oui / Pas trop")
    check(!(await page.getByText(INTRO).isVisible().catch(() => false)), "3e partie : le message ne revient pas")
  } finally {
    await ctx.close().catch(() => {})
  }
}

async function footerLink(browser) {
  const { ctx, page } = await newPage(browser, DEVICE, "pied-de-page", problems)
  try {
    await page.goto(`${APP}/`, { waitUntil: "networkidle", timeout: 60000 })
    const link = page.getByRole("navigation", { name: "Pied de page" }).getByRole("link", { name: "Donne ton avis" })
    await link.scrollIntoViewIfNeeded()
    await link.click()
    await page.waitForURL(/\/avis\/?$/, { timeout: 15000 })
    check(await page.getByText(INTRO).isVisible(), "pied de page : « Donne ton avis » ouvre le meme formulaire")
    await page.getByRole("textbox", { name: "Ton message" }).fill(SITE_MESSAGE)
    await shot(page, `5-page-avis-${SCREEN}`)
    await page.getByRole("button", { name: "Envoyer" }).click()
    await page.getByText("Merci, c'est bien arrivé. Je lis ça très vite.").waitFor({ timeout: 10000 })
    const row = psql(`SELECT kind || '|' || mode || '|' || coalesce(contact, 'null') FROM game_feedback WHERE message = '${SITE_MESSAGE.replace(/'/g, "''")}'`)
    check(row === "mot|site|null", `base : message du site sans contact (${row})`)
    await sleep(1500)
    const mails = await feedbackMails()
    check(mails.length === 1, `faux Resend : 2e message dans les 10 minutes groupe, pas de 2e mail tout de suite (${mails.length})`)
  } finally {
    await ctx.close().catch(() => {})
  }
}

function logsClean() {
  const files = fs.existsSync(LOGS) ? fs.readdirSync(LOGS).map(f => path.join(LOGS, f)) : []
  const leaks = files.filter(f => {
    try {
      const text = fs.readFileSync(f, "utf8")
      return text.includes(TAG)
    } catch {
      return false
    }
  })
  check(files.length > 0 && leaks.length === 0, `journaux de la pile (${files.length} fichiers) : ni message ni contact (${leaks.map(f => path.basename(f)).join(", ") || "aucune fuite"})`)
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"], ignoreDefaultArgs: ["--mute-audio"] })
try {
  await fetch(STUB, { method: "DELETE" })
  await phone(browser)
  await footerLink(browser)
  logsClean()
} catch (e) {
  problems.push(`arret : ${String(e.message).split("\n").slice(0, 4).join(" / ").slice(0, 400)}`)
  console.log(`[ECHEC] arret : ${e.message}`)
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(OUT, "avis-e2e.json"), JSON.stringify({ date: new Date().toISOString(), ok: problems.length === 0, problems, notes, shots }, null, 2))
console.log(`\n${problems.length ? "ECHEC" : "OK"} : ${notes.length} verifications, ${problems.length} probleme(s). Captures : ${OUT}`)
process.exit(problems.length ? 1 : 0)
