// Reprise d'une partie apres un plantage du serveur (ADR-001, etape 5), sur la
// pile isolee, avec le vrai backend construit et le Redis de test.
//
//   STACK_DEPS=ci STACK_REDIS_URL=redis://127.0.0.1:6391 \
//     tools/test-stack/campagne-ref.sh feat/redis --script /chemin/absolu/reprise-redis-e2e.mjs
//
// Une salle « a distance » : un vrai navigateur (telephone) et trois bots, 3
// manches de 25 s. En manche 2, l'hote et Alice repondent, puis le backend est
// tue (KILL, comme un plantage) et relance. On verifie :
//   - tout le monde revient, navigateur compris, et la duree de la coupure ;
//   - la manche 2 reprend avec le temps qu'il lui restait a la derniere copie
//     (plus la grace de reprise de 5 s), et se revele a cette heure-la ;
//   - les reponses donnees avant le plantage comptent, Bruno repond apres ;
//   - la partie va au bout, les points de fin = la somme des points en base,
//     aucune reponse en double, les stats de chacun comptees une seule fois.
// Code de sortie 0 si tout est conforme, 1 sinon.
import { createRequire } from "node:module"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Les outils et leurs dependances vivent dans le depot, pas dans le worktree.
const T = "/opt/blindify/tools/test-stack"
const { Bot, api, rng } = await import(`${T}/bot.mjs`)
const { oracle, psql, seedUser } = await import(`${T}/testdb.mjs`)
const { APP, newPage } = await import(`${T}/probe.mjs`)
const { chromium, devices } = createRequire(`${T}/browser.mjs`)("@playwright/test")
const Redis = createRequire("/opt/blindify/backend/package.json")("ioredis")
// Le stack.sh qui a monte la pile (celui de ce dossier : backend-kill / backend-start).
const STACK = path.join(path.dirname(fileURLToPath(import.meta.url)), "stack.sh")
const REDIS_URL = process.env.STACK_REDIS_URL || "redis://127.0.0.1:6391"
// Le prefixe que stack.sh donne au backend de la pile.
const KEY_PREFIX = "blindz:pile-test:"
const RESTART_GRACE_MS = 5_000
const ROUND_S = 25
const run = promisify(execFile)
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)))
const problems = []
const bad = m => { problems.push(m); console.log(`  !! ${m}`) }
const ok = m => console.log(`  [ok] ${m}`)
const s = ms => `${(ms / 1000).toFixed(1)} s`

async function until(predicate, timeoutMs, label) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (predicate()) return true
    await sleep(50)
  }
  bad(`delai depasse : ${label}`)
  return false
}

function answer(bot, code, round) {
  const truth = oracle(code, round)
  return new Promise(resolve => bot.socket.timeout(5000).emit("game:answer",
    { roomCode: code, guessTitle: truth.title, guessArtist: truth.artist, sourceUserId: truth.ownerId, round },
    (err, res) => resolve(err ? { ok: false, reason: "timeout" } : res)))
}

/** Le bot revient comme le client web : il retente, puis room:join et game:sync. */
function keepAlive(bot, code, log) {
  const watch = socket => socket.on("disconnect", async () => {
    if (bot.left || bot.over) return
    log.down = log.down ?? Date.now()
    for (;;) {
      await sleep(500)
      bot.socket = null
      try { await bot.connect(); break } catch { /* backend encore absent */ }
    }
    log.connected = Date.now()
    watch(bot.socket)
    bot.socket.on("game:state", st => {
      if (!log.state && st?.currentRound) { log.state = Date.now(); log.stateAfter = st }
      if (!log.watchBack && log.watchId && st?.players?.[log.watchId]?.disconnected === false) log.watchBack = Date.now()
    })
    bot.socket.on("room:presence", p => { if (p?.type === "joined") log.joins.push({ at: Date.now(), userId: p.user?.id }) })
    bot.socket.emit("room:join", { roomCode: code })
    bot.socket.emit("game:sync", { roomCode: code })
  })
  watch(bot.socket)
}

async function wizard(page, name, join) {
  await page.goto(`${APP}/jouer/?join=${join}`, { waitUntil: "networkidle", timeout: 60000 })
  await page.locator("input:not([type=file])").first().fill(name)
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !page.__uid; i++) await sleep(250)
  if (!page.__uid) throw new Error(`${name} : aucune identite creee`)
}

/** Repond dans le navigateur comme un humain (formulaire « a distance »). */
async function answerInPage(page, truth, ownerName) {
  const t = page.getByPlaceholder("Titre du morceau")
  if (!(await t.isVisible().catch(() => false))) return false
  await t.fill(truth.title)
  await page.getByPlaceholder("Tape ici...").fill(truth.artist).catch(() => {})
  if (ownerName) await page.getByRole("button", { name: new RegExp(ownerName) }).first().click({ timeout: 2000 }).catch(() => {})
  await page.locator('button[type="submit"]').first().click({ timeout: 3000 }).catch(() => {})
  return true
}

const usernameOf = id => psql(`SELECT username FROM users WHERE id = ${Number(id)}`)

async function main() {
  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  await redis.connect()
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
  const plan = round => ({ action: round === 2 ? "muet" : "juste" })
  const names = ["Hote", "Alice", "Bruno"]
  const bots = names.map((name, i) => new Bot({ name, plan, random: rng(5151 + i) }))
  const [host, alice, bruno] = bots
  let tel = null
  try {
    await Promise.all(bots.map(b => b.enter()))
    bots.forEach((b, i) => seedUser(b.id, Array.from({ length: 6 }, (_, t) => i * 6 + t)))
    const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "friends", questionCount: 3, nickname: host.name } })
    const code = created.data?.room?.room_code
    if (!code) throw new Error(`creation refusee (${created.status} ${JSON.stringify(created.error)})`)
    const cfg = await api(`/api/rooms/${code}/config`, { method: "POST", token: host.token, body: { questionCount: 3, roundSeconds: ROUND_S } })
    if (cfg.status >= 400) throw new Error(`reglages refuses (${cfg.status})`)
    host.code = code
    await host.connect()
    host.socket.emit("room:join", { roomCode: code })
    for (const b of [alice, bruno]) {
      const j = await b.join(code)
      if (!j.ok) throw new Error(`${b.name} ne peut pas entrer (${j.status} ${j.code})`)
    }
    console.log(`salle ${code}`)

    tel = await newPage(browser, { ...devices["iPhone 13"] }, "telephone", problems)
    const page = tel.page
    await wizard(page, "Distant", code)
    seedUser(page.__uid, [18, 19, 20, 21, 22, 23])
    await page.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await page.locator("[data-code]").first().waitFor({ timeout: 30000 })
    const ids = [...bots.map(b => b.id), page.__uid]
    for (const b of bots) b.others = ids.filter(id => id !== b.id)
    await sleep(2000)

    const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
    if (start.status >= 400) throw new Error(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`)

    // Manche 1 : tout le monde repond juste, le telephone par l'ecran.
    await until(() => host.rounds.has(1), 30_000, "debut de la manche 1")
    await sleep((host.timeline[1]?.startAt ?? Date.now()) - Date.now() + 2_000)
    const t1 = oracle(code, 1)
    if (!(await answerInPage(page, t1, t1?.ownerId ? usernameOf(t1.ownerId) : null))) bad("manche 1 : pas de champ de reponse sur le telephone")
    await until(() => host.reveals.has(1), ROUND_S * 1000 + 10_000, "revelation de la manche 1")

    // Manche 2 : l'hote et Alice repondent, puis le serveur plante.
    await until(() => host.rounds.has(2), 30_000, "debut de la manche 2")
    await sleep((host.timeline[2]?.startAt ?? Date.now()) - Date.now() + 1_500)
    const early = await Promise.all([answer(host, code, 2), answer(alice, code, 2)])
    if (!early.every(a => a?.ok)) bad(`manche 2 : reponse refusee avant le plantage (${JSON.stringify(early)})`)
    await sleep(800)
    const copy = JSON.parse((await redis.get(`${KEY_PREFIX}game:state:${code}`)) ?? "null")
    if (!copy) throw new Error("aucune copie dans Redis avant le plantage")
    const before = copy.game.state
    if (before.currentRound !== 2 || before.phase !== "GUESSING") bad(`copie : manche ${before.currentRound} ${before.phase}, attendu 2 GUESSING`)
    if (!before.players[host.id]?.hasAnswered || !before.players[alice.id]?.hasAnswered) bad("copie : les reponses de l'hote et d'Alice n'y sont pas")
    ok(`copie lue : manche 2, ${s(before.timing.revealAt - copy.savedAt)} restantes a la copie`)

    const logs = new Map(bots.map(b => [b, { joins: [], watchId: page.__uid }]))
    for (const b of bots) keepAlive(b, code, logs.get(b))
    const tKill = Date.now()
    await run(STACK, ["backend-kill"])
    await run(STACK, ["backend-start"], { timeout: 120_000 })
    const tUp = Date.now()
    ok(`backend relance, sante OK ${s(tUp - tKill)} apres le KILL`)

    await until(() => bots.every(b => logs.get(b).state), 30_000, "retour des trois bots")
    const after = logs.get(host).stateAfter
    if (!after || after.currentRound !== 2 || after.phase !== "GUESSING") bad(`apres la reprise : manche ${after?.currentRound} ${after?.phase}, attendu 2 GUESSING`)
    // Temps rendu : revealAt' = revealAt + (reprise - savedAt) + grace, la reprise
    // ayant lieu entre le KILL et la sante OK.
    const gained = (after?.timing?.revealAt ?? 0) - before.timing.revealAt - RESTART_GRACE_MS
    if (gained < tKill - copy.savedAt - 50 || gained > tUp - copy.savedAt + 50) {
      bad(`decalage de la manche : ${gained} ms, attendu entre ${tKill - copy.savedAt} et ${tUp - copy.savedAt}`)
    } else ok(`manche 2 decalee de ${s(gained)} + ${s(RESTART_GRACE_MS)} de grace : il reste ${s(after.timing.revealAt - Date.now())}`)

    // Bruno repond apres la reprise ; le telephone ne repond pas : la manche
    // va jusqu'a son heure (sinon elle serait revelee en avance).
    const late = await answer(bruno, code, 2)
    if (!late?.ok) bad(`manche 2 : la reponse de Bruno apres la reprise est refusee (${JSON.stringify(late)})`)
    await until(() => host.reveals.has(2), ROUND_S * 1000 + 20_000, "revelation de la manche 2")
    const revealedAt = host.timeline[2]?.revealAt
    if (revealedAt && after?.timing?.revealAt) {
      const gap = revealedAt - after.timing.revealAt
      if (Math.abs(gap) > 1_500) bad(`manche 2 revelee a ${gap} ms de son heure rendue`)
      else ok(`manche 2 revelee a l'heure rendue (ecart ${gap} ms)`)
    }
    // Retour du navigateur : son room:join (presence), sinon le premier etat
    // ou il n'est plus marque coupe.
    const telJoin = [...logs.values()].flatMap(l => [...l.joins.filter(j => j.userId === page.__uid).map(j => j.at), l.watchBack])
      .filter(Boolean).sort((a, b) => a - b)[0]
    for (const b of bots) {
      const l = logs.get(b)
      console.log(`  coupure vue par ${b.name} : ${s((l.state ?? 0) - (l.down ?? tKill))} (deconnecte -> etat de la partie recu)`)
    }
    if (telJoin) console.log(`  coupure vue par le telephone : ${s(telJoin - tKill)} (KILL -> retour du navigateur dans la salle)`)
    else bad("le retour du telephone dans la salle n'a pas ete vu")

    // Manche 3 : tout le monde, telephone compris (il est bien revenu).
    await until(() => host.rounds.has(3), 40_000, "debut de la manche 3")
    await sleep((host.timeline[3]?.startAt ?? Date.now()) - Date.now() + 2_000)
    const t3 = oracle(code, 3)
    if (!(await answerInPage(page, t3, t3?.ownerId ? usernameOf(t3.ownerId) : null))) bad("manche 3 : pas de champ de reponse sur le telephone apres la reprise")
    await until(() => host.over, ROUND_S * 1000 + 30_000, "fin de partie")
    await sleep(3_000)

    // La base de test.
    const sid = Number(psql(`SELECT session_id FROM multiplayer_rooms WHERE room_code='${code}'`))
    const dup = psql(`SELECT count(*) - count(DISTINCT (r.round_id, r.user_id)) FROM round_responses r JOIN game_rounds gr ON gr.id = r.round_id WHERE gr.session_id = ${sid}`)
    if (dup !== "0") bad(`${dup} reponse(s) en double en base`)
    else ok("aucune reponse en double en base")
    const verdicts = psql(`SELECT gr.round_index || ':' || r.user_id || ':' || coalesce(r.verdict, '') FROM round_responses r
      JOIN game_rounds gr ON gr.id = r.round_id WHERE gr.session_id = ${sid} ORDER BY 1`).split("\n").filter(Boolean)
    const has = (round, id) => verdicts.includes(`${round}:${id}:correct`)
    for (const b of bots) for (const round of [1, 2, 3]) if (!has(round, b.id)) bad(`manche ${round} : la reponse juste de ${b.name} n'est pas comptee`)
    for (const round of [1, 3]) if (!has(round, page.__uid)) bad(`manche ${round} : la reponse juste du telephone n'est pas comptee`)
    // Chaque joueur a une ligne par manche revelee ; celle du telephone en
    // manche 2 doit etre vide (il n'a rien tape).
    const telRound2 = psql(`SELECT (r.guess_title IS NOT NULL OR r.guess_artist IS NOT NULL)::text FROM round_responses r
      JOIN game_rounds gr ON gr.id = r.round_id WHERE gr.session_id = ${sid} AND gr.round_index = 2 AND r.user_id = ${page.__uid}`)
    if (telRound2 === "true") bad("manche 2 : une reponse du telephone en base alors qu'il n'a pas repondu")
    const state = psql(`SELECT state FROM game_sessions WHERE id = ${sid}`)
    if (state !== "finished") bad(`session ${sid} : etat ${state}, attendu finished`)
    const finalScores = host.overPlayers ?? {}
    for (const id of ids) {
      const sum = Number(psql(`SELECT coalesce(sum(r.score_delta), 0) FROM round_responses r JOIN game_rounds gr ON gr.id = r.round_id WHERE gr.session_id = ${sid} AND r.user_id = ${id}`))
      const final = finalScores[id]?.score
      if (final !== sum) bad(`joueur ${id} : ${final} points en fin de partie, ${sum} en base`)
      const games = psql(`SELECT total_games FROM user_stats WHERE user_id = ${id}`)
      if (games !== "1") bad(`joueur ${id} : ${games || 0} partie(s) dans ses stats, attendu 1`)
    }
    if (!problems.length) ok("points de fin = points en base, une partie dans les stats de chacun")
  } finally {
    for (const b of bots) { b.left = true; b.close() }
    await tel?.ctx.close().catch(() => {})
    await browser.close().catch(() => {})
    await redis.quit().catch(() => {})
  }
}

try {
  await main()
} catch (e) {
  bad(`arret : ${String(e?.message ?? e).split("\n")[0]}`)
}
console.log(problems.length ? `ECHEC : ${problems.length} probleme(s)` : "OK : la partie a repris et fini sans perte")
process.exit(problems.length ? 1 : 0)
