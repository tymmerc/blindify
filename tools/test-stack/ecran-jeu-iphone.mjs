// L'ecran de jeu sur un petit telephone : rien ne doit sortir de l'ecran.
//
// Le 05/10/2026, sur un iPhone (390 px de large), l'en-tete de la partie a
// distance (BLINDZ, ROUND 01/10 + chrono, son, PAUSE, QUITTER) etait plus large
// que l'ecran : QUITTER coupe, et la carte de reponse rognee a droite. Ce script
// joue de vraies parties sur la pile de test et, a chaque ecran, mesure :
//   - la largeur du document (scrollWidth) contre celle de l'ecran (clientWidth) ;
//   - la boite de chaque controle visible (boutons, champs, en-tete, carte de
//     reponse, recap, podium) : aucune ne doit depasser a gauche ou a droite,
//     sauf dans une bande qui defile expres (le choix « qui a ajoute ? »).
// Ecrans : partie a distance (l'hote, avec PAUSE, et un invite) en manche, a la
// revelation et a la fin ; autour d'une table (ecran central + telephone) ; un
// seul tel (buzzer). Tailles 320x568, 375x667, 390x844, 430x932. Moteurs :
// WebKit (profil iPhone 13) et Chromium (profil Pixel 7).
//
//   campagne-ref.sh <branche> --script /chemin/ecran-jeu-iphone.mjs /dossier/des/preuves [webkit,chromium]
//
// Code de sortie : 0 si rien ne deborde nulle part, 1 sinon.
import { chromium, webkit, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { oracle, seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/ecran-jeu-iphone"
const ENGINES = (process.argv[3] || "webkit,chromium").split(",")
const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932]]
const LAUNCH = { webkit, chromium }
const DEVICE = { webkit: devices["iPhone 13"], chromium: devices["Pixel 7"] }
fs.mkdirSync(OUT, { recursive: true })

const problems = []
const lines = []
const measures = []
const say = m => { console.log(m); lines.push(m) }
const range = (from, n) => Array.from({ length: n }, (_, i) => from + i)

/** Tourne DANS la page : largeur du document et controles qui sortent de l'ecran. */
function audit() {
  const de = document.documentElement
  const vw = de.clientWidth
  // Le podium de fin recouvre tout l'ecran : on ne juge que lui.
  const root = document.querySelector(".finale-overlay") || document
  const SEL = "button, input, select, textarea, a[href], label, h1, h2, h3, header, .theater-pill, .theater-brand, .theater-dock, .theater-reveal-card, .theater-recap-row, .finale-row"
  const name = el => {
    const t = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.innerText || el.value || "").replace(/\s+/g, " ").trim().slice(0, 28)
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).find(c => /^(theater|finale)-/.test(c)) : ""
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${t ? ` "${t}"` : ""}`
  }
  const shown = el => {
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  // Une bande qui defile expres (overflow-x auto) : ce qui en depasse se fait
  // defiler du doigt, a condition que la bande elle-meme tienne dans l'ecran.
  const inScroller = el => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX
      if ((ox === "auto" || ox === "scroll") && a.scrollWidth > a.clientWidth + 1) {
        const r = a.getBoundingClientRect()
        return r.left >= -1 && r.right <= vw + 1
      }
    }
    return false
  }
  const box = el => { const r = el.getBoundingClientRect(); return { el: name(el), left: Math.round(r.left), right: Math.round(r.right) } }
  const out = [...root.querySelectorAll(SEL)]
    .filter(el => shown(el) && !inScroller(el))
    .map(box)
    .filter(b => b.right > vw + 1 || b.left < -1)
  const header = [...root.querySelectorAll(".theater-topbar, header")]
    .flatMap(h => [...h.querySelectorAll("button, input, .theater-pill, .theater-brand")])
    .filter(shown)
    .map(box)
  return { vw, innerWidth: window.innerWidth, vh: window.innerHeight, scrollWidth: de.scrollWidth, scrollHeight: de.scrollHeight, out, header }
}

/** Met la page a la taille voulue, mesure, et garde une capture (en pixels CSS). */
async function check(page, { eng, screen, role, size }) {
  const [width, height] = size
  await page.setViewportSize({ width, height })
  await sleep(700)
  const tag = `${eng}-${screen}-${role}-${width}x${height}`
  const file = path.join(OUT, `${tag}.png`)
  await page.screenshot({ path: file, scale: "css" }).catch(e => problems.push(`${tag} : capture impossible (${e.message.split("\n")[0]})`))
  const m = await page.evaluate(audit)
  measures.push({ tag, eng, screen, role, width, height, ...m })
  const sideways = m.scrollWidth > m.vw
  const head = m.header.map(b => `${b.el.replace(/^(button|input|div)\.?/, "")} ${b.left}..${b.right}`).join(" | ")
  if (!sideways && m.out.length === 0) {
    say(`  [ok] ${tag} : document ${m.scrollWidth}/${m.vw}`)
  } else {
    const what = [sideways ? `le document fait ${m.scrollWidth} px pour ${m.vw}` : null, ...m.out.map(b => `${b.el} ${b.left}..${b.right}`)].filter(Boolean)
    problems.push(`${tag} : ${what.length} element(s) hors de l'ecran`)
    say(`  !! ${tag} : ${what.join(" ; ")}`)
  }
  if (head) say(`       en-tete : ${head}`)
}

const both = (pages, opts) => Promise.all(pages.map(([role, p]) => check(p, { ...opts, role })))

async function wizard(page, name, join) {
  await page.goto(`${APP}/jouer/${join ? `?join=${join}` : ""}`, { waitUntil: "networkidle", timeout: 90000 })
  await page.locator("input").first().fill(name)
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !page.__uid; i++) await sleep(250)
  if (!page.__uid) throw new Error(`${name} : aucune identite creee`)
}

async function roomCode(page) {
  const el = page.locator("[data-code]").first()
  await el.waitFor({ timeout: 40000 })
  return el.getAttribute("data-code")
}

/* ------------------------------------------------------------------ */
/* 1. A distance : l'hote et un invite, chacun sur son telephone         */
async function remote(browser, eng) {
  say(`\n== ${eng} : partie a distance, hote + invite sur telephone ==`)
  const host = await newPage(browser, { ...DEVICE[eng] }, `${eng} hote`, problems)
  const guest = await newPage(browser, { ...DEVICE[eng] }, `${eng} invite`, problems)
  const h = host.page, g = guest.page
  const pages = [["hote", h], ["invite", g]]
  try {
    await wizard(h, "Hote")
    seedUser(h.__uid, range(0, 8))
    await h.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
    await h.getByText("Créer une partie").click()
    await h.waitForURL(/\/modes/, { timeout: 40000 })
    await h.getByText("À distance").first().click()
    const code = await roomCode(h)
    say(`  salle ${code}`)
    await wizard(g, "Lou", code)
    seedUser(g.__uid, range(8, 8))
    await g.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await g.locator("[data-code]").first().waitFor({ timeout: 30000 })
    await h.getByText("Lou").first().waitFor({ timeout: 30000 })
    await h.getByRole("button", { name: "5", exact: true }).first().click()
    await sleep(800)
    await h.getByRole("button", { name: /lancer la partie/i }).first().click()

    for (let round = 1; round <= 5; round++) {
      const size = SIZES[round - 1]
      await Promise.all(pages.map(([, p]) => p.getByPlaceholder("Titre du morceau").waitFor({ state: "visible", timeout: 60000 })))
      await sleep(1200)
      if (size) await both(pages, { eng, screen: "distance-manche", size })
      const truth = oracle(code, round)
      await g.getByPlaceholder("Titre du morceau").fill(truth?.title ?? "?")
      await g.getByPlaceholder("Tape ici...").fill(truth?.artist ?? "?")
      await g.locator('button[type="submit"]').first().click({ timeout: 5000 })
      await h.getByRole("button", { name: /je sais pas/i }).first().click({ timeout: 5000 })
      await Promise.all(pages.map(([, p]) => p.locator(".theater-recap").waitFor({ state: "visible", timeout: 60000 })))
      await sleep(1000)
      if (size) await both(pages, { eng, screen: "distance-revelation", size })
    }
    // Fin : le podium du salon (« Fin de la face · Resultats ») remplace l'ecran de jeu.
    await Promise.all(pages.map(([, p]) => p.getByText(/Fin de la face/).first().waitFor({ state: "visible", timeout: 60000 })))
    await sleep(4000) // entree animee du podium
    for (const size of SIZES) await both(pages, { eng, screen: "distance-fin", size })
  } catch (e) {
    problems.push(`${eng} a distance : arret, ${e.message.split("\n")[0]}`)
    say(`  !! arret : ${e.message.split("\n")[0]}`)
    await h.screenshot({ path: path.join(OUT, `${eng}-distance-erreur-hote.png`), scale: "css" }).catch(() => {})
    await g.screenshot({ path: path.join(OUT, `${eng}-distance-erreur-invite.png`), scale: "css" }).catch(() => {})
  } finally {
    await host.ctx.close().catch(() => {})
    await guest.ctx.close().catch(() => {})
  }
}

/* ------------------------------------------------------------------ */
/* 2. Autour d'une table : l'ecran central (redimensionne) + un telephone */
async function table(browser, eng) {
  say(`\n== ${eng} : autour d'une table, ecran central + telephone ==`)
  const screen = await newPage(browser, { viewport: { width: 1440, height: 900 } }, `${eng} ecran central`, problems)
  const phone = await newPage(browser, { ...DEVICE[eng] }, `${eng} telephone`, problems)
  const bot = new Bot({ name: "BotMuet", plan: () => ({ action: "muet" }), random: rng(7) })
  const p = screen.page, t = phone.page
  const pages = [["ecran", p], ["telephone", t]]
  try {
    await wizard(p, "Ecran")
    seedUser(p.__uid, range(0, 8))
    await p.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
    await p.getByText("Créer une partie").click()
    await p.waitForURL(/\/modes/, { timeout: 40000 })
    await p.getByText("Autour d'une table").first().click()
    await p.getByText("Je présente seulement").click({ timeout: 30000 })
    const code = await roomCode(p)
    say(`  salle ${code}`)
    await bot.enter()
    seedUser(bot.id, range(8, 8))
    await bot.join(code)
    await wizard(t, "Tel", code)
    seedUser(t.__uid, range(16, 8))
    await t.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await t.getByText("Tu es dans la partie").waitFor({ timeout: 30000 })
    bot.others = [p.__uid, t.__uid]
    await sleep(2500)
    await p.getByRole("button", { name: "5", exact: true }).first().click()
    await p.getByRole("button", { name: "15s", exact: true }).first().click()
    await sleep(800)
    await p.getByRole("button", { name: /lancer la partie/i }).click()

    for (let round = 1; round <= 4; round++) {
      const size = SIZES[round - 1]
      const t0 = Date.now()
      while (!(bot.current?.round === round && !bot.reveals.has(round)) && Date.now() - t0 < 60000) await sleep(200)
      await t.getByLabel("Titre du morceau").waitFor({ state: "visible", timeout: 20000 })
      await sleep(1200)
      await both(pages, { eng, screen: "table-manche", size })
      await t.getByLabel("Titre du morceau").fill(oracle(code, round)?.title ?? "?")
      await t.locator('button[type="submit"]').first().click({ timeout: 5000 }).catch(() => {})
      const t1 = Date.now()
      while (!bot.reveals.has(round) && Date.now() - t1 < 60000) await sleep(200)
      await sleep(1200)
      await both(pages, { eng, screen: "table-revelation", size })
    }
    const t2 = Date.now()
    while (!bot.over && Date.now() - t2 < 120000) await sleep(300)
    if (!bot.over) throw new Error("la partie ne s'est pas terminee")
    await sleep(4000)
    for (const size of SIZES) await both(pages, { eng, screen: "table-fin", size })
  } catch (e) {
    problems.push(`${eng} autour d'une table : arret, ${e.message.split("\n")[0]}`)
    say(`  !! arret : ${e.message.split("\n")[0]}`)
    await p.screenshot({ path: path.join(OUT, `${eng}-table-erreur-ecran.png`), scale: "css" }).catch(() => {})
  } finally {
    bot.close()
    await screen.ctx.close().catch(() => {})
    await phone.ctx.close().catch(() => {})
  }
}

/* ------------------------------------------------------------------ */
/* 3. Un seul tel (buzzer) : reglages et ecran « pose ton doigt »        */
async function buzzer(browser, eng) {
  say(`\n== ${eng} : un seul tel (buzzer) ==`)
  const { ctx, page: p } = await newPage(browser, { ...DEVICE[eng] }, `${eng} buzzer`, problems)
  try {
    await wizard(p, "Ana")
    seedUser(p.__uid, range(24, 8))
    await p.goto(`${APP}/buzzer/`, { waitUntil: "networkidle", timeout: 60000 })
    await p.getByPlaceholder("Joueur 1").fill("Ana")
    await p.getByPlaceholder("Joueur 2").fill("Bob")
    await p.getByRole("button", { name: /ajouter un joueur/i }).click()
    await p.getByPlaceholder("Joueur 3").fill("Cleo")
    await p.getByRole("button", { name: "5", exact: true }).click()
    for (const size of SIZES) await check(p, { eng, screen: "buzzer-reglages", role: "tel", size })
    await p.getByRole("button", { name: /lancer la partie/i }).click()
    await p.getByText("Pose ton doigt ici").first().waitFor({ timeout: 30000 })
    await sleep(1500)
    for (const size of SIZES) await check(p, { eng, screen: "buzzer-manche", role: "tel", size })
  } catch (e) {
    problems.push(`${eng} buzzer : arret, ${e.message.split("\n")[0]}`)
    say(`  !! arret : ${e.message.split("\n")[0]}`)
  } finally {
    await ctx.close().catch(() => {})
  }
}

for (const eng of ENGINES) {
  const browser = await LAUNCH[eng].launch(eng === "chromium" ? { args: ["--autoplay-policy=no-user-gesture-required"] } : {})
  try {
    await remote(browser, eng)
    await table(browser, eng)
    await buzzer(browser, eng)
  } finally {
    await browser.close()
  }
}

say(`\n=== ${problems.length ? `${problems.length} PROBLEME(S)` : "AUCUN PROBLEME"} ===`)
problems.forEach(m => say(`  - ${m}`))
fs.writeFileSync(path.join(OUT, "mesures.json"), JSON.stringify(measures, null, 1))
fs.writeFileSync(path.join(OUT, "resume.txt"), `${new Date().toISOString()}\n${lines.join("\n")}\n`)
process.exit(problems.length ? 1 : 0)
