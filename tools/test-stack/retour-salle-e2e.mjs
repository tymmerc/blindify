// Fin de partie, retour a la salle d'attente, relance (T40), sur la pile de test.
//
// Demande de Tym le 12/11 : « revenir au lobby sans relancer la partie et sans
// revenir aux modes ». Ici : l'hote (ordi, theme clair) et Zoe (telephone,
// theme sombre) dans de vrais navigateurs, Tom (bot) qui repond juste.
// - une partie de 3 manches va au bout, l'ecran de fin montre le podium et les
//   moments de la partie, « Revenir à la salle » chez l'hote seulement ;
// - l'hote clique : TOUT le monde revient dans la salle d'attente, meme code,
//   memes joueurs, reglages gardes, sans aucun rechargement de page (Activite
//   Discord : jamais de rechargement dans l'iframe) ;
// - l'hote relance depuis la salle : la partie 2 demarre pour tout le monde.
//
//   campagne-ref.sh <branche> --script /chemin/retour-salle-e2e.mjs /dossier/des/preuves
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { forgetOracle, psql, seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/retour-salle-e2e"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name, fullPage = false) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f, fullPage }); shots.push(f) }

const ROUNDS = 3
const SECONDS = 10

async function until(test, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await test()) return true
    await sleep(250)
  }
  throw new Error(what)
}

/** Pose un temoin dans la page : il disparait si la page se recharge. */
const markPage = page => page.evaluate(() => { window.__sansRechargement = true })
const stillSamePage = page => page.evaluate(() => window.__sansRechargement === true).catch(() => false)

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
let host = null
let zoe = null
const tom = new Bot({ name: "Tom", plan: () => ({ action: "juste" }), random: rng(4011) })
let code = null
try {
  say("== Fin de partie, retour a la salle, relance (« Chacun chez soi », 3 joueurs) ==")
  host = await newPage(browser, { viewport: { width: 1440, height: 900 }, colorScheme: "light" }, "hote", problems)
  const page = host.page
  await page.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await page.locator("input").first().fill("Lea")
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !page.__uid; i++) await sleep(250)
  if (!page.__uid) throw new Error("hote : aucune identite creee")
  seedUser(page.__uid, Array.from({ length: 24 }, (_, i) => i))
  await page.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  await page.getByText("Créer une partie").click()
  await page.waitForURL(/\/modes/, { timeout: 30000 })
  await page.getByText("À distance").first().click()
  await page.getByTestId("lobby-inviter").waitFor({ timeout: 30000 })
  code = await page.locator("[data-code]").first().getAttribute("data-code")
  say(`   salle ${code}`)
  await page.getByRole("button", { name: String(ROUNDS), exact: true }).click()
  await page.getByRole("button", { name: `${SECONDS}s`, exact: true }).click()

  zoe = await newPage(browser, { ...devices["iPhone SE"], colorScheme: "dark" }, "Zoe", problems)
  const zp = zoe.page
  await zp.goto(`${APP}/?join=${code}`, { waitUntil: "networkidle", timeout: 60000 })
  await zp.locator("input").first().fill("Zoe")
  await zp.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !zp.__uid; i++) await sleep(250)
  if (zp.__uid) seedUser(zp.__uid, Array.from({ length: 24 }, (_, i) => 48 + i))
  await zp.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
  await zp.getByText("Tu es dans la partie").waitFor({ timeout: 60000 })

  await tom.enter()
  seedUser(tom.id, Array.from({ length: 24 }, (_, i) => 24 + i))
  const joined = await tom.join(code)
  if (!joined.ok) throw new Error(`Tom ne peut pas entrer (${joined.status} ${joined.code})`)
  tom.others = [page.__uid, zp.__uid].filter(Boolean)
  await sleep(2500)
  const roundsBefore = psql(`SELECT question_count FROM multiplayer_rooms WHERE room_code = '${code}'`)

  await markPage(page)
  await markPage(zp)
  await page.getByRole("button", { name: /lancer la partie/i }).click()
  await until(() => tom.rounds.has(1), 30000, "la manche 1 n'a jamais commence")
  ok("partie 1 lancee")
  // Zoe repond de travers a chaque manche : de quoi remplir « la reponse la plus a cote ».
  const answered = new Set()
  await until(async () => {
    const input = zp.getByPlaceholder(/titre du morceau/i)
    const round = tom.current?.round
    if (round && !answered.has(round) && await input.isVisible().catch(() => false)) {
      answered.add(round)
      await input.fill(`la chanson du ${round}`).catch(() => {})
      await zp.getByRole("button", { name: /valider/i }).first().click().catch(() => {})
    }
    return tom.over
  }, ROUNDS * (SECONDS + 25) * 1000, "la partie 1 ne s'est pas terminee")
  ok(`${tom.reveals.size} manches revelees, fin de partie`)

  // ---- l'ecran de fin ----
  await page.getByTestId("ecran-fin").waitFor({ timeout: 20000 })
  await zp.getByTestId("ecran-fin").waitFor({ timeout: 20000 })
  await sleep(7500) // le podium se revele place par place
  await shot(page, "fin-ordi-clair")
  await shot(zp, "fin-telephone-sombre")
  await shot(zp, "fin-telephone-sombre-entier", true)
  if (await page.getByTestId("revenir-salle").isVisible()) ok("l'hote voit « Revenir à la salle »")
  else bad("pas de « Revenir à la salle » chez l'hote")
  if (await zp.getByTestId("revenir-salle").count()) bad("Zoe (pas hote) a le bouton « Revenir à la salle »")
  else ok("Zoe voit que l'hote peut relancer ou revenir a la salle")
  const moments = await page.locator('[data-testid^="moment-"]').count()
  if (moments > 0) ok(`${moments} moment(s) de la partie sur l'ecran de fin`)
  else bad("aucun moment de la partie sur l'ecran de fin")

  // ---- retour a la salle ----
  // Zoe est hors ligne au moment du clic : elle rate room:lobby et doit
  // revenir quand meme a la salle une fois le reseau retrouve.
  await zoe.ctx.setOffline(true)
  await page.getByTestId("revenir-salle").click()
  await until(async () => await page.getByRole("button", { name: /lancer la partie/i }).isVisible().catch(() => false), 15000, "l'hote n'est pas revenu dans la salle d'attente")
  ok("l'hote est dans la salle d'attente, bouton lancer present")
  await sleep(3000)
  await zoe.ctx.setOffline(false)
  await until(async () => await zp.getByText("Tu es dans la partie").isVisible().catch(() => false), 25000, "Zoe (hors ligne pendant le clic) n'est pas revenue dans la salle d'attente")
  if (await zp.getByTestId("ecran-fin").count()) bad("Zoe voit encore l'ecran de fin dans la salle d'attente")
  ok("Zoe, hors ligne pendant le clic, est revenue dans la salle d'attente toute seule")
  await sleep(1500)
  await shot(page, "salle-apres-retour-ordi-clair")
  await shot(zp, "salle-apres-retour-telephone-sombre")
  if (await stillSamePage(page) && await stillSamePage(zp)) ok("aucune page rechargee (hote et Zoe)")
  else bad("une page s'est rechargee pendant le retour a la salle")
  if (page.url().includes(code)) ok("meme code dans l'adresse de l'hote")
  else bad(`adresse de l'hote sans le code de la salle (${page.url()})`)
  const roomRow = psql(`SELECT status, question_count, (SELECT count(*) FROM room_participants p WHERE p.room_id = r.id) FROM multiplayer_rooms r WHERE room_code = '${code}'`)
  const [status, rounds, players] = roomRow.split("|")
  if (status === "waiting") ok("salle « waiting » en base")
  else bad(`salle « ${status} » en base apres le retour, attendu « waiting »`)
  if (rounds === roundsBefore) ok(`reglages gardes (${rounds} manches)`)
  else bad(`nombre de manches change : ${roundsBefore} -> ${rounds}`)
  if (Number(players) === 3) ok("les 3 joueurs sont toujours dans la salle")
  else bad(`${players} joueur(s) dans la salle, attendu 3`)

  // ---- l'hote relance depuis la salle ----
  forgetOracle(code)
  tom.rounds.clear()
  tom.reveals.clear()
  tom.timeline = {}
  tom.current = null
  tom.over = false
  await page.getByRole("button", { name: /lancer la partie/i }).click()
  await until(() => tom.rounds.has(1), 30000, "la partie 2 n'a jamais commence")
  await until(async () => await zp.getByPlaceholder(/titre du morceau/i).isVisible().catch(() => false), 20000, "Zoe n'a pas l'ecran de jeu de la partie 2")
  ok("partie 2 lancee depuis la salle, Zoe est dedans")
  if (await stillSamePage(zp)) ok("toujours sans rechargement chez Zoe")
  else bad("la page de Zoe s'est rechargee au lancement de la partie 2")
  const sessions = Number(psql(`SELECT count(*) FROM game_sessions WHERE room_code = '${code}'`))
  if (sessions === 2) ok("2 parties en base pour la meme salle")
  else bad(`${sessions} partie(s) en base, attendu 2`)
  if (tom.leaks.length) bad(`Tom a vu une reponse avant la revelation (${tom.leaks.length})`)
  if (tom.errors.length) bad(`Tom : ${tom.errors.slice(0, 3).join(" ; ")}`)
} catch (e) {
  bad(`arret : ${e.message.split("\n")[0]}`)
  if (host) await shot(host.page, "erreur-hote").catch(() => {})
  if (zoe) await shot(zoe.page, "erreur-zoe").catch(() => {})
} finally {
  tom.close()
  await host?.ctx.close().catch(() => {})
  await zoe?.ctx.close().catch(() => {})
  await browser.close()
}
say(`\n${problems.length ? `ECHEC : ${problems.length} probleme(s)` : "OK : fin, retour a la salle et relance verts"}`)
fs.writeFileSync(path.join(OUT, "rapport.txt"), `${lines.join("\n")}\n\ncaptures :\n${shots.join("\n")}\n`)
process.exit(problems.length ? 1 : 0)
