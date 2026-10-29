// T18 sur la pile : le mail de debut de partie et le lien spectateur.
//
//   campagne-ref.sh <ref> --script /chemin/absolu/tools/test-stack/mail-spectateur-e2e.mjs [dossier-captures]
//
// Le backend de test envoie ses mails au faux Resend du serveur local
// (NOTIF_PARTIE_TEST_BASE, stack.sh). On verifie :
//  1. une partie a 2 bots aux pseudos de vrais joueurs donne UN mail (mode,
//     pseudos, musique, lien spectateur), relance comprise ;
//  2. des comptes de test, ou Tym dans la salle : aucun mail ;
//  3. autour d'une table (presentateur + 2 joueurs) : un mail ;
//  4. dans un vrai navigateur : un joueur voit « 👀 1 spectateur » au lobby
//     puis en partie, le spectateur voit le lobby, la manche, la revelation et
//     le podium, jamais la reponse avant le reveal, et ne figure nulle part
//     dans les joueurs. Le badge disparait quand il part.
// Code 0 si tout passe, 1 sinon. Les captures vont dans le dossier donne.
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { chromium } from "@playwright/test"
import { Bot, api, rng } from "./bot.mjs"
import { oracle, psql, seedUser } from "./testdb.mjs"
import { runRoom } from "./room.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const STUB = "http://127.0.0.1:3180/resend-stub/mails"
const ENV_FILE = "/opt/blindify/.test-stack/run/backend.env"
const OUT = process.argv[2] || `/opt/blindify/.test-stack/logs/mail-spectateur-${Date.now()}`
fs.mkdirSync(OUT, { recursive: true })

const problems = []
const notes = []
const bad = m => { problems.push(m); console.log(`  ECHEC ${m}`) }
const ok = m => { notes.push(m); console.log(`  ok    ${m}`) }

const mails = async () => (await fetch(STUB)).json()
const clearMails = () => fetch(STUB, { method: "DELETE" })
async function waitMails(n, ms = 6000) {
  const until = Date.now() + ms
  let list = await mails()
  while (list.length < n && Date.now() < until) { await sleep(200); list = await mails() }
  return list
}
const plan = action => () => ({ action })

/** Jeton signe avec le secret de la pile, comme le backend (spectatorToken.ts). */
function signLink(code) {
  const env = fs.readFileSync(ENV_FILE, "utf8")
  const secret = env.match(/^SPECTATEUR_SECRET=(.+)$/m)?.[1]?.trim()
  if (!secret) throw new Error("SPECTATEUR_SECRET absent du backend de test")
  const id = Number(psql(`SELECT id FROM multiplayer_rooms WHERE room_code='${code}'`))
  const exp = Date.now() + 3 * 3600_000
  const sig = crypto.createHmac("sha256", secret).update(`blindz-spectateur:v1:${code}:${id}:${exp}`).digest("base64url")
  return `${APP}/spectateur/?salle=${code}&jeton=${encodeURIComponent(`${exp}.${sig}`)}`
}

async function botsMail() {
  console.log("1. Mails des parties jouees par des bots")
  await clearMails()
  const real = await runRoom({ label: "vrais", mode: "friends", players: [{ name: "Ana", plan: plan("juste") }, { name: "Bob", plan: plan("faux") }], rounds: 2, seconds: 5, seed: 18 })
  if (!real.ok) bad(`salle Ana/Bob : ${real.problems.join(" ; ")}`)
  let list = await waitMails(1)
  await sleep(800)
  list = await mails()
  if (list.length !== 1) bad(`Ana et Bob : ${list.length} mail(s), 1 attendu (relance comprise)`)
  else {
    const m = list[0]
    const want = ["Mode : À distance", "Joueurs (2) : Ana, Bob", "Musique :", `/spectateur/?salle=${real.code}&jeton=`]
    const missing = want.filter(w => !m.text.includes(w))
    if (missing.length) bad(`mail Ana/Bob incomplet : ${missing.join(", ")}`)
    else ok(`une partie a 2 vrais joueurs : 1 mail « ${m.subject} »`)
    if (oracle(real.code, 1)?.title && m.text.includes(oracle(real.code, 1).title)) bad("le mail cite un titre de la partie")
  }

  for (const [label, names] of [["comptes de test", ["Lea", "Max"]], ["Tym dans la salle", ["Tym", "Ana"]]]) {
    await clearMails()
    const r = await runRoom({ label, mode: "friends", players: names.map(n => ({ name: n, plan: plan("juste") })), rounds: 1, seconds: 5, seed: 19 })
    if (!r.ok) bad(`salle ${label} : ${r.problems.join(" ; ")}`)
    await sleep(1500)
    const got = await mails()
    if (got.length) bad(`${label} : ${got.length} mail(s), aucun attendu`)
    else ok(`${label} : aucun mail`)
  }

  await clearMails()
  const table = await runRoom({
    label: "table", mode: "event", hostPlays: false, rounds: 1, seconds: 5, seed: 20,
    players: [{ name: "Cleo", plan: plan("muet") }, { name: "Dora", plan: plan("juste") }, { name: "Eli", plan: plan("faux") }],
  })
  if (!table.ok) bad(`salle autour d'une table : ${table.problems.join(" ; ")}`)
  const tmail = await waitMails(1)
  if (tmail.length !== 1 || !tmail[0].text.includes("Mode : Autour d'une table") || !tmail[0].text.includes("Joueurs (3)")) {
    bad(`autour d'une table : ${tmail.length} mail(s), ou contenu inattendu`)
  } else ok("autour d'une table (presentateur + 2) : 1 mail, 3 personnes")
}

const badge = page => page.getByTestId("spectator-badge")

async function browserSpectator() {
  console.log("2. Spectateur dans un vrai navigateur")
  await clearMails()
  const browser = await chromium.launch()
  const host = new Bot({ name: "Gus", plan: plan("juste"), random: rng(181) })
  let spectator = null
  try {
    const player = await newPage(browser, { viewport: { width: 1280, height: 860 } }, "joueur", problems)
    await host.enter()
    seedUser(host.id, Array.from({ length: 8 }, (_, t) => t))
    const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "friends", questionCount: 2, nickname: host.name } })
    const code = created.data?.room?.room_code
    if (!code) throw new Error(`creation refusee (${created.status})`)
    await api(`/api/rooms/${code}/config`, { method: "POST", token: host.token, body: { questionCount: 2, roundSeconds: 8 } })
    host.code = code
    await host.connect()
    host.socket.emit("room:join", { roomCode: code })

    // Le joueur entre par l'interface, comme un vrai.
    const p = player.page
    await p.goto(`${APP}/jouer/?join=${code}`, { waitUntil: "networkidle", timeout: 60000 })
    await p.locator("input").first().fill("Fanny")
    await p.getByRole("button", { name: /continuer/i }).click()
    for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
    if (!p.__uid) throw new Error("Fanny : aucune identite creee")
    seedUser(p.__uid, Array.from({ length: 8 }, (_, t) => 8 + t))
    await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await p.locator("[data-code]").first().waitFor({ timeout: 30000 })
    await sleep(1500)
    if (await badge(p).isVisible().catch(() => false)) bad("badge spectateur visible alors que personne ne regarde")

    // Spectateur au lobby (lien signe avec le secret de la pile).
    spectator = await newPage(browser, { viewport: { width: 1280, height: 860 } }, "spectateur", problems)
    const s = spectator.page
    const frames = []
    spectator.page.on("websocket", ws => ws.on("framereceived", f => frames.push({ at: Date.now(), data: String(f.payload) })))
    await s.goto(signLink(code), { waitUntil: "networkidle", timeout: 60000 })
    await s.getByText("Mode spectateur").waitFor({ timeout: 20000 })
    await s.getByText("Salle d'attente").waitFor({ timeout: 20000 })
    for (const who of ["Gus", "Fanny"]) if (!(await s.getByText(who).first().isVisible().catch(() => false))) bad(`le spectateur ne voit pas ${who} au lobby`)
    await badge(p).waitFor({ timeout: 10000 }).then(() => ok("lobby : le joueur voit « 👀 1 spectateur »")).catch(() => bad("lobby : pas de badge spectateur chez le joueur"))
    if (!/1 spectateur/.test(await badge(p).innerText().catch(() => ""))) bad("badge : texte inattendu")
    await p.screenshot({ path: path.join(OUT, "1-joueur-lobby-badge.png") })
    await s.screenshot({ path: path.join(OUT, "2-spectateur-lobby.png") })

    // La partie part : un mail, avec un lien qui ouvre la meme vue.
    const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
    if (start.status >= 400) throw new Error(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`)
    const list = await waitMails(1)
    const link = list[0]?.text.match(/https?:\/\/\S+\/spectateur\/\?salle=\S+/)?.[0]
    if (list.length !== 1 || !link) bad(`partie Gus/Fanny : ${list.length} mail(s), lien ${link ? "present" : "absent"}`)
    else ok("partie lancee : 1 mail avec le lien spectateur")

    await s.getByText(/Manche 1 \/ 2/).waitFor({ timeout: 20000 }).then(() => ok("le spectateur voit la manche 1 / 2")).catch(() => bad("le spectateur ne voit pas la manche"))
    await badge(p).waitFor({ timeout: 10000 }).then(() => ok("en partie : le joueur voit « 👀 1 spectateur »")).catch(() => bad("en partie : pas de badge chez le joueur"))
    await sleep(2500)
    await p.screenshot({ path: path.join(OUT, "3-joueur-manche-badge.png") })
    await s.screenshot({ path: path.join(OUT, "4-spectateur-manche.png") })

    // Anti-triche : la page du spectateur ne montre pas la reponse avant le reveal.
    const truth = oracle(code, 1)
    const text1 = await s.evaluate(() => document.body.innerText)
    if (truth?.title && text1.includes(truth.title) && !/Révélation/.test(text1)) bad("le spectateur voit le titre avant la revelation")

    // Le lien du mail ouvre la meme vue (deuxieme onglet, 2 spectateurs).
    if (link) {
      const second = await newPage(browser, { viewport: { width: 900, height: 800 } }, "lien du mail", problems)
      await second.page.goto(link, { waitUntil: "networkidle", timeout: 60000 })
      await second.page.getByText(/Manche \d \/ 2/).waitFor({ timeout: 20000 }).then(() => ok("le lien du mail ouvre la vue spectateur")).catch(() => bad("le lien du mail n'ouvre pas la vue"))
      await p.getByText("2 spectateurs").waitFor({ timeout: 8000 }).then(() => ok("deux onglets : « 2 spectateurs »")).catch(() => bad("pas de « 2 spectateurs » chez le joueur"))
      await second.ctx.close()
      await p.getByText("1 spectateur").waitFor({ timeout: 8000 }).catch(() => bad("le compteur ne redescend pas a 1"))
    }

    await s.getByText("Révélation").waitFor({ timeout: 30000 })
    await sleep(800)
    await s.screenshot({ path: path.join(OUT, "5-spectateur-revelation.png") })
    if (truth?.title && !(await s.getByText(truth.title).first().isVisible().catch(() => false))) bad("revelation : le titre n'apparait pas chez le spectateur")
    else ok("revelation : le spectateur voit le titre")

    // Trames du spectateur : aucune ne porte le titre d'une manche avant son reveal.
    for (const r of [1, 2]) {
      const t = oracle(code, r)?.title
      if (!t) continue
      const revealIdx = frames.findIndex(f => f.data.includes("game:round:reveal") && f.data.includes(`"round":${r}`))
      const before = (revealIdx === -1 ? frames : frames.slice(0, revealIdx)).filter(f => f.data.includes(t))
      if (before.length) bad(`manche ${r} : le titre circule chez le spectateur avant le reveal (${before.length} trame(s))`)
    }

    await s.getByText("Podium").waitFor({ timeout: 60000 }).then(() => ok("le spectateur voit le podium")).catch(() => bad("pas de podium chez le spectateur"))
    await sleep(1500)
    await s.screenshot({ path: path.join(OUT, "6-spectateur-podium.png") })

    // Jamais dans les joueurs, ni en base.
    const inDb = psql(`SELECT count(*) FROM game_participants gp JOIN game_sessions g ON g.id=gp.session_id WHERE g.room_code='${code}'`)
    if (inDb !== "2") bad(`participants en base : ${inDb}, 2 attendus`)
    else ok("en base : 2 participants, pas de spectateur")

    await spectator.ctx.close()
    spectator = null
    await sleep(1500)
    if (await badge(p).isVisible().catch(() => false)) bad("le badge reste apres le depart du spectateur")
    else ok("le badge disparait quand le spectateur part")
    await p.screenshot({ path: path.join(OUT, "7-joueur-sans-spectateur.png") })
  } finally {
    if (spectator) await spectator.ctx.close().catch(() => {})
    host.socket?.close()
    await browser.close()
  }
}

async function expiredLink() {
  console.log("3. Lien falsifie")
  const browser = await chromium.launch()
  try {
    const page = await newPage(browser, { viewport: { width: 900, height: 700 } }, "lien falsifie", problems)
    await page.page.goto(`${APP}/spectateur/?salle=ABCDEF&jeton=1893456000000.${"A".repeat(43)}`, { waitUntil: "networkidle" })
    await page.page.getByText("Lien invalide").waitFor({ timeout: 15000 }).then(() => ok("lien falsifie : « Lien invalide »")).catch(() => bad("lien falsifie : pas de message d'erreur"))
    await page.page.screenshot({ path: path.join(OUT, "8-lien-invalide.png") })
  } finally {
    await browser.close()
  }
}

try {
  await botsMail()
  await browserSpectator()
  await expiredLink()
} catch (e) {
  bad(`exception : ${e?.stack || e}`)
}
console.log(`\nCaptures : ${OUT}`)
console.log(problems.length ? `ECHEC : ${problems.length} probleme(s)` : `OK : ${notes.length} controles`)
process.exit(problems.length ? 1 : 0)
