// Relancer dans la meme salle juste apres la fin (T27), sur la pile de test.
//
// Vu en vrai le 06/11 (salle 9SXZ6U) : un duo « Chacun chez soi » relance une
// partie 3 s apres la fin de la precedente. La manche 1 demarre, ne se revele
// jamais ; la partie reste « en cours » et ils doivent recreer une salle.
//
// Ici : l'hote dans un vrai navigateur, un invite (bot). Une premiere partie,
// puis 5 relances par le bouton « Rejouer », 0, 0, 1, 3 et 3 s apres l'ecran
// de resultats. L'hote ne repond jamais : chaque manche 1 doit se reveler par
// son minuteur (le chemin qui cassait). Pour chaque partie : la manche 1 part,
// se revele a l'heure, la partie va au bout. A la fin, en base : aucune partie
// ni salle « in_progress ».
//
//   campagne-ref.sh <branche> --script /chemin/relance-e2e.mjs /dossier/des/preuves
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { psql, seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/relance-e2e"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); shots.push(f) }

const ROUNDS = 5
const SECONDS = 10
// Delai entre l'ecran de resultats et le clic sur « Rejouer ».
const RELAUNCH_DELAYS_MS = [0, 0, 1000, 3000, 3000]

/** Remet a zero ce que le bot a vu, pour suivre la partie suivante. */
function resetBot(bot) {
  bot.rounds.clear()
  bot.reveals.clear()
  bot.timeline = {}
  bot.current = null
  bot.over = false
}

async function until(test, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (test()) return true
    await sleep(200)
  }
  throw new Error(what)
}

/** Une partie, depuis son lancement jusqu'a l'ecran de resultats de l'hote. */
async function followGame(page, bot, n) {
  const tag = `partie ${n}`
  await until(() => bot.rounds.has(1), 30000, `${tag} : la manche 1 n'a jamais commence`)
  const t = bot.timeline[1]
  ok(`${tag} : manche 1 lancee`)
  await page.getByPlaceholder(/titre du morceau/i).waitFor({ timeout: 20000 }).catch(() => bad(`${tag} : l'hote ne voit pas l'ecran de jeu`))
  await shot(page, `p${n}-1-manche-1`)
  // Personne ne laisse la manche filer en avance : l'hote ne repond pas.
  const late = (t.plannedReveal ?? Date.now() + SECONDS * 1000) + 4000 - Date.now()
  await until(() => bot.reveals.has(1), Math.max(late, 1000), `${tag} : la manche 1 ne s'est pas revelee a l'heure (le blocage du 06/11)`)
  ok(`${tag} : manche 1 revelee ${Math.round((bot.timeline[1].revealAt - t.plannedReveal) / 100) / 10} s apres l'heure prevue`)
  await sleep(1200)
  await shot(page, `p${n}-2-manche-1-revelee`)
  await until(() => bot.over, ROUNDS * (SECONDS + 15) * 1000, `${tag} : la partie ne s'est pas terminee`)
  ok(`${tag} : ${bot.reveals.size} manches revelees, fin de partie`)
  await page.getByRole("button", { name: "Rejouer" }).waitFor({ timeout: 20000 })
  await shot(page, `p${n}-3-resultats`)
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
let host = null
const tom = new Bot({ name: "Tom", plan: () => ({ action: "juste" }), random: rng(2711) })
let code = null
try {
  say("== Relances rapides dans la meme salle (« Chacun chez soi », 2 joueurs) ==")
  host = await newPage(browser, { viewport: { width: 1440, height: 900 } }, "hote", problems)
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
  await tom.enter()
  seedUser(tom.id, Array.from({ length: 24 }, (_, i) => 24 + i))
  const joined = await tom.join(code)
  if (!joined.ok) throw new Error(`Tom ne peut pas entrer (${joined.status} ${joined.code})`)
  tom.others = [page.__uid]
  await sleep(2500)
  await page.getByRole("button", { name: /lancer la partie/i }).click()
  await followGame(page, tom, 1)

  for (const [i, delay] of RELAUNCH_DELAYS_MS.entries()) {
    const n = i + 2
    say(`\n-- relance ${i + 1} : « Rejouer » ${delay / 1000} s apres les resultats --`)
    resetBot(tom)
    await sleep(delay)
    await page.getByRole("button", { name: "Rejouer" }).click()
    await followGame(page, tom, n)
  }

  // En base : chaque partie est finie, rien ne reste « en cours ».
  await sleep(2500)
  const sessions = psql(`SELECT state, count(*) FROM game_sessions WHERE room_code = '${code}' GROUP BY state ORDER BY state`)
  say(`\n   parties en base : ${sessions.replace(/\n/g, ", ")}`)
  const total = Number(psql(`SELECT count(*) FROM game_sessions WHERE room_code = '${code}'`))
  const finished = Number(psql(`SELECT count(*) FROM game_sessions WHERE room_code = '${code}' AND state = 'finished'`))
  if (total !== RELAUNCH_DELAYS_MS.length + 1) bad(`${total} parties en base, attendu ${RELAUNCH_DELAYS_MS.length + 1}`)
  if (finished !== total) bad(`${total - finished} partie(s) pas « finished » en base`)
  else ok(`les ${total} parties sont « finished » en base`)
  const room = psql(`SELECT status FROM multiplayer_rooms WHERE room_code = '${code}'`)
  if (room !== "finished") bad(`salle « ${room} » en base apres la derniere partie, attendu « finished »`)
  else ok("salle « finished » en base apres la derniere partie")
  const stuck = Number(psql(`SELECT count(*) FROM game_sessions WHERE state = 'in_progress'`))
  if (stuck) bad(`${stuck} partie(s) « in_progress » sur la pile`)
  else ok("aucune partie « in_progress » sur la pile")
  if (tom.leaks.length) bad(`Tom a vu une reponse avant la revelation (${tom.leaks.length})`)
  if (tom.errors.length) bad(`Tom : ${tom.errors.slice(0, 3).join(" ; ")}`)
} catch (e) {
  bad(`arret : ${e.message.split("\n")[0]}`)
  if (host) await shot(host.page, "erreur").catch(() => {})
} finally {
  tom.close()
  await host?.ctx.close().catch(() => {})
  await browser.close()
}
say(`\n${problems.length ? `ECHEC : ${problems.length} probleme(s)` : "OK : relances rapides dans la meme salle vertes"}`)
fs.writeFileSync(path.join(OUT, "rapport.txt"), `${lines.join("\n")}\n\ncaptures :\n${shots.join("\n")}\n`)
process.exit(problems.length ? 1 : 0)
