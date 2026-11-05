// T7, simplification apres la soiree du 01/11 : les parcours sur telephone, de
// bout en bout sur la pile de test, avec captures.
//   1. arriver par /blind-test-tv/ et lancer une partie « Autour d'une table »
//      (je joue aussi) : sans repasser par le choix des modes, conseil du son,
//      bouton Inviter, adresse sans pseudo ;
//   2. l'adresse d'hote du 01/11 ouverte sur un 2e telephone : passe par
//      l'entree du QR, entre sous SON pseudo, pas de 2e hote ;
//   3. fin de partie a 3 : « Changer la musique », import par lien, les 3
//      joueurs restent, Rejouer repart ;
//   4. A distance a 2 : pas de « Qui a ajoute ? » ; puis la salle effacee
//      (comme le fait le serveur apres 30 min) : l'hote la rouvre pareille,
//      un invite lit ce qui s'est passe.
//
//   tools/test-stack/campagne-ref.sh <branche> --script <ce fichier> [--out DOSSIER]
//
// Code de sortie 1 au moindre probleme.
import { devices, chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, rng } from "./bot.mjs"
import { APP, newPage, sleep } from "./probe.mjs"
import { psql, seedUser } from "./testdb.mjs"

const args = process.argv.slice(2)
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "/opt/mira/dossier/preuves/2026-11-05-blindz-t7"
const IPHONE = { ...devices["iPhone 13"] }
const LINK = "https://www.deezer.com/fr/playlist/7"
fs.mkdirSync(OUT, { recursive: true })

const problems = []
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? "[ok]" : "[ECHEC]"} ${what}`) }
const shot = async (page, name) => { await sleep(600); await page.screenshot({ path: path.join(OUT, `${name}.png`) }) }
const text = page => page.evaluate(() => document.body.innerText)
const names = code => psql(`SELECT COALESCE(rp.nickname, u.username) FROM room_participants rp JOIN multiplayer_rooms r ON r.id = rp.room_id
  JOIN users u ON u.id = rp.user_id WHERE r.room_code = '${code}' ORDER BY rp.user_id`).split("\n").filter(Boolean)
const roomCode = page => page.locator("[data-code]").first().getAttribute("data-code")

async function enterName(page, name) {
  await page.locator("input").first().fill(name)
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !page.__uid; i++) await sleep(250)
  if (!page.__uid) throw new Error(`${name} : aucune identite creee`)
}

/** Joue jusqu'a l'ecran de fin : chaque telephone envoie « Je sais pas » ou une reponse vide. */
async function waitForEnd(pages, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (/Fin de la face/i.test(await text(pages[0]))) return true
    for (const p of pages) {
      const btn = p.locator('button[type="submit"]').first()
      if (await btn.isEnabled({ timeout: 200 }).catch(() => false)) await btn.click({ timeout: 1000 }).catch(() => {})
    }
    await sleep(1500)
  }
  return false
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const opened = []
const open = async (opts, tag) => { const p = await newPage(browser, opts, tag, problems); opened.push(p); return p.page }
const bots = []

try {
  /* ---------- 1. depuis le guide tele ---------- */
  console.log("\n== 1. Arriver par /blind-test-tv/ ==")
  const host = await open(IPHONE, "hote")
  await host.goto(`${APP}/blind-test-tv/`, { waitUntil: "networkidle", timeout: 60000 })
  await host.getByRole("link", { name: /jouer, c'est gratuit/i }).last().click()
  await host.waitForURL(/\/jouer\/\?mode=event/, { timeout: 20000 })
  check(true, "le bouton du guide tele mene a /jouer/?mode=event")
  await enterName(host, "Maelia")
  seedUser(host.__uid, [0, 1, 2, 3, 4, 5, 6, 7])
  await host.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  await host.getByText(/Tu crées une partie « Autour d'une table »/).waitFor({ timeout: 20000 })
  await shot(host, "1a-jouer-depuis-guide-tele")
  await host.getByText("Créer une partie").click()
  await host.getByText("Je joue aussi").waitFor({ timeout: 30000 })
  check(!/\/modes/.test(host.url()), "pas de detour par le choix des modes")
  await shot(host, "1b-combien-de-telephones")
  await host.getByText("Je joue aussi").click()
  await host.getByText("Code de la salle").waitFor({ timeout: 30000 })
  const code = await roomCode(host)
  console.log(`   salle ${code}`)
  check(/branche-le sur une enceinte/.test(await text(host)), "le lobby dit comment faire entendre toute la table")
  check(await host.getByTestId("lobby-inviter").isVisible(), "le bouton Inviter est visible")
  const addr = new URL(host.url())
  check(!addr.searchParams.has("nickname") && !addr.searchParams.has("intent") && addr.searchParams.get("code") === code,
    `l'adresse de l'hote n'a plus ni pseudo ni role (${addr.search})`)
  await shot(host, "1c-lobby-hote-son-inviter")
  await host.getByTestId("lobby-son").scrollIntoViewIfNeeded()
  await shot(host, "1d-lobby-hote-conseil-son")

  /* ---------- 2. l'adresse de l'hote sur un autre telephone ---------- */
  console.log("\n== 2. L'adresse de l'hote ouverte par Manou ==")
  const manou = await open(IPHONE, "manou")
  await manou.goto(`${APP}/multiplayer/?mode=event&intent=host&nickname=Maelia&code=${code}`, { waitUntil: "networkidle", timeout: 60000 })
  await manou.waitForURL(/\/jouer\/\?join=/, { timeout: 20000 })
  check(true, "sans pseudo sur ce telephone : passage par l'entree du QR")
  await shot(manou, "2a-adresse-hote-demande-le-pseudo")
  await enterName(manou, "Manou")
  seedUser(manou.__uid, [8, 9, 10, 11, 12, 13, 14, 15])
  await manou.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
  await manou.getByText("Tu es dans la partie").waitFor({ timeout: 30000 })
  const bot = new Bot({ name: "Miguel", plan: () => ({ action: "faux" }), random: rng(71) })
  bots.push(bot)
  await bot.enter()
  seedUser(bot.id, [16, 17, 18, 19, 20, 21, 22, 23])
  check((await bot.join(code)).ok, "Miguel (bot) entre dans la salle")
  await sleep(2500)
  const inRoom = names(code)
  console.log(`   en base : ${inRoom.join(", ")}`)
  check(inRoom.filter(n => n === "Maelia").length === 1 && inRoom.includes("Manou"), "un seul « Maelia », Manou sous son nom")
  await shot(manou, "2b-manou-dans-la-salle")
  await shot(host, "2c-hote-3-joueurs")

  /* ---------- 3. fin de partie, changer la musique, Rejouer ---------- */
  console.log("\n== 3. Changer la musique en fin de partie ==")
  await host.getByRole("button", { name: "5", exact: true }).click()
  await host.getByRole("button", { name: "10s", exact: true }).click()
  await sleep(500)
  await host.getByRole("button", { name: /lancer la partie/i }).click()
  await host.getByPlaceholder(/morceau qui tourne/i).waitFor({ timeout: 30000 })
  check(/Qui a ajouté ce titre/i.test(await text(host)), "a 3 joueurs, « Qui a ajouté ce titre ? » est pose")
  await shot(host, "3a-manche-a-3-avec-qui-a-ajoute")
  check(await waitForEnd([host, manou], 5 * 25000), "la partie va jusqu'a l'ecran de fin")
  await sleep(4000)
  await host.getByTestId("fin-musique").scrollIntoViewIfNeeded()
  await shot(host, "3b-fin-changer-la-musique")
  await host.getByTestId("fin-musique").click()
  const dialog = host.getByTestId("musique-salle")
  await dialog.waitFor({ timeout: 10000 })
  await shot(host, "3c-ta-musique-par-dessus-la-salle")
  await dialog.getByPlaceholder(/open\.spotify\.com/).first().fill(LINK)
  await dialog.getByRole("button", { name: /importer/i }).first().click()
  await dialog.getByText(/titres? importés?|ajouté|importé/i).first().waitFor({ timeout: 40000 }).catch(() => {})
  await shot(host, "3d-import-fait")
  await dialog.getByRole("button", { name: /revenir à la salle/i }).click()
  const stillIn = names(code)
  check(stillIn.length === 3, `les 3 joueurs sont toujours dans la salle ${code} (${stillIn.join(", ")})`)
  await host.getByRole("button", { name: /^rejouer$/i }).click()
  await host.getByPlaceholder(/morceau qui tourne/i).waitFor({ timeout: 30000 })
  await manou.getByLabel("Titre du morceau").waitFor({ timeout: 30000 })
  check(true, "Rejouer repart avec les memes joueurs, Manou comprise")
  await shot(manou, "3e-rejouer-manou-joue")
  for (const b of bots) b.close()

  /* ---------- 4. A distance a deux, puis salle effacee ---------- */
  console.log("\n== 4. A distance a deux, puis salle effacee ==")
  const h2 = await open(IPHONE, "hote2")
  await h2.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await enterName(h2, "Lea")
  seedUser(h2.__uid, [24, 25, 26, 27, 28, 29, 30, 31])
  await h2.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  await h2.getByText("Créer une partie").click()
  await h2.waitForURL(/\/modes/, { timeout: 30000 })
  await shot(h2, "4a-modes-par-situation")
  await h2.getByText("À distance").first().click()
  await h2.getByTestId("lobby-inviter").waitFor({ timeout: 30000 })
  const code2 = await roomCode(h2)
  await h2.getByRole("button", { name: "15", exact: true }).click().catch(() => {})
  await h2.getByRole("button", { name: "30s", exact: true }).click().catch(() => {})
  await shot(h2, "4b-lobby-distance-inviter")
  const duo = new Bot({ name: "Tom", plan: () => ({ action: "faux" }), random: rng(72) })
  bots.push(duo)
  await duo.enter()
  seedUser(duo.id, [32, 33, 34, 35, 36, 37, 38, 39])
  await duo.join(code2)
  await sleep(2000)
  await h2.getByRole("button", { name: /lancer la partie/i }).click()
  // A distance, le champ s'appelle « Titre du morceau » (TheaterGameView).
  await h2.getByPlaceholder(/titre du morceau/i).waitFor({ timeout: 30000 })
  await sleep(1500)
  check(!/Qui a ajouté/i.test(await text(h2)), "a 2 joueurs, pas de « Qui a ajouté ? »")
  await shot(h2, "4c-manche-a-2-sans-qui-a-ajoute")
  duo.close()
  // Ce que fait le serveur apres 30 min sans partie, ou 7 jours apres la fin.
  psql(`DELETE FROM multiplayer_rooms WHERE room_code = '${code2}'`)
  await h2.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await h2.getByRole("button", { name: /continuer/i }).first().click()
  await h2.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 }).catch(() => {})
  await h2.getByText("Rejoindre avec un code").click()
  await h2.getByPlaceholder("CODE").fill(code2)
  await h2.getByRole("button", { name: /^rejoindre$/i }).click()
  await h2.getByTestId("salle-expiree").waitFor({ timeout: 30000 })
  check(/15 manches, 30 s pour répondre/.test(await text(h2)), "la salle expiree rappelle les reglages de l'hote")
  await shot(h2, "4d-salle-expiree-hote")
  await h2.getByText("Rouvrir une salle pareille").click()
  await h2.getByTestId("lobby-inviter").waitFor({ timeout: 30000 })
  const code3 = await roomCode(h2)
  const cfg = psql(`SELECT question_count, round_duration_ms FROM multiplayer_rooms WHERE room_code = '${code3}'`)
  check(code3 !== code2 && cfg.startsWith("15|30000"), `salle rouverte ${code3} avec 15 manches et 30 s (${cfg})`)
  await shot(h2, "4e-salle-rouverte")
  const guest = await open(IPHONE, "invite")
  await guest.addInitScript(() => localStorage.setItem("blindify_nickname", "Tom"))
  await guest.goto(`${APP}/multiplayer/?mode=friends&code=${code2}`, { waitUntil: "networkidle", timeout: 60000 })
  await guest.getByTestId("salle-expiree").waitFor({ timeout: 30000 })
  check(/Demande le nouveau code/.test(await text(guest)), "un invite sur une salle effacee sait quoi faire")
  await shot(guest, "4f-salle-expiree-invite")
} catch (e) {
  problems.push(`arret : ${String(e.message ?? e).split("\n")[0]}`)
  console.log(`[ECHEC] arret : ${String(e.message ?? e).split("\n")[0]}`)
  for (const [i, p] of opened.entries()) await p.page.screenshot({ path: path.join(OUT, `erreur-${i}.png`) }).catch(() => {})
} finally {
  for (const b of bots) b.close()
  for (const p of opened) await p.ctx.close().catch(() => {})
  await browser.close()
}

console.log(`\n${problems.length ? `${problems.length} probleme(s)` : "tout est vert"} ; captures dans ${OUT}`)
for (const p of problems) console.log(` - ${p}`)
process.exit(problems.length ? 1 : 0)
