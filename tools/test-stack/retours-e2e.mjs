// Retours de fin de partie, de bout en bout sur la pile de test :
//   1. un solo sur telephone (390x844) jusqu'a l'ecran de fin : avis « Pas trop »
//      puis un bug avec texte (dont du HTML, pour verifier l'echappement) ;
//   2. un solo sur ordinateur (1440x900) : avis « Oui », formulaire ouvert puis
//      referme a Echap ;
//   3. les lignes de game_feedback dans la base DE TEST ;
//   4. l'onglet Retours du tableau de bord, servi en local contre la base de
//      test, puis contre une base vide (« table pas encore creee »).
//
//   tools/test-stack/campagne-ref.sh <branche> --script <ce fichier> [--out DOSSIER]
//
// Captures dans --out (defaut : /opt/mira/dossier/preuves/2026-10-05-blindz-retours).
// Code de sortie 1 au moindre probleme.
import { chromium, devices } from "@playwright/test"
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { APP, heardTrack, newPage, sleep } from "./probe.mjs"
import { psql, CONTAINER } from "./testdb.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, "../..")
const NODE = process.execPath
const LINK = "https://www.deezer.com/fr/playlist/"
const args = process.argv.slice(2)
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "/opt/mira/dossier/preuves/2026-10-05-blindz-retours"
const BUG_TEXT = "Le son a coupé à la manche 3 <img src=x onerror=alert(1)>"
const STACK_DB = "postgres://blindify:test@127.0.0.1:5436/blindify_test"

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

/** Un solo de 5 manches jusqu'a « Partie terminee », reponses justes. */
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

const block = page => page.getByRole("region", { name: /ça s'est bien passé/i })

async function phoneGame(browser) {
  const { ctx, page } = await newPage(browser, { ...devices["iPhone 13"] }, "telephone", problems)
  try {
    await playSolo(page, 11)
    const region = block(page)
    check(await region.isVisible(), "telephone : le bloc « Ça s'est bien passé ? » est sous les resultats du solo")
    await shot(page, "1-solo-fin-390x844-page", { fullPage: true })
    await region.scrollIntoViewIfNeeded()
    await shot(page, "2-solo-fin-390x844-bloc")

    await region.getByRole("button", { name: "Pas trop" }).click()
    await page.getByText(/Merci de le dire/).waitFor({ timeout: 10000 })
    check(await region.getByRole("button", { name: "Pas trop" }).getAttribute("aria-pressed") === "true", "telephone : « Pas trop » envoye et confirme")

    await region.getByRole("button", { name: "Signaler un bug" }).click()
    const field = page.getByLabel("Qu'est-ce qui s'est passé ?")
    check(await field.evaluate(el => el === document.activeElement), "telephone : le champ du bug a le focus a l'ouverture")
    await field.fill(BUG_TEXT)
    await region.scrollIntoViewIfNeeded()
    await shot(page, "3-solo-bug-ouvert-390x844")
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(overflow <= 2, `telephone : pas de debordement horizontal avec le formulaire ouvert (${overflow} px)`)

    await region.getByRole("button", { name: "Envoyer" }).click()
    await page.getByText("Merci, on regarde ça.").waitFor({ timeout: 10000 })
    check(true, "telephone : bug envoye, remerciement affiche")
    await shot(page, "4-solo-bug-envoye-390x844")
  } finally {
    await ctx.close().catch(() => {})
  }
}

async function desktopGame(browser) {
  const { ctx, page } = await newPage(browser, { viewport: { width: 1440, height: 900 } }, "ordinateur", problems)
  try {
    await playSolo(page, 23)
    const region = block(page)
    check(await region.isVisible(), "ordinateur : le bloc est sous les resultats du solo")
    await region.scrollIntoViewIfNeeded()
    await shot(page, "5-solo-fin-1440x900")
    await region.getByRole("button", { name: "Oui" }).click()
    await page.getByText("Merci, c'est noté.").waitFor({ timeout: 10000 })
    check(true, "ordinateur : « Oui » envoye et confirme")
    await region.getByRole("button", { name: "Signaler un bug" }).click()
    await page.getByLabel("Qu'est-ce qui s'est passé ?").waitFor()
    await region.scrollIntoViewIfNeeded()
    await shot(page, "6-solo-bug-ouvert-1440x900")
    await page.keyboard.press("Escape")
    const closed = !(await page.getByLabel("Qu'est-ce qui s'est passé ?").isVisible().catch(() => false))
    check(closed, "ordinateur : Echap referme le formulaire sans rien envoyer")
  } finally {
    await ctx.close().catch(() => {})
  }
}

function checkRows() {
  const commit = execFileSync("git", ["-C", "/opt/blindify/.test-stack/front", "rev-parse", "--short", "HEAD"]).toString().trim()
  const rows = psql(`SELECT kind, coalesce(answer, '-'), mode, (session_id IS NOT NULL)::text, coalesce(message, '-'),
                            coalesce(app_version, '-'), (user_agent IS NOT NULL)::text
                     FROM game_feedback ORDER BY id`).split("\n").filter(Boolean).map(l => l.split("|"))
  fs.writeFileSync(path.join(OUT, "game_feedback-pile.txt"), psql(`SELECT id, kind, answer, mode, session_id, game_code, app_version, created_at, left(user_agent, 60) AS user_agent, message FROM game_feedback ORDER BY id`) + "\n")
  console.log(rows.map(r => r.join(" | ")).join("\n"))
  check(rows.length === 3, `base de test : 3 lignes dans game_feedback (${rows.length})`)
  const [pasTrop, bug, oui] = rows
  check(pasTrop?.slice(0, 4).join() === "avis,pas_trop,solo,true", "base : avis « pas_trop » du solo, rattache a sa partie")
  check(bug?.[0] === "bug" && bug?.[1] === "-" && bug?.[3] === "true" && bug?.[4] === BUG_TEXT, "base : bug du solo avec son texte intact, rattache a sa partie")
  check(oui?.slice(0, 4).join() === "avis,oui,solo,true", "base : avis « oui » du solo ordinateur")
  check(rows.every(r => r[5] === commit), `base : version du front = commit teste (${commit})`)
  check(rows.every(r => r[6] === "true"), "base : navigateur enregistre")
}

/* ------------------------- tableau de bord ------------------------- */

function startDbBrowser(port, url) {
  const child = spawn(NODE, [path.join(REPO, "tools/db-browser.mjs")], {
    env: { ...process.env, DB_BROWSER_PORT: String(port), DB_BROWSER_URL: url },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stderr.on("data", d => process.stderr.write(`[db-browser ${port}] ${d}`))
  return child
}

/** Sert la page du tableau de bord comme nginx (/blindz/, /blindz/api/ -> service). */
function startAdminServer(port, apiPort) {
  const page = fs.readFileSync(path.join(REPO, "infra/blindz-admin/index.html"))
  const server = http.createServer((req, res) => {
    const url = req.url || "/"
    if (url.startsWith("/blindz/api/sante")) {
      // Pas de lecture de la prod ici : la sante (docker, journaux) est simulee.
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ backend: { etat: "healthy", demarre_le: null }, disque: { pourcent: 50, libre_go: 40 }, base: { taille: "pile de test", requetes_actives: 0 }, derniere_sauvegarde: null, derniere_erreur: null }))
      return
    }
    if (url.startsWith("/blindz/api/")) {
      const up = http.request({ host: "127.0.0.1", port: apiPort, path: url.replace(/^\/blindz/, ""), method: req.method, headers: req.headers }, r => {
        res.writeHead(r.statusCode || 502, r.headers); r.pipe(res)
      })
      up.on("error", () => { res.writeHead(502); res.end() })
      req.pipe(up)
      return
    }
    if (url === "/blindz/" || url.startsWith("/blindz/#") || url.startsWith("/blindz/?")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(page); return
    }
    res.writeHead(404); res.end()
  })
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)))
}

async function waitHttp(url, seconds = 20) {
  for (let i = 0; i < seconds * 4; i++) {
    const ok = await fetch(url).then(r => r.status < 500).catch(() => false)
    if (ok) return true
    await sleep(250)
  }
  return false
}

async function adminCheck(browser) {
  const children = []
  const servers = []
  try {
    children.push(startDbBrowser(3102, STACK_DB))
    servers.push(await startAdminServer(3103, 3102))
    // Une base vide dans le conteneur de la pile : la table n'y existe pas.
    execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "blindify", "-d", "blindify_test", "-qc", "DROP DATABASE IF EXISTS retours_vide"])
    execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "blindify", "-d", "blindify_test", "-qc", "CREATE DATABASE retours_vide"])
    children.push(startDbBrowser(3104, STACK_DB.replace(/blindify_test$/, "retours_vide")))
    servers.push(await startAdminServer(3105, 3104))
    check(await waitHttp("http://127.0.0.1:3102/api/retours") && await waitHttp("http://127.0.0.1:3104/api/retours"), "tableau de bord : services de test demarres")

    const scripts = []
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on("dialog", d => { scripts.push(d.message()); d.dismiss().catch(() => {}) })
    await page.goto("http://127.0.0.1:3103/blindz/#retours", { waitUntil: "networkidle" })
    await page.locator(".retour").first().waitFor({ timeout: 10000 })
    const cards = await page.locator(".retour").count()
    check(cards === 3, `tableau de bord : 3 retours affiches (${cards})`)
    const first = await page.locator(".retour").first().innerText()
    check(first.includes("oui") && !first.includes("pas trop"), "tableau de bord : le plus recent d'abord (avis « oui » du solo ordinateur)")
    const bugText = await page.locator(".retour.bug .texte").innerText()
    check(bugText === BUG_TEXT, "tableau de bord : le texte du bug est affiche tel quel, balises comprises")
    check(await page.locator(".retour img").count() === 0 && scripts.length === 0, "tableau de bord : aucune balise injectee, aucun script execute")
    await shot(page, "7-admin-retours-1440x900")
    await page.locator("#filtre-retours button[data-f='bug']").click()
    await page.locator(".retour").first().waitFor()
    check(await page.locator(".retour").count() === 1, "tableau de bord : le filtre « bugs » ne garde que le bug")
    await shot(page, "8-admin-retours-bugs-1440x900")
    await page.locator(".retour .lien").first().click()
    await page.locator(".tiroir").waitFor({ timeout: 10000 })
    check(await page.locator(".tiroir").isVisible(), "tableau de bord : le lien « partie N » ouvre le detail de la partie")
    await page.keyboard.press("Escape")
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator("#filtre-retours button[data-f='']").click()
    await page.locator(".retour").first().waitFor()
    await shot(page, "9-admin-retours-390x844", { fullPage: true })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("http://127.0.0.1:3105/blindz/#retours", { waitUntil: "networkidle" })
    await page.getByText(/Table pas encore créée/).waitFor({ timeout: 10000 })
    check(true, "tableau de bord : base sans la table, message « table pas encore créée »")
    await shot(page, "10-admin-table-absente-1440x900")
    await ctx.close()
  } finally {
    for (const s of servers) s.close()
    for (const c of children) c.kill("SIGTERM")
    try {
      execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "blindify", "-d", "blindify_test", "-qc", "DROP DATABASE IF EXISTS retours_vide"])
    } catch { /* la pile est jetee a la fin de toute facon */ }
  }
}

// Memes options que browser.mjs : son autorise et chaine audio complete, la
// sonde reconnait le morceau a sa frequence pour donner la bonne reponse.
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"], ignoreDefaultArgs: ["--mute-audio"] })
try {
  const before = psql("SELECT count(*) FROM game_feedback")
  check(before === "0", `pile : table game_feedback creee par le backend au demarrage, vide (${before} ligne)`)
  await phoneGame(browser)
  await desktopGame(browser)
  checkRows()
  await adminCheck(browser)
} catch (e) {
  problems.push(`arret : ${String(e.message).split("\n").slice(0, 4).join(" / ").slice(0, 400)}`)
  console.log(`[ECHEC] arret : ${e.message}`)
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(OUT, "retours-e2e.json"), JSON.stringify({ date: new Date().toISOString(), ok: problems.length === 0, problems, notes, shots }, null, 2))
console.log(`\n${problems.length ? "ECHEC" : "OK"} : ${notes.length} verifications, ${problems.length} probleme(s). Captures : ${OUT}`)
process.exit(problems.length ? 1 : 0)
