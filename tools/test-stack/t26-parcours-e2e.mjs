// T26, un joueur qui revient retrouve ses infos : parcours sur telephone, de
// bout en bout sur la pile de test, avec captures. Rejoue ce qu'a vecu la bande
// le 05/11 (journaux nginx : Safari, Snapchat, onglets isoles).
//   1. iPhone, Safari : pseudo, puis 3 salles d'affilee et un changement de
//      pseudo : toujours le meme joueur ;
//   2. « deux jours plus tard » : le cookie de 24 h est parti, il ne reste que
//      celui d'un an : meme joueur, echeance repoussee d'un an en base ;
//   3. Mon compte : « Garder mes infos » garde le meme joueur, devenu compte ;
//   4. le lien ouvert dans Snapchat : la ligne d'explication s'affiche, un
//      invite a part joue une salle, puis se connecte : le compte reprend
//      cette partie, l'invite de Snapchat est vide.
//
//   node tools/test-stack/t26-parcours-e2e.mjs [--out DOSSIER]   (pile en marche)
//
// Code de sortie 1 au moindre probleme.
import { devices, chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { api } from "./bot.mjs"
import { APP, newPage, sleep } from "./probe.mjs"
import { psql } from "./testdb.mjs"

const args = process.argv.slice(2)
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "/opt/mira/dossier/preuves/2026-11-07-blindz-t26"
const IPHONE = { ...devices["iPhone 13"] }
const SNAP_UA = `${IPHONE.userAgent} Snapchat/14.30.0.59 (like Safari/8625.1.29.10.33, panda)`
const PASSWORD = "motdepasse-t26"
const PSEUDO = `océ${Math.floor(Math.random() * 900 + 100)}`
fs.mkdirSync(OUT, { recursive: true })

const problems = []
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? "[ok]" : "[ECHEC]"} ${what}`) }
const shot = async (page, name) => { await sleep(700); await page.screenshot({ path: path.join(OUT, `${name}.png`) }) }
const meId = page => page.evaluate(async app => {
  const r = await fetch(`${app}/api/auth/me`, { credentials: "include", cache: "no-store" })
  if (!r.ok) return null
  return (await r.json())?.data?.user ?? null
}, APP)
const memberIds = code => psql(`SELECT rp.user_id FROM room_participants rp JOIN multiplayer_rooms r ON r.id = rp.room_id
  WHERE r.room_code = '${code}' ORDER BY rp.user_id`).split("\n").filter(Boolean).map(Number)

// Une salle ouverte par un hote a part (comme le telephone de l'hote le 05/11).
async function newRoom() {
  const g = await api("/api/auth/guest", { method: "POST", body: { nickname: "Hote" } })
  const r = await api("/api/rooms/create", { method: "POST", token: g.data.sessionToken, body: { mode: "friends" } })
  const code = r.data?.room?.room_code ?? r.data?.room?.roomCode ?? r.data?.roomCode ?? r.data?.room_code
  if (!code) throw new Error(`salle non creee : ${JSON.stringify(r).slice(0, 200)}`)
  return code
}

async function joinByLink(page, code, nickname) {
  await page.goto(`${APP}/multiplayer/?mode=friends&code=${code}&nickname=${encodeURIComponent(nickname)}`, { waitUntil: "networkidle", timeout: 60000 })
  for (let i = 0; i < 40; i++) {
    if (page.__uid && memberIds(code).includes(page.__uid)) return
    await sleep(250)
  }
  await page.screenshot({ path: path.join(OUT, `echec-${code}.png`) }).catch(() => {})
  throw new Error(`${nickname} n'est pas entre dans ${code} (${page.url()})`)
}

const browser = await chromium.launch()
const opened = []
const open = async (opts, tag) => { const p = await newPage(browser, opts, tag, problems); opened.push(p); return p }

try {
  /* ---------- 1. Safari : 3 salles d'affilee ---------- */
  console.log("\n== 1. Safari, trois salles d'affilee ==")
  const safari = await open(IPHONE, "safari")
  const page = safari.page
  await page.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await page.locator("input:not([type=file])").first().fill(PSEUDO)
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !page.__uid; i++) await sleep(250)
  const me = page.__uid
  check(Boolean(me), `${PSEUDO} a une identite (joueur ${me})`)
  check(!(await page.getByText(/Tu es dans Snapchat/).count()), "aucune ligne Snapchat dans Safari")

  const rooms = [await newRoom(), await newRoom(), await newRoom()]
  for (const [i, code] of rooms.entries()) {
    await joinByLink(page, code, PSEUDO)
    check(memberIds(code).includes(me), `salle ${i + 1} (${code}) : toujours le joueur ${me}`)
  }
  await shot(page, "1-safari-troisieme-salle")
  const created = Number(psql(`SELECT count(*) FROM users WHERE username = '${PSEUDO}'`))
  check(created === 1, `un seul joueur ${PSEUDO} en base apres 3 salles (${created})`)

  // Changer de pseudo dans Mon compte, puis rejoindre : meme joueur.
  await page.goto(`${APP}/profile/`, { waitUntil: "networkidle", timeout: 60000 })
  const pseudoField = page.locator("#pseudo")
  await pseudoField.fill(`${PSEUDO}x`)
  await page.locator("#pseudo").press("Enter")
  const room4 = await newRoom()
  await joinByLink(page, room4, `${PSEUDO}x`)
  check(memberIds(room4).includes(me), "apres un changement de pseudo : toujours le meme joueur")

  /* ---------- 2. deux jours plus tard ---------- */
  console.log("\n== 2. Deux jours plus tard (cookie de 24 h parti) ==")
  const cookies = await safari.ctx.cookies()
  check(cookies.some(c => c.name === "blindify_session_token" && c.expires > Date.now() / 1000 + 300 * 86400),
    "le cookie blindify_session_token dure un an")
  await safari.ctx.clearCookies({ name: "blindify_session" })
  await page.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  const back = await meId(page)
  check(back?.id === me, `retour sans le cookie de 24 h : joueur ${back?.id}, attendu ${me}`)
  const days = Number(psql(`SELECT floor(extract(epoch FROM max(expires_at) - now()) / 86400) FROM user_sessions WHERE user_id = ${me}`))
  check(days >= 360, `echeance de la session en base : dans ${days} jours (avant T26 : 1)`)

  /* ---------- 3. Garder mes infos ---------- */
  console.log("\n== 3. Mon compte : Garder mes infos ==")
  await page.goto(`${APP}/profile/`, { waitUntil: "networkidle", timeout: 60000 })
  await page.getByText("Garder mes infos").first().waitFor({ timeout: 20000 })
  await page.locator("#keep-username").fill(PSEUDO)
  await shot(page, "3a-mon-compte-invite-garder-mes-infos")
  await page.locator("#keep-password").fill(PASSWORD)
  await page.getByRole("button", { name: "Garder mes infos" }).click()
  await page.getByText("Connecté en tant que", { exact: false }).waitFor({ timeout: 20000 })
  await shot(page, "3b-mon-compte-apres")
  const account = await meId(page)
  check(account?.id === me && account?.provider === "local", `meme joueur devenu compte (${account?.id}, ${account?.provider})`)
  const kept = Number(psql(`SELECT count(*) FROM room_participants WHERE user_id = ${me}`))
  check(kept >= 4, `ses salles restent a lui (${kept})`)

  /* ---------- 4. Snapchat ---------- */
  console.log("\n== 4. Le lien ouvert dans Snapchat ==")
  const snap = await open({ ...IPHONE, userAgent: SNAP_UA }, "snapchat")
  const sp = snap.page
  await sp.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  const note = sp.getByText(/Tu es dans Snapchat/)
  await note.waitFor({ timeout: 10000 }).catch(() => {})
  check(await note.isVisible().catch(() => false), "la ligne « Tu es dans Snapchat » s'affiche sur /jouer")
  await shot(sp, "4a-jouer-dans-snapchat")
  // Comme un vrai joueur : son pseudo d'abord (Snapchat ne connait pas celui de Safari).
  await sp.locator("input:not([type=file])").first().fill(PSEUDO)
  await sp.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !sp.__uid; i++) await sleep(250)
  const room5 = await newRoom()
  await joinByLink(sp, room5, PSEUDO)
  const snapGuest = sp.__uid
  check(snapGuest && snapGuest !== me, `Snapchat a ses propres cookies : invite a part (${snapGuest})`)
  // Une partie jouee par cet invite, comme le 05/11.
  psql(`WITH s AS (INSERT INTO game_sessions (mode, host_user_id) VALUES ('multiplayer', ${snapGuest}) RETURNING id)
        INSERT INTO game_participants (session_id, user_id, score) SELECT id, ${snapGuest}, 90 FROM s`)

  await sp.goto(`${APP}/auth/login/?returnTo=/profile/`, { waitUntil: "networkidle", timeout: 60000 })
  await shot(sp, "4b-connexion")
  await sp.locator('input[autocomplete="username"]').fill(PSEUDO)
  await sp.locator('input[type="password"]').fill(PASSWORD)
  await sp.locator('form button[type="submit"]').click()
  await sp.waitForURL(/\/profile\//, { timeout: 20000 })
  await sp.getByText("Connecté en tant que", { exact: false }).waitFor({ timeout: 20000 })
  await shot(sp, "4c-snapchat-connecte-mon-compte")
  const snapMe = await meId(sp)
  check(snapMe?.id === me, `dans Snapchat, connecte au compte ${me} (${snapMe?.id})`)
  const moved = Number(psql(`SELECT count(*) FROM game_participants WHERE user_id = ${me}`))
  const left = Number(psql(`SELECT count(*) FROM game_participants WHERE user_id = ${snapGuest}`))
  check(moved >= 1 && left === 0, `la partie jouee dans Snapchat rejoint le compte (compte ${moved}, invite ${left})`)
  const snapSessions = Number(psql(`SELECT count(*) FROM user_sessions WHERE user_id = ${snapGuest}`))
  check(snapSessions === 0, "l'invite de Snapchat n'a plus de session")
} catch (e) {
  problems.push(`arret : ${String(e?.message ?? e).slice(0, 300)}`)
  console.log(`[ECHEC] ${e?.stack ?? e}`)
} finally {
  for (const p of opened) await p.ctx.close().catch(() => {})
  await browser.close()
}

console.log(`\ncaptures : ${OUT}`)
if (problems.length) {
  console.log(`\n${problems.length} probleme(s) :\n- ${problems.join("\n- ")}`)
  process.exit(1)
}
console.log("\nPARCOURS T26 VERT")
