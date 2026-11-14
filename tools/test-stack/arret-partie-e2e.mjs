// 30 s par defaut et « Arrêter la partie » (T42), sur la pile de test.
//
// Demande de Tym apres la soiree du 14/11 : a 20 s, 2 reponses sur 10 ; l'hote
// a du ouvrir une nouvelle salle a 30 s et l'ancienne partie a tourne a vide
// jusqu'au bout. Ici : l'hote (ordi, theme clair) et Zoe (telephone, theme
// sombre) dans de vrais navigateurs, Tom (bot) qui repond juste.
// - salle neuve : « 30s » preselectionne, et la manche dure bien 30 s ;
// - pendant la manche 1, Zoe (pas hote) n'a pas le bouton ; l'hote arrete,
//   avec la confirmation ; TOUT le monde revient dans la meme salle, sans
//   rechargement (Activite Discord) ; aucune manche ni revelation ne part
//   ensuite (minuteurs coupes cote serveur) ; partie « abandoned » en base ;
// - l'hote relance : la partie 2 demarre pour tout le monde ; il l'arrete
//   depuis l'ecran de pause.
//
//   campagne-ref.sh <branche> --script /chemin/arret-partie-e2e.mjs /dossier/des/preuves
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { forgetOracle, psql, seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/arret-partie-e2e"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name, fullPage = false) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f, fullPage }); shots.push(f) }

const ROUNDS = 5

async function until(test, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await test()) return true
    await sleep(250)
  }
  throw new Error(what)
}

const markPage = page => page.evaluate(() => { window.__sansRechargement = true })
const stillSamePage = page => page.evaluate(() => window.__sansRechargement === true).catch(() => false)
const answerInput = p => p.getByPlaceholder(/morceau qui tourne|titre du morceau/i)
const stopButtons = p => p.getByRole("button", { name: "Arrêter la partie", exact: true })

/** Clique « Arrêter la partie » dans `scope`, verifie la confirmation, confirme. */
async function stopFrom(page, scope, label) {
  await scope.getByRole("button", { name: "Arrêter la partie", exact: true }).first().click()
  const dialog = page.getByRole("alertdialog")
  await dialog.waitFor({ timeout: 5000 })
  const text = (await dialog.textContent()) ?? ""
  if (text.includes("Arrêter la partie ?") && text.includes("Tout le monde revient dans la salle.")) ok(`confirmation affichee (${label})`)
  else bad(`texte de confirmation inattendu (${label}) : ${text}`)
  return dialog
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
let host = null
let zoe = null
const tom = new Bot({ name: "Tom", plan: () => ({ action: "juste" }), random: rng(4242) })
let code = null
try {
  say("== 30 s par defaut, arreter la partie, relance (« Chacun chez soi », 3 joueurs) ==")
  host = await newPage(browser, { viewport: { width: 1440, height: 900 }, colorScheme: "light" }, "hote", problems)
  const page = host.page
  await page.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await page.locator("input:not([type=file])").first().fill("Lea")
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
  const thirty = page.getByRole("button", { name: "30s", exact: true })
  if (await thirty.getAttribute("aria-pressed") === "true") ok("salle neuve : « 30s » preselectionne")
  else bad("salle neuve : « 30s » n'est pas preselectionne")
  await page.getByRole("button", { name: String(ROUNDS), exact: true }).click()

  zoe = await newPage(browser, { ...devices["iPhone SE"], colorScheme: "dark" }, "Zoe", problems)
  const zp = zoe.page
  await zp.goto(`${APP}/?join=${code}`, { waitUntil: "networkidle", timeout: 60000 })
  await zp.locator("input:not([type=file])").first().fill("Zoe")
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
  let lobbyEvents = 0
  tom.socket.on("room:lobby", () => { lobbyEvents += 1 })
  await sleep(2500)

  await markPage(page)
  await markPage(zp)
  await page.getByRole("button", { name: /lancer la partie/i }).click()
  await until(() => tom.rounds.has(1), 30000, "la manche 1 n'a jamais commence")
  const t1 = tom.timeline[1]
  const roundMs = t1?.plannedReveal && t1?.startAt ? t1.plannedReveal - t1.startAt : null
  if (roundMs === 30000) ok("manche de 30 s (rien de regle par l'hote)")
  else bad(`duree de la manche 1 : ${roundMs} ms, attendu 30000`)
  ok("partie 1 lancee")

  // ---- pendant la manche 1 ----
  await until(async () => await answerInput(zp).isVisible().catch(() => false), 20000, "Zoe n'a pas l'ecran de jeu")
  await until(async () => await stopButtons(page).first().isVisible().catch(() => false), 10000, "pas de « Arrêter la partie » chez l'hote")
  ok("l'hote voit « Arrêter la partie »")
  if (await stopButtons(zp).count()) bad("Zoe (pas hote) a le bouton « Arrêter la partie »")
  else ok("Zoe (pas hote) n'a pas le bouton")
  // Le haut de l'ecran de jeu de l'hote tient sur un telephone avec le bouton en plus.
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 760 })
    await sleep(400)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow <= 0) ok(`ecran de jeu de l'hote a ${width} px : rien ne deborde`)
    else bad(`ecran de jeu de l'hote a ${width} px : deborde de ${overflow} px`)
    await shot(page, `jeu-hote-${width}px`)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await sleep(400)
  // Zoe tape une reponse : elle ne doit jamais repartir sur la partie suivante.
  await answerInput(zp).fill("une reponse de la partie 1", { timeout: 3000 }).catch(() => {})
  await zp.getByRole("button", { name: /valider/i }).first().click({ timeout: 3000 }).catch(() => {})

  // « Continuer » ne coupe rien.
  let dialog = await stopFrom(page, page, "en-tete")
  await shot(page, "confirmation-ordi-clair")
  await dialog.getByRole("button", { name: "Continuer" }).click()
  await sleep(500)
  if (await answerInput(zp).isVisible().catch(() => false) && lobbyEvents === 0) ok("« Continuer » : la partie continue")
  else bad("« Continuer » a coupe la partie")

  dialog = await stopFrom(page, page, "en-tete")
  const stoppedAt = Date.now()
  await dialog.getByRole("button", { name: "Arrêter la partie", exact: true }).click()
  await until(async () => await page.getByRole("button", { name: /lancer la partie/i }).isVisible().catch(() => false), 15000, "l'hote n'est pas revenu dans la salle d'attente")
  ok("l'hote est dans la salle d'attente, bouton lancer present")
  await until(async () => await zp.getByText("Tu es dans la partie").isVisible().catch(() => false), 15000, "Zoe n'est pas revenue dans la salle d'attente")
  ok("Zoe est revenue dans la salle d'attente")
  if (lobbyEvents === 1) ok("Tom a recu le retour a la salle")
  else bad(`Tom a recu ${lobbyEvents} retour(s) a la salle, attendu 1`)
  await shot(page, "salle-apres-arret-ordi-clair")
  await shot(zp, "salle-apres-arret-telephone-sombre")
  if (await stillSamePage(page) && await stillSamePage(zp)) ok("aucune page rechargee (hote et Zoe)")
  else bad("une page s'est rechargee pendant l'arret")
  if (page.url().includes(code)) ok("meme code dans l'adresse de l'hote")
  else bad(`adresse de l'hote sans le code de la salle (${page.url()})`)
  const [status, rounds, players] = psql(`SELECT status, question_count, (SELECT count(*) FROM room_participants p WHERE p.room_id = r.id) FROM multiplayer_rooms r WHERE room_code = '${code}'`).split("|")
  if (status === "waiting") ok("salle « waiting » en base")
  else bad(`salle « ${status} » en base apres l'arret, attendu « waiting »`)
  if (Number(rounds) === ROUNDS) ok(`reglages gardes (${rounds} manches)`)
  else bad(`nombre de manches change : ${rounds}, attendu ${ROUNDS}`)
  if (Number(players) === 3) ok("les 3 joueurs sont toujours dans la salle")
  else bad(`${players} joueur(s) dans la salle, attendu 3`)
  const [state, current] = psql(`SELECT state, current_round FROM game_sessions WHERE room_code = '${code}' ORDER BY id DESC LIMIT 1`).split("|")
  if (state === "abandoned" && current === "0") ok("partie close « abandoned », aucune manche revelee comptee")
  else bad(`partie en base : ${state} / manche ${current}, attendu abandoned / 0`)

  // Les minuteurs de l'ancienne partie : au-dela de l'heure de la revelation
  // de la manche 1, rien ne doit partir.
  await sleep(Math.max(0, (t1?.plannedReveal ?? stoppedAt) - Date.now()) + 6000)
  if (tom.reveals.size === 0 && tom.rounds.size === 1 && !tom.over) ok("aucune revelation ni manche apres l'arret")
  else bad(`apres l'arret : ${tom.reveals.size} revelation(s), ${tom.rounds.size} manche(s), fin=${tom.over}`)
  if (await zp.getByText("Tu es dans la partie").isVisible().catch(() => false)) ok("Zoe est toujours dans la salle d'attente")
  else bad("Zoe a quitte la salle d'attente toute seule apres l'arret")

  // ---- l'hote relance ----
  forgetOracle(code)
  tom.rounds.clear()
  tom.reveals.clear()
  tom.timeline = {}
  tom.current = null
  tom.over = false
  await page.getByRole("button", { name: /lancer la partie/i }).click()
  await until(() => tom.rounds.has(1), 30000, "la partie 2 n'a jamais commence")
  await until(async () => await answerInput(zp).isVisible().catch(() => false), 20000, "Zoe n'a pas l'ecran de jeu de la partie 2")
  ok("partie 2 lancee depuis la meme salle, Zoe est dedans")
  const value = await answerInput(zp).inputValue().catch(() => "")
  if (!value.includes("partie 1")) ok("la reponse de la partie 1 n'est pas reprise")
  else bad("la reponse tapee pendant la partie 1 est encore la dans la partie 2")
  const sessions = Number(psql(`SELECT count(*) FROM game_sessions WHERE room_code = '${code}'`))
  if (sessions === 2) ok("2 parties en base pour la meme salle")
  else bad(`${sessions} partie(s) en base, attendu 2`)
  const zoeAnswers = Number(psql(`SELECT count(*) FROM round_responses rr JOIN game_rounds gr ON gr.id = rr.round_id JOIN game_sessions gs ON gs.id = gr.session_id WHERE gs.room_code = '${code}' AND rr.user_id = ${zp.__uid ?? 0}`))
  if (zoeAnswers === 0) ok("aucune reponse de Zoe enregistree (manche jamais revelee)")
  else bad(`${zoeAnswers} reponse(s) de Zoe en base, attendu 0`)

  // ---- arreter depuis l'ecran de pause ----
  await page.getByRole("button", { name: "Pause", exact: true }).first().click()
  const pauseScreen = page.locator("div.fixed").filter({ hasText: "La partie est gelée pour tout le monde." }).first()
  await pauseScreen.waitFor({ timeout: 10000 })
  dialog = await stopFrom(page, pauseScreen, "ecran de pause")
  await dialog.getByRole("button", { name: "Arrêter la partie", exact: true }).click()
  await until(async () => await page.getByRole("button", { name: /lancer la partie/i }).isVisible().catch(() => false), 15000, "arret depuis la pause : l'hote n'est pas revenu dans la salle")
  await until(async () => await zp.getByText("Tu es dans la partie").isVisible().catch(() => false), 15000, "arret depuis la pause : Zoe n'est pas revenue dans la salle")
  ok("arret depuis l'ecran de pause : tout le monde est dans la salle")
  if (await stillSamePage(zp)) ok("toujours sans rechargement chez Zoe")
  else bad("la page de Zoe s'est rechargee")
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
say(`\n${problems.length ? `ECHEC : ${problems.length} probleme(s)` : "OK : 30 s par defaut, arret, retour a la salle et relance verts"}`)
fs.writeFileSync(path.join(OUT, "rapport.txt"), `${lines.join("\n")}\n\ncaptures :\n${shots.join("\n")}\n`)
process.exit(problems.length ? 1 : 0)
