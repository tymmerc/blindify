// Grace de reconnexion (decision de Tym du 02/10/2026) sur la pile isolee, avec
// la vraie duree (5 s) et le vrai backend construit : un joueur coupe du
// reseau alors que tous les autres ont deja repondu.
//
//   tools/test-stack/campagne-ref.sh <branche> --script /chemin/absolu/grace-coupure.mjs
//
// Une salle "a distance" de 4 bots, 3 manches de 25 s. A chaque manche, les
// trois autres repondent juste, puis le 4e :
//   manche 1  coupe et revient 3 s plus tard : la manche l'attend, sa reponse compte
//   manche 2  coupe et revient 8 s plus tard : revelation 5 s apres la coupure, pas avant
//   manche 3  clique "Quitter" : revelation immediate, sans grace
// Puis la base : une ligne par joueur et par manche, verdicts attendus.
// Code de sortie 0 si tout est conforme, 1 sinon.
import { Bot, api, rng } from "./bot.mjs"
import { oracle, seedUser, sessionFacts } from "./testdb.mjs"

const GRACE_MS = 5_000
const ROUND_S = 25
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)))
const problems = []
const bad = m => { problems.push(m); console.log(`  !! ${m}`) }
const ok = m => console.log(`  [ok] ${m}`)

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

/** Les trois autres repondent juste, apres le depart de la musique (comme un humain). */
async function othersAnswer(others, host, code, round) {
  await until(() => host.rounds.has(round), 40_000, `debut de la manche ${round}`)
  await sleep((host.timeline[round]?.startAt ?? Date.now()) - Date.now() + 1_500)
  const acks = await Promise.all(others.map(b => answer(b, code, round)))
  if (!acks.every(a => a?.ok)) bad(`manche ${round} : reponse refusee (${JSON.stringify(acks)})`)
}

async function comeBack(bot, code) {
  bot.socket = null
  await bot.connect()
  bot.socket.emit("room:join", { roomCode: code })
  bot.socket.emit("game:sync", { roomCode: code })
}

async function setup() {
  const names = ["Hote", "Alice", "Bruno", "Coupure"]
  const bots = names.map((name, i) => new Bot({ name, plan: () => ({ action: "muet" }), random: rng(4242 + i) }))
  await Promise.all(bots.map(b => b.enter()))
  bots.forEach((b, i) => seedUser(b.id, Array.from({ length: 6 }, (_, t) => i * 6 + t)))
  const [host] = bots
  const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "friends", questionCount: 3, nickname: host.name } })
  const code = created.data?.room?.room_code
  if (!code) throw new Error(`creation refusee (${created.status} ${JSON.stringify(created.error)})`)
  const cfg = await api(`/api/rooms/${code}/config`, { method: "POST", token: host.token, body: { questionCount: 3, roundSeconds: ROUND_S } })
  if (cfg.status >= 400) throw new Error(`reglages refuses (${cfg.status})`)
  host.code = code
  await host.connect()
  host.socket.emit("room:join", { roomCode: code })
  for (const b of bots.slice(1)) {
    const j = await b.join(code)
    if (!j.ok) throw new Error(`${b.name} ne peut pas entrer (${j.status} ${j.code})`)
  }
  for (const b of bots) b.others = bots.map(x => x.id).filter(id => id !== b.id)
  await sleep(800)
  const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
  if (start.status >= 400) throw new Error(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`)
  return { bots, host, cut: bots[3], others: bots.slice(0, 3), code }
}

async function roundBackInTime({ host, cut, others, code }) {
  console.log("manche 1 : coupure de 3 s, il revient et repond")
  await othersAnswer(others, host, code, 1)
  const cutAt = Date.now()
  cut.socket.disconnect()
  await sleep(3_000)
  await comeBack(cut, code)
  // Bien apres la fin de sa grace : il est revenu, la manche l'attend toujours.
  await sleep(cutAt + GRACE_MS + 1_500 - Date.now())
  if (host.reveals.has(1)) bad("manche 1 revelee alors que le joueur coupe etait revenu a temps")
  else ok(`manche 1 toujours en jeu ${Math.round((Date.now() - cutAt) / 100) / 10} s apres la coupure (il est revenu)`)
  const answeredAt = Date.now()
  const ack = await answer(cut, code, 1)
  if (!ack?.ok) bad(`manche 1 : sa reponse au retour est refusee (${ack?.reason})`)
  if (await until(() => host.reveals.has(1), 5_000, "revelation de la manche 1 apres sa reponse")) {
    const after = host.timeline[1].revealAt - answeredAt
    if (after < 0) bad("manche 1 revelee avant sa reponse")
    else ok(`manche 1 revelee ${after} ms apres sa reponse`)
  }
}

async function roundTooLate({ host, cut, others, code }) {
  console.log("manche 2 : coupure de 8 s, la manche n'attend que 5 s")
  await othersAnswer(others, host, code, 2)
  const cutAt = Date.now()
  cut.socket.disconnect()
  if (await until(() => host.reveals.has(2), 12_000, "revelation de la manche 2 apres la grace")) {
    const dt = host.timeline[2].revealAt - cutAt
    if (dt < GRACE_MS - 200 || dt > GRACE_MS + 2_500) bad(`manche 2 revelee ${dt} ms apres la coupure (attendu : environ ${GRACE_MS} ms)`)
    else ok(`manche 2 revelee ${dt} ms apres la coupure`)
  }
  await sleep(cutAt + 8_000 - Date.now())
  await comeBack(cut, code)
}

async function roundQuit({ host, cut, others, code }) {
  console.log("manche 3 : il clique sur Quitter")
  await othersAnswer(others, host, code, 3)
  const quitAt = Date.now()
  await cut.quit()
  if (await until(() => host.reveals.has(3), 2_500, "revelation de la manche 3 apres Quitter")) {
    const dt = host.timeline[3].revealAt - quitAt
    if (dt > 1_500) bad(`manche 3 revelee ${dt} ms apres Quitter (attendu : tout de suite)`)
    else ok(`manche 3 revelee ${dt} ms apres Quitter`)
  }
}

function judgeDatabase({ bots, cut, code }) {
  const facts = sessionFacts(code)
  if (!facts) { bad("aucune session en base"); return }
  if (facts.state !== "finished") bad(`session en etat "${facts.state}" au lieu de finished`)
  if (facts.reponses.length !== bots.length * 3) bad(`${facts.reponses.length} lignes de reponses au lieu de ${bots.length * 3}`)
  const row = (uid, r) => facts.reponses.find(x => x.userId === uid && x.round === r)
  for (const b of bots.filter(x => x !== cut)) {
    for (const r of [1, 2, 3]) if (row(b.id, r)?.verdict !== "correct") bad(`${b.name} manche ${r} : verdict ${row(b.id, r)?.verdict}`)
  }
  const back = row(cut.id, 1)
  if (back?.verdict !== "correct" || !back?.answered) bad(`reponse du joueur revenu a temps : ${JSON.stringify(back)}`)
  else ok("sa reponse de la manche 1 est en base, jugee juste")
  for (const r of [2, 3]) {
    const empty = row(cut.id, r)
    if (!empty || empty.answered || empty.delta !== 0) bad(`manche ${r}, joueur absent : ${JSON.stringify(empty)}`)
  }
  if (!facts.participants.some(p => p.userId === cut.id)) bad("le joueur parti a disparu des participants")
  ok(`base : ${facts.reponses.length} lignes, session ${facts.state}`)
}

const t0 = Date.now()
let table = null
try {
  table = await setup()
  console.log(`salle ${table.code}`)
  await roundBackInTime(table)
  await roundTooLate(table)
  await roundQuit(table)
  await until(() => table.others.every(b => b.over), 30_000, "fin de partie")
  await sleep(2_000) // ecritures en base lancees sans attendre
  judgeDatabase(table)
  for (const b of table.bots) {
    if (b.leaks.length) bad(`${b.name} a vu la reponse avant la revelation (${JSON.stringify(b.leaks)})`)
    for (const e of b.errors) bad(`${b.name} : ${e}`)
  }
} catch (e) {
  bad(`arret : ${e.message}`)
} finally {
  for (const b of table?.bots ?? []) b.close()
}
console.log(`\n${problems.length ? "GRACE : ROUGE" : "GRACE : VERTE"} en ${Math.round((Date.now() - t0) / 1000)} s${problems.length ? ` (${problems.length} probleme(s))` : ""}`)
process.exit(problems.length ? 1 : 0)
