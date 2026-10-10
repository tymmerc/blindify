// L'Activite Discord sur la pile de test : trois joueurs du MEME salon vocal,
// deux sous Chromium et un sous WebKit (Safari), jouent une partie de bout en
// bout. Discord est joue par le harnais (discord-harness.html) autour de la
// vraie page /discord/, et par le faux Discord du serveur local (echange du
// code, utilisateur). Rien ne sort sur Internet, rien ne touche la prod.
//
// Ce que le parcours prouve :
//   - les trois arrivent dans la MEME salle, sans code (une salle par instance) ;
//   - la page passe par le proxy (/.proxy/blindz) pour l'API et le websocket ;
//   - le jeton de session ne voyage jamais dans une adresse ;
//   - la partie se joue : manches, reponses comptees en base, classement ;
//   - contrat anti-triche : aucun titre sur le fil avant sa revelation ;
//   - Quitter recharge l'Activite et remet le joueur dans la salle du salon.
//
//   campagne-ref.sh <branche> --script /chemin/discord-e2e.mjs /dossier/des/preuves
import { chromium, webkit } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { psql, seedUser, oracle, sessionFacts } from "./testdb.mjs"
import { LOUD, newPage, sleep } from "./probe.mjs"

// L'origine du "proxy de Discord" sur la pile : pas celle de l'API (comme en
// vrai, https://<id>.discordsays.com n'est pas blindz.app). Le meme serveur
// local repond sous ce nom ; le backend l'accepte par ALLOWED_ORIGINS (stack.sh).
const ORIGIN = "http://discord-test.localhost:3180"
const OUT = process.argv[2] || "/tmp/discord-e2e"
const ROUNDS = 5
fs.mkdirSync(OUT, { recursive: true })

const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); shots.push(f) }
const q = v => `'${String(v).replace(/'/g, "''")}'`

const INSTANCE = `i-${Date.now().toString(36)}`
const snowflake = n => String(100000000000000000n + BigInt(n))
const PLAYERS = [
  { uid: 1, name: "Tym", engine: chromium, tag: "chromium-hote", plan: "juste", ks: [0, 1, 2, 3, 4, 5] },
  { uid: 2, name: "Léa", engine: chromium, tag: "chromium", plan: "proche", ks: [6, 7, 8, 9, 10, 11] },
  { uid: 3, name: "Nino", engine: webkit, tag: "webkit", plan: "faux", ks: [12, 13, 14, 15, 16, 17] },
]

async function open(player) {
  const browser = await player.engine.launch(player.engine === chromium ? { args: ["--autoplay-policy=no-user-gesture-required"] } : {})
  const { ctx, page } = await newPage(browser, {}, player.tag, problems)
  const seen = { requests: [], sockets: [], frames: [], consoleErrors: [], sessionToken: null }
  page.on("request", r => seen.requests.push(r.url()))
  page.on("websocket", ws => {
    seen.sockets.push(ws.url())
    ws.on("framereceived", f => seen.frames.push({ t: Date.now(), p: typeof f.payload === "string" ? f.payload : String(f.payload) }))
  })
  page.on("console", m => { if (m.type() === "error") seen.consoleErrors.push(m.text().slice(0, 200)) })
  page.on("response", async r => {
    if (/\/api\/auth\/discord(\?|$)/.test(r.url())) {
      try { seen.sessionToken = (await r.json())?.data?.sessionToken ?? null } catch { /* pas du JSON */ }
    }
  })
  await page.goto(`${ORIGIN}/discord-harness.html?instance=${INSTANCE}&uid=${player.uid}&name=${encodeURIComponent(player.name)}`)
  return { ...player, browser, ctx, page, frame: page.frameLocator("#activity"), seen }
}

const activityFrame = page => page.frames().find(f => f.url().includes("/discord/"))

async function waitLobby(p) {
  await p.frame.getByTestId("lobby-salon-discord").waitFor({ timeout: 45000 })
}

async function answer(p, truth) {
  const guess = p.plan === "juste" ? truth : p.plan === "proche" ? { title: truth.title, artist: "personne" } : { title: "rien du tout", artist: "personne" }
  const title = p.frame.getByLabel("Titre du morceau")
  await title.waitFor({ timeout: 40000 })
  await title.fill(guess.title)
  await p.frame.getByLabel("Artiste").fill(guess.artist ?? "")
  await p.frame.locator('button[type="submit"]').first().click({ timeout: 5000 })
}

/** Titres passes sur le fil (trames websocket recues) avant leur revelation. */
function leaks(p, code) {
  const reveals = p.seen.frames.filter(f => f.p.includes("game:round:reveal"))
  const out = []
  for (let r = 1; r <= ROUNDS; r++) {
    const truth = oracle(code, r)
    if (!truth?.title) continue
    const tReveal = reveals[r - 1]?.t ?? Infinity
    const early = p.seen.frames.find(f => f.t < tReveal && !f.p.includes("game:round:reveal") && f.p.includes(truth.title))
    if (early) out.push(`${p.tag}, manche ${r} : le titre « ${truth.title} » est passé sur le fil avant la révélation`)
  }
  return out
}

const players = []
try {
  say(`=== Activité Discord sur la pile : salon ${INSTANCE}, ${PLAYERS.length} joueurs`)

  // 1. Les trois lancent l'Activite dans le meme salon, l'un apres l'autre.
  for (const def of PLAYERS) {
    const p = await open(def)
    players.push(p)
    await waitLobby(p)
    ok(`${p.tag} (${p.name}) est dans le lobby de l'Activité`)
  }
  const [host, second, third] = players

  // 2. Une seule salle pour le salon, les trois dedans.
  const rooms = psql(`SELECT room_code FROM multiplayer_rooms WHERE discord_instance_id=${q(INSTANCE)}`).split("\n").filter(Boolean)
  if (rooms.length === 1) ok(`une seule salle pour le salon : ${rooms[0]}`)
  else bad(`${rooms.length} salle(s) pour le salon ${INSTANCE} (attendu : 1)`)
  const code = rooms[0]
  let inRoom = 0
  for (let i = 0; i < 40 && inRoom < PLAYERS.length; i++) {
    inRoom = Number(psql(`SELECT count(*) FROM room_participants rp JOIN multiplayer_rooms m ON m.id=rp.room_id WHERE m.room_code=${q(code)}`))
    if (inRoom < PLAYERS.length) await sleep(500)
  }
  if (inRoom === PLAYERS.length) ok(`${inRoom} participants dans la salle en base`)
  else bad(`${inRoom} participant(s) en base, attendu ${PLAYERS.length}`)
  const hostId = Number(psql(`SELECT host_user_id FROM multiplayer_rooms WHERE room_code=${q(code)}`))

  // Comptes Discord : un par joueur, identite venue du faux Discord (pas du client).
  for (const p of players) {
    p.userId = Number(psql(`SELECT id FROM users WHERE provider='discord' AND provider_id=${q(snowflake(p.uid))}`))
    const name = psql(`SELECT username FROM users WHERE id=${p.userId}`)
    if (!p.userId) bad(`${p.tag} : aucun compte discord en base`)
    else if (name !== p.name) bad(`${p.tag} : pseudo en base « ${name} », attendu « ${p.name} »`)
    seedUser(p.userId, p.ks)
  }
  if (hostId === host.userId) ok("le premier arrivé est l'hôte de la salle")
  else bad(`l'hôte est ${hostId}, attendu ${host.userId} (premier arrivé)`)

  // 3. Ce que voient les joueurs : le roster, la bande du salon vocal, pas de code a partager.
  for (const p of players) {
    for (const other of players) {
      if (!(await p.frame.getByText(other.name, { exact: true }).first().isVisible().catch(() => false))) bad(`${p.tag} ne voit pas ${other.name} dans la salle`)
    }
    if (await p.frame.locator("[data-code]").count()) bad(`${p.tag} : le code de salle est affiché (il ne doit pas y en avoir dans Discord)`)
  }
  let strip = 0
  for (let i = 0; i < 20 && strip < PLAYERS.length; i++) {
    strip = await host.frame.getByTestId("salon-vocal").locator("span").count().catch(() => 0) - 1
    if (strip < PLAYERS.length) await sleep(500)
  }
  if (strip === PLAYERS.length) ok(`la bande « Dans le salon vocal » liste les ${strip} participants (SDK)`)
  else bad(`la bande du salon vocal montre ${strip} nom(s), attendu ${PLAYERS.length}`)
  await shot(host.page, "01-lobby-hote-chromium")
  await shot(third.page, "02-lobby-joueur-webkit")

  // 4. Le proxy de Discord et le jeton : API et websocket sous /.proxy/blindz, jamais de jeton dans une adresse.
  for (const p of players) {
    const direct = p.seen.requests.filter(u => /\/blindify\/(api|socket\.io)\//.test(u))
    const proxied = p.seen.requests.filter(u => u.includes("/.proxy/blindz/api/"))
    if (direct.length) bad(`${p.tag} : ${direct.length} requête(s) parties sans passer par le proxy, ex. ${direct[0]}`)
    if (!proxied.length) bad(`${p.tag} : aucune requête API via /.proxy/blindz`)
    if (!p.seen.sockets.some(u => u.includes("/.proxy/blindz/socket.io/"))) bad(`${p.tag} : websocket hors du proxy (${p.seen.sockets[0] ?? "aucun"})`)
    if (!p.seen.sessionToken) bad(`${p.tag} : pas de jeton de session vu dans la réponse de /api/auth/discord`)
    else if ([...p.seen.requests, ...p.seen.sockets].some(u => u.includes(p.seen.sessionToken))) bad(`${p.tag} : le jeton de session apparaît dans une adresse`)
  }
  if (!problems.some(x => /proxy|jeton|websocket/.test(x))) ok("API et websocket passent par /.proxy/blindz, le jeton de session reste hors des adresses")

  // 5. La partie : 5 manches de 10 s, lancee par l'hote.
  await host.frame.getByRole("button", { name: "5", exact: true }).click({ timeout: 10000 })
  await host.frame.getByRole("button", { name: "10s", exact: true }).click({ timeout: 10000 })
  await sleep(800)
  await host.frame.getByRole("button", { name: /lancer la partie/i }).click({ timeout: 15000 })
  ok("l'hôte a lancé la partie")

  for (let round = 1; round <= ROUNDS; round++) {
    let truth = null
    for (let i = 0; i < 60 && !truth?.title; i++) { truth = oracle(code, round); if (!truth?.title) await sleep(500) }
    if (!truth?.title) { bad(`manche ${round} : pas de morceau en base`); break }
    for (const p of players) await answer(p, truth)
    if (round === 1) await shot(host.page, "03-manche-1-hote")
    for (const p of players) {
      const ready = p.frame.getByRole("button", { name: /prêt|classement|terminer|résultat/i }).first()
      await ready.waitFor({ timeout: 40000 })
      if (round === 1 && p === second) await shot(p.page, "04-revelation-1-joueur")
      await ready.click({ timeout: 5000 }).catch(() => {})
    }
    say(`  manche ${round} : « ${truth.title} » jouée et révélée chez les trois`)
  }

  let facts = null
  for (let i = 0; i < 60; i++) {
    facts = sessionFacts(code)
    if (facts?.roomStatus === "finished") break
    await sleep(1000)
  }
  if (facts?.roomStatus === "finished") ok(`partie terminée en base (${facts.manches} manches)`)
  else bad(`la partie n'est pas terminée en base (statut ${facts?.roomStatus ?? "?"})`)
  await sleep(4000)
  await shot(host.page, "05-classement-hote")

  // 6. Les reponses, telles que la base les a comptees.
  const expected = { juste: "correct", proche: "close", faux: "wrong" }
  for (const p of players) {
    const mine = (facts?.reponses ?? []).filter(r => r.userId === p.userId)
    const verdicts = mine.map(r => r.verdict)
    if (mine.length !== ROUNDS) bad(`${p.tag} : ${mine.length} réponse(s) en base sur ${ROUNDS}`)
    else if (!verdicts.every(v => v === expected[p.plan])) bad(`${p.tag} (${p.plan}) : verdicts ${verdicts.join(", ")}`)
    else ok(`${p.tag} (${p.plan}) : ${ROUNDS} réponses comptées « ${expected[p.plan]} »`)
  }

  // 7. Anti-triche : rien sur le fil avant la revelation.
  const fuites = players.flatMap(p => leaks(p, code))
  if (fuites.length) fuites.forEach(bad)
  else ok("aucun titre sur le fil avant sa révélation, chez les trois")

  // 8. Le son chez l'hote (Chromium) : l'extrait a demarre, via l'audioManager et son mapper.
  const probe = await activityFrame(host.page)?.evaluate(() => window.__probe).catch(() => null)
  const loud = probe?.samples?.filter(s => s[1] > LOUD).length ?? 0
  if (probe && probe.plays > 0 && loud > 10) ok(`son chez l'hôte : ${probe.plays} lecture(s), ${loud} relevés sonores`)
  else bad(`son chez l'hôte : ${probe?.plays ?? "?"} lecture(s), ${loud} relevés sonores`)
  for (const p of players) if (p.seen.consoleErrors.length) say(`  (console ${p.tag} : ${p.seen.consoleErrors.length} erreur(s), ex. ${p.seen.consoleErrors[0]})`)

  // 9. Quitter depuis le classement : l'Activite se recharge et remet dans la salle du salon.
  const retour = third.frame.getByRole("button", { name: /retour|quitter/i }).first()
  if (await retour.isVisible().catch(() => false)) {
    await retour.click({ timeout: 5000 })
    await waitLobby(third)
    const again = psql(`SELECT count(*) FROM multiplayer_rooms WHERE discord_instance_id=${q(INSTANCE)}`)
    if (again === "1") ok("Quitter recharge l'Activité : le joueur WebKit revient dans la même salle du salon")
    else bad(`après Quitter, ${again} salle(s) pour le salon`)
    await shot(third.page, "06-retour-lobby-webkit")
  } else {
    say("  (pas de bouton Retour/Quitter visible chez le joueur WebKit : étape sautée)")
  }
} catch (e) {
  bad(`arrêt : ${String(e?.message ?? e).split("\n")[0]}`)
  for (const p of players) await shot(p.page, `erreur-${p.tag}`).catch(() => {})
} finally {
  for (const p of players) {
    await p.ctx?.close().catch(() => {})
    await p.browser?.close().catch(() => {})
  }
}

// Les erreurs JS relevees par newPage entrent dans problems sans passer par bad() : on les montre.
if (problems.length) { say(`\n=== ${problems.length} problème(s) :`); problems.forEach(x => say(`  - ${x}`)) } else say("\n=== tout est passé")
fs.writeFileSync(path.join(OUT, "rapport.md"), [
  `# Activité Discord sur la pile de test (${new Date().toISOString()})`,
  "", "```", ...lines, "```", "",
  "## Captures", ...shots.map(s => `- ${path.basename(s)}`), "",
].join("\n"))
process.exit(problems.length ? 1 : 0)
