// Captures de tous les lobbys, hote et invites, ordinateur et telephone.
// Sert a juger l'agencement avant/apres une refonte, sur de vraies images.
//
//   heavy node tools/lobby-shots.mjs [dossier]      (defaut : avant)
//
// Cible dev.tymmerc.eu. Aucun import Deezer par l'interface : la bibliotheque
// de l'hote est ensemencee par SQL (seed-library) et on lui fabrique deux
// cartes de liens pour que le bloc "Ta musique" ait son vrai visage. Tout ce
// qui est cree ici (comptes, salons, titres) est supprime a la fin.
import { chromium, devices } from "@playwright/test"
import fs from "fs"
// psql sans shell + gardes SQL (ids et codes renvoyes par le serveur)
import { seedLibrary, cleanupSeeded, psql, entier, codeSalle } from "./seed-library.mjs"

const B = "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = `/opt/blindify/maquettes/shots/lobbies/${process.argv[2] || "avant"}`
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }
const say = m => console.log(m)

const users = new Set()
const codes = new Set()
const DESK = { viewport: { width: 1440, height: 900 } }
const PHONE = { ...devices["iPhone 13"] }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const ctxs = []
const page = async (opts, tag) => {
  const c = await b.newContext(opts); ctxs.push(c)
  await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
  const p = await c.newPage()
  p.on("pageerror", e => bad(`${tag} crash JS : ${String(e).slice(0, 140)}`))
  p.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      let id
      try { id = (await r.json())?.data?.user?.id } catch { /* pas ce call */ }
      // Garde SQL : ces ids finissent colles dans la bibliotheque et le menage.
      if (id) { try { users.add(entier(id)); p.__uid = id } catch (e) { bad(`${tag} : ${e.message}`) } }
    }
  })
  return p
}
const shot = async (p, nom) => {
  await sleep(1200) // animations d'entree
  await p.screenshot({ path: `${SHOTS}/${nom}.png`, fullPage: true })
  // Pleine page, les elements fixes (barre Lancer, bouton du chat) sont
  // dessines la ou etait l'ecran : au milieu. La vue ecran montre leur vraie place.
  if ((p.viewportSize()?.width ?? 1000) < 600) await p.screenshot({ path: `${SHOTS}/${nom}-ecran.png` })
  say(`  capture ${nom}`)
}

/** Passe le wizard /jouer/ : pseudo, musique vide. */
const wizard = async (p, nom, join) => {
  await p.goto(`${B}/jouer/${join ? `?join=${join}` : ""}`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(nom)
  await p.getByRole("button", { name: /continuer/i }).click()
  if (join) {
    await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
  } else {
    await p.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  }
  for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
}

/** Deux cartes de liens pour l'hote : une active, une decochee. */
const bibliotheque = async (uid) => {
  await seedLibrary(uid, 20)
  const l1 = psql(`INSERT INTO imported_links (user_id,url,normalized_url,provider,kind,label)
    VALUES (${uid},'https://www.deezer.com/fr/playlist/1','deezer:playlist:1','deezer','playlist','Soirée années 2000') RETURNING id`)
  const l2 = psql(`INSERT INTO imported_links (user_id,url,normalized_url,provider,kind,label,active)
    VALUES (${uid},'https://open.spotify.com/playlist/2','spotify:playlist:2','spotify','playlist','Rap FR du dimanche',false) RETURNING id`)
  psql(`UPDATE audio_sources SET link_id=${l1.split("\n")[0]} WHERE id IN (SELECT id FROM audio_sources WHERE user_id=${uid} ORDER BY id LIMIT 12)`)
  psql(`UPDATE audio_sources SET link_id=${l2.split("\n")[0]} WHERE user_id=${uid} AND link_id IS NULL`)
}

const codeEvent = async p => codeSalle(await p.locator("[data-code]").first().getAttribute("data-code"))
const codeFriends = codeEvent

try {
  // ---------------- Autour d'une table (event) ----------------
  say("\n== Autour d'une table ==")
  const h = await page(DESK, "hote-event")
  await wizard(h, "Tymeo")
  await bibliotheque(h.__uid)
  await h.getByText("Créer une partie").click()
  await h.waitForURL(/\/modes/, { timeout: 40000 })
  await shot(h, "00-modes-ordi")
  await h.getByText("Autour d'une table").first().click()
  await h.getByText("Je présente seulement").waitFor({ timeout: 40000 })
  await shot(h, "01-event-entree-ordi")
  await h.getByText("Je présente seulement").click()
  await h.getByText("Code de la salle").waitFor({ timeout: 40000 })
  const code = await codeEvent(h); codes.add(code)
  await shot(h, "02-event-hote-vide-ordi")
  const joueurs = []
  for (const n of ["Megane", "Max", "Lea"]) {
    const p = await page(PHONE, n)
    await wizard(p, n, code)
    await p.getByText("Tu es dans la partie").waitFor({ timeout: 60000 })
    joueurs.push(p)
  }
  await shot(h, "03-event-hote-3joueurs-ordi")
  await shot(joueurs[0], "04-event-invite-tel")

  // meme lobby hote vu sur telephone (le tel pose au centre de la table)
  const ht = await page(PHONE, "hote-event-tel")
  await wizard(ht, "Zoe")
  await ht.getByText("Créer une partie").click()
  await ht.waitForURL(/\/modes/, { timeout: 40000 })
  await shot(ht, "05-modes-tel")
  await ht.getByText("Autour d'une table").first().click()
  await ht.getByText("Je joue aussi").waitFor({ timeout: 40000 })
  await shot(ht, "06-event-entree-tel")
  await ht.getByText("Je joue aussi").click()
  await ht.getByText("Code de la salle").waitFor({ timeout: 40000 })
  codes.add(await codeEvent(ht))
  await shot(ht, "07-event-hote-tel")

  // ---------------- A distance (friends) ----------------
  say("\n== A distance ==")
  const f = await page(DESK, "hote-friends")
  await wizard(f, "Tymeo")
  await bibliotheque(f.__uid)
  await f.getByText("Créer une partie").click()
  await f.waitForURL(/\/modes/, { timeout: 40000 })
  await f.getByText("À distance").first().click()
  await f.locator("[data-code]").waitFor({ timeout: 40000 })
  const fcode = await codeFriends(f); codes.add(fcode)
  const fj = await page(PHONE, "Max")
  await wizard(fj, "Max", fcode)
  await fj.locator("[data-code]").waitFor({ timeout: 60000 })
  await sleep(1500)
  await shot(f, "10-friends-hote-ordi")
  await shot(fj, "11-friends-invite-tel")
  const ft = await page(PHONE, "hote-friends-tel")
  await wizard(ft, "Lea")
  await ft.getByText("Créer une partie").click()
  await ft.waitForURL(/\/modes/, { timeout: 40000 })
  await ft.getByText("À distance").first().click()
  await ft.locator("[data-code]").waitFor({ timeout: 40000 })
  codes.add(await codeFriends(ft))
  await shot(ft, "12-friends-hote-tel")

  // ---------------- Streamer, buzzer, solo ----------------
  say("\n== Streamer, un seul tel, solo ==")
  const s = await page(DESK, "streamer")
  await wizard(s, "StreamerHost")
  await s.goto(`${B}/multiplayer/?mode=streamer&intent=host&nickname=StreamerHost`, { waitUntil: "networkidle", timeout: 60000 })
  await sleep(3000)
  await shot(s, "20-streamer-hote-ordi")
  const bz = await page(PHONE, "buzzer")
  await wizard(bz, "Intrus")
  await bz.goto(`${B}/buzzer/`, { waitUntil: "networkidle", timeout: 60000 })
  await shot(bz, "21-buzzer-tel")
  await bz.goto(`${B}/solo/`, { waitUntil: "networkidle", timeout: 60000 })
  await shot(bz, "22-solo-tel")
} catch (e) {
  bad(`arret : ${e.message.split("\n")[0]}`)
} finally {
  for (const c of ctxs) await c.close().catch(() => {})
  await b.close()
  // Menage : salons, titres ensemences, comptes (les liens et participations suivent en cascade).
  const ids = [...users].join(",")
  try {
    if (codes.size) psql(`UPDATE multiplayer_rooms SET status='finished' WHERE room_code IN (${[...codes].map(c => `'${c}'`).join(",")})`)
    cleanupSeeded([...users])
    if (ids) {
      psql(`DELETE FROM game_sessions WHERE host_user_id IN (${ids})`)
      psql(`DELETE FROM users WHERE id IN (${ids})`)
    }
    say(`\nmenage : ${users.size} comptes, ${codes.size} salons`)
  } catch (e) { bad(`menage : ${e.message.split("\n")[0]}`) }
}
say(problems.length ? `\n${problems.length} probleme(s)` : `\ncaptures dans ${SHOTS}`)
process.exit(problems.length ? 1 : 0)
