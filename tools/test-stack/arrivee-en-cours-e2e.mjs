// Arriver pendant une partie (T19, decision de Tym du 29/10/2026), sur la
// pile de test, avec de vrais navigateurs :
//
//   1. A distance : trois joueurs (bots), un retardataire sur ordinateur qui
//      entre pendant la manche 2. Il voit la vue d'attente, la manche 2 est
//      revelee sans l'attendre, il joue la manche 3, son score est en base.
//   2. Autour d'une table : l'ecran central (presentateur) sur ordinateur,
//      trois joueurs (bots), un retardataire sur telephone. L'ecran central le
//      voit arriver, l'ajoute au classement a la manche suivante, et ne le
//      compte pas comme spectateur.
//
// Dans les deux cas, toutes les trames recues par la page du retardataire
// sont relues : jamais la reponse d'une manche avant sa revelation.
//
//   campagne-ref.sh <branche> --script /chemin/arrivee-en-cours-e2e.mjs /dossier/des/preuves
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, api, rng } from "./bot.mjs"
import { oracle, psql, seedUser } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/arrivee-en-cours-e2e"
fs.mkdirSync(OUT, { recursive: true })
const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); shots.push(f) }
// Un choix du lobby (5, 10, 15, 20). 10 : le navigateur peut mettre 15 s a
// entrer, l'arrivee ne doit jamais tomber sur la derniere manche.
const ROUNDS = 10

async function wizard(page, name, code) {
  await page.goto(`${APP}/jouer/?join=${code}`, { waitUntil: "networkidle", timeout: 60000 })
  await page.locator("input").first().fill(name)
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !page.__uid; i++) await sleep(250)
  if (!page.__uid) throw new Error(`${name} : aucune identite creee`)
}

/** Toutes les trames socket.io recues par la page, dans l'ordre. */
function recordFrames(page) {
  const frames = []
  page.on("websocket", ws => ws.on("framereceived", f => {
    const text = typeof f.payload === "string" ? f.payload : ""
    const m = /^42(\[.*)$/s.exec(text)
    if (!m) return
    try { const [event, payload] = JSON.parse(m[1]); frames.push({ event, payload, text }) } catch { /* trame non JSON */ }
  }))
  return frames
}

/** Contrat anti-triche : avant le reveal de la manche N, aucune trame ne porte son titre. */
function leaks(frames, code) {
  const revealed = new Set()
  const out = []
  for (const f of frames) {
    if (f.event === "game:round:reveal") revealed.add(Number(f.payload?.round))
    if (f.event === "game:over" || f.payload?.phase === "FINISHED") for (let r = 1; r <= ROUNDS; r++) revealed.add(r)
    // Etat d'une manche deja revelee (resynchro) : c'est la revelation.
    if (f.event === "game:state" && f.payload?.phase === "REVEAL") revealed.add(Number(f.payload?.currentRound))
    for (let r = 1; r <= ROUNDS; r++) {
      const title = oracle(code, r)?.title
      if (!revealed.has(r) && title && f.text.includes(title)) out.push(`${f.event} donne le titre de la manche ${r}`)
    }
  }
  return out
}

async function answer(page, truth) {
  const byLabel = page.getByLabel("Titre du morceau")
  const t = (await byLabel.isVisible().catch(() => false)) ? byLabel : page.getByPlaceholder("Titre du morceau")
  await t.waitFor({ timeout: 15000 })
  await t.fill(truth.title)
  const artistLabel = page.getByLabel("Artiste")
  const a = (await artistLabel.isVisible().catch(() => false)) ? artistLabel : page.getByPlaceholder("Tape ici...")
  await a.fill(truth.artist).catch(() => {})
  await page.locator('button[type="submit"]').first().click({ timeout: 3000 }).catch(() => {})
}

function players(seed, base) {
  return ["Alma", "Basile", "Cyril"].map((name, i) =>
    new Bot({ name, plan: () => ({ action: "juste" }), random: rng(seed + base + i) }))
}

async function enterBots(bots, code, from) {
  for (const [i, b] of bots.entries()) {
    if (!b.id) await b.enter()
    seedUser(b.id, Array.from({ length: 8 }, (_, t) => from + 8 * i + t))
    if (b.code === code && b.socket) continue
    const j = await b.join(code)
    if (!j.ok) bad(`${b.name} ne peut pas entrer (${j.status})`)
  }
  const ids = bots.map(b => b.id)
  for (const b of bots) b.others = ids.filter(id => id !== b.id)
}

async function waitRound(bot, round, ms = 60000) {
  const until = Date.now() + ms
  while (Date.now() < until && !(bot.current?.round === round && !bot.reveals.has(round))) await sleep(200)
  if (bot.current?.round !== round) throw new Error(`la manche ${round} n'a pas commence`)
}

/** Le retardataire entre, regarde, puis joue. Rend son identifiant. */
async function lateJoinerPlays({ page, code, lead, tag }) {
  const waiting = page.getByTestId("late-joiner-view")
  await waiting.waitFor({ timeout: 30000 })
  ok(`${tag} : vue d'attente affichee`)
  const banner = await page.getByTestId("late-joiner-title").innerText()
  if (!/tu joues dès la prochaine manche/i.test(banner)) bad(`${tag} : bandeau inattendu « ${banner} »`)
  if (await page.getByLabel("Titre du morceau").isVisible().catch(() => false)) bad(`${tag} : un champ de reponse est visible pendant l'attente`)
  // Sa manche d'arrivee, lue sur SON ecran (le bot meneur a pu avancer depuis
  // le clic) : elle se joue sans lui, revelee avant la fin du chrono.
  const label = (await page.getByText(/Manche \d+ \/ \d+/).first().textContent()) ?? ""
  const watched = Number(/Manche (\d+)/i.exec(label)?.[1])
  if (!watched) throw new Error(`${tag} : manche affichee illisible (« ${label} »)`)
  const until = Date.now() + 30000
  while (Date.now() < until && !lead.reveals.has(watched)) await sleep(200)
  const t = lead.timeline[watched]
  if (!t?.revealAt) bad(`${tag} : la manche ${watched} n'a pas ete revelee`)
  else if (t.plannedReveal && t.revealAt > t.plannedReveal - 500) bad(`${tag} : la manche ${watched} a attendu le chrono (revelation anticipee bloquee ?)`)
  else ok(`${tag} : manche ${watched} revelee en avance, sans l'attendre`)
  // Manche suivante : l'ecran de jeu prend la place, tout seul.
  await waitRound(lead, watched + 1)
  await waiting.waitFor({ state: "detached", timeout: 15000 })
  ok(`${tag} : passage tout seul a l'ecran de jeu a la manche ${watched + 1}`)
  await sleep(2500)
  await answer(page, oracle(code, watched + 1))
  return watched
}

function judgeDb(code, uid, watched, tag) {
  const own = psql(`SELECT count(*) FILTER (WHERE gr.round_index <= ${watched}), count(*) FILTER (WHERE r.verdict = 'correct')
    FROM round_responses r JOIN game_rounds gr ON gr.id = r.round_id JOIN multiplayer_rooms m ON m.session_id = gr.session_id
    WHERE m.room_code = '${code}' AND r.user_id = ${Number(uid)}`).split("|").map(Number)
  if (own[0] > 0) bad(`${tag} : ${own[0]} ligne(s) en base pour des manches qu'il regardait`)
  if (own[1] < 1) bad(`${tag} : sa reponse juste de la manche ${watched + 1} n'est pas en base`)
  const score = psql(`SELECT coalesce(max(gp.score)::text, 'absent') FROM game_participants gp JOIN multiplayer_rooms m ON m.session_id = gp.session_id
    WHERE m.room_code = '${code}' AND gp.user_id = ${Number(uid)}`)
  if (score === "absent") bad(`${tag} : pas de ligne game_participants, score perdu`)
  else if (Number(score) < 2) bad(`${tag} : score ${score} en base, attendu au moins 2`)
  else ok(`${tag} : score ${score} en base (game_participants)`)
}

/* ------------------------------------------------------------------ */
async function remote(browser) {
  say("\n== 1. A distance : retardataire sur ordinateur ==")
  const bots = players(11, 0)
  const [host] = bots
  let late = null
  try {
    await host.enter()
    const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "friends", questionCount: ROUNDS, nickname: host.name } })
    const code = created.data?.room?.room_code
    if (!code) throw new Error(`creation refusee (${created.status})`)
    await api(`/api/rooms/${code}/config`, { method: "POST", token: host.token, body: { questionCount: ROUNDS, roundSeconds: 15 } })
    host.code = code; await host.connect(); host.socket.emit("room:join", { roomCode: code })
    await enterBots(bots, code, 0)
    await sleep(800)
    const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
    if (start.status >= 400) throw new Error(`lancement refuse (${start.status})`)
    await waitRound(host, 2)

    late = await newPage(browser, { viewport: { width: 1440, height: 900 } }, "retardataire (bureau)", problems)
    const p = late.page
    const frames = recordFrames(p)
    await wizard(p, "Retard", code)
    seedUser(p.__uid, [40, 41, 42, 43])
    await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await p.getByTestId("late-joiner-view").waitFor({ timeout: 30000 })
    await sleep(1200)
    await shot(p, "distance-1-attente-bureau")
    const watched = await lateJoinerPlays({ page: p, code, lead: host, tag: "a distance" })
    await sleep(1500)
    await shot(p, "distance-2-en-jeu-bureau")
    const until = Date.now() + 120000
    while (Date.now() < until && !bots.every(b => b.over)) await sleep(500)
    if (!bots.every(b => b.over)) bad("a distance : la partie ne s'est pas terminee")
    await sleep(2500)
    judgeDb(code, p.__uid, watched, "a distance")
    const l = leaks(frames, code)
    if (l.length) bad(`a distance : fuite avant revelation (${l.slice(0, 3).join(", ")})`)
    else ok(`a distance : ${frames.length} trames relues, aucune reponse avant sa revelation`)
    for (const b of bots) if (b.leaks.length) bad(`${b.name} a vu une reponse avant la revelation`)
  } catch (e) {
    bad(`a distance, arret : ${e.message.split("\n")[0]}`)
    if (late) await shot(late.page, "distance-erreur").catch(() => {})
  } finally {
    for (const b of bots) b.close()
    await late?.ctx.close().catch(() => {})
  }
}

/* ------------------------------------------------------------------ */
async function table(browser) {
  say("\n== 2. Autour d'une table : retardataire sur telephone ==")
  const bots = players(23, 10)
  let screen = null, phone = null
  try {
    screen = await newPage(browser, { viewport: { width: 1440, height: 900 } }, "ecran central", problems)
    const s = screen.page
    await s.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
    await s.locator("input").first().fill("Ecran")
    await s.getByRole("button", { name: /continuer/i }).click()
    for (let i = 0; i < 40 && !s.__uid; i++) await sleep(250)
    seedUser(s.__uid, [24, 25, 26, 27, 28, 29, 30, 31])
    await s.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
    await s.getByText("Créer une partie").click()
    await s.waitForURL(/\/modes/, { timeout: 30000 })
    await s.getByText("Autour d'une table").first().click()
    await s.getByText("Je présente seulement").click({ timeout: 30000 })
    await s.getByText("Code de la salle").waitFor({ timeout: 30000 })
    const code = await s.locator("[data-code]").first().getAttribute("data-code")
    await enterBots(bots, code, 0)
    await sleep(2500)
    await s.getByRole("button", { name: String(ROUNDS), exact: true }).click()
    await s.getByRole("button", { name: "15s", exact: true }).click()
    await sleep(500)
    await s.getByRole("button", { name: /lancer la partie/i }).click()
    const [lead] = bots
    await waitRound(lead, 2)

    phone = await newPage(browser, { ...devices["iPhone 13"] }, "retardataire (telephone)", problems)
    const p = phone.page
    const frames = recordFrames(p)
    await wizard(p, "Retard", code)
    seedUser(p.__uid, [44, 45, 46, 47])
    await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await p.getByTestId("late-joiner-view").waitFor({ timeout: 30000 })
    // L'ecran central le voit arriver, sans le compter comme spectateur.
    const told = await s.getByText("Retard arrive et joue dès la prochaine manche.").waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
    if (told) ok("table : l'ecran central annonce l'arrivee")
    else bad("table : l'ecran central n'annonce pas l'arrivee")
    await shot(s, "table-1-ecran-annonce")
    if (/spectateur/i.test(await s.evaluate(() => document.body.innerText))) bad("table : l'ecran central compte le retardataire comme spectateur")
    await sleep(800)
    await shot(p, "table-2-attente-telephone")
    const watched = await lateJoinerPlays({ page: p, code, lead, tag: "table" })
    await sleep(1500)
    await shot(p, "table-3-telephone-en-jeu")
    // Le classement existe en deux exemplaires selon la largeur (colonne ou
    // liste du bas) : on juge le texte reellement affiche (innerText ignore ce
    // qui est cache), puis on fait defiler jusqu'a lui pour la capture.
    const shown = await s.evaluate(() => [...document.querySelectorAll("*")].some(el =>
      el.childElementCount === 0 && el.textContent?.trim() === "Retard" && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"))
    if (shown) ok(`table : l'ecran central l'affiche au classement a la manche ${watched + 1}`)
    else bad(`table : l'ecran central ne l'affiche pas a la manche ${watched + 1}`)
    await shot(s, "table-4-ecran-manche-suivante")
    await s.evaluate(() => {
      const el = [...document.querySelectorAll("*")].find(n => n.childElementCount === 0 && n.textContent?.trim() === "Retard" && n.getClientRects().length > 0)
      el?.scrollIntoView({ block: "center" })
    })
    await sleep(500)
    await shot(s, "table-5-ecran-classement")
    const until = Date.now() + 120000
    while (Date.now() < until && !bots.every(b => b.over)) await sleep(500)
    if (!bots.every(b => b.over)) bad("table : la partie ne s'est pas terminee")
    await sleep(2500)
    judgeDb(code, p.__uid, watched, "table")
    const l = leaks(frames, code)
    if (l.length) bad(`table : fuite avant revelation (${l.slice(0, 3).join(", ")})`)
    else ok(`table : ${frames.length} trames relues, aucune reponse avant sa revelation`)
  } catch (e) {
    bad(`table, arret : ${e.message.split("\n")[0]}`)
    if (phone) await shot(phone.page, "table-erreur-telephone").catch(() => {})
    if (screen) await shot(screen.page, "table-erreur-ecran").catch(() => {})
  } finally {
    for (const b of bots) b.close()
    await phone?.ctx.close().catch(() => {})
    await screen?.ctx.close().catch(() => {})
  }
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
try {
  await remote(browser)
  await table(browser)
} finally {
  await browser.close()
}
say(`\n${problems.length ? `ECHEC : ${problems.length} probleme(s)` : "OK : arrivee en cours de partie verte"}`)
fs.writeFileSync(path.join(OUT, "rapport.txt"), `${lines.join("\n")}\n\ncaptures :\n${shots.join("\n")}\n`)
process.exit(problems.length ? 1 : 0)
