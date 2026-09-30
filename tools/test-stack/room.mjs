// Une salle complete jouee par des bots, puis jugee contre la base de test.
//
//   runRoom({ mode, hostPlays, players, rounds, seconds, seed, late })
//
// players : [{ name, plan: round => ({ action, deco?, quitte? }) }]
// L'hote est le premier de la liste (presentateur si mode event sans hostPlays).
// Rend { label, code, ok, problems, stats } ; ne jette jamais : une salle qui
// plante est un verdict, pas une exception qui arreterait la campagne.
import { Bot, api, rng } from "./bot.mjs"
import { seedUser, sessionFacts } from "./testdb.mjs"

const sleep = ms => new Promise(r => setTimeout(r, ms))
const EXPECTED = { juste: "correct", proche: "close", faux: "wrong" }

export async function runRoom({ label, mode, hostPlays = false, players, rounds = 5, seconds = 10, seed = 1, late = null, tracksEach = 8 }) {
  const problems = []
  const bad = m => problems.push(m)
  const random = rng(seed)
  const bots = players.map((p, i) => new Bot({
    name: p.name, plan: p.plan, random: rng(seed * 31 + i),
    isPresenter: i === 0 && mode === "event" && !hostPlays,
  }))
  const [host] = bots
  const stats = { mode, hostPlays, joueurs: bots.length, manches: rounds, secondes: seconds, seed }
  let code = null
  const t0 = Date.now()
  try {
    // --- mise en place ---
    await Promise.all(bots.map(b => b.enter()))
    bots.forEach((b, i) => seedUser(b.id, Array.from({ length: tracksEach }, (_, t) => i * tracksEach + t)))
    const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode, questionCount: rounds, hostPlays, nickname: host.name } })
    code = created.data?.room?.room_code
    if (!code) throw new Error(`creation refusee (${created.status} ${JSON.stringify(created.error)})`)
    const cfg = await api(`/api/rooms/${code}/config`, { method: "POST", token: host.token, body: { questionCount: rounds, roundSeconds: seconds } })
    if (cfg.status >= 400) bad(`reglages refuses (${cfg.status})`)
    host.code = code
    await host.connect()
    host.socket.emit("room:join", { roomCode: code })
    for (const b of bots.slice(1)) {
      const j = await b.join(code)
      if (!j.ok) bad(`${b.name} ne peut pas entrer (${j.status} ${j.code})`)
    }
    const ids = bots.filter(b => !b.isPresenter).map(b => b.id)
    for (const b of bots) b.others = ids.filter(id => id !== b.id)
    await sleep(800)

    // --- partie ---
    const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
    if (start.status >= 400) throw new Error(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`)
    stats.lancee_en_ms = Date.now() - t0

    // Retardataire : il tente d'entrer en pleine partie (refus attendu), puis
    // re-essaie a la fin comme l'ecran d'attente du client.
    let lateBot = null
    if (late) {
      lateBot = new Bot({ name: late.name, plan: () => ({ action: "juste" }), random: rng(seed * 7) })
      await lateBot.enter()
      seedUser(lateBot.id, [40, 41, 42, 43])
      await sleep(late.afterMs ?? 15000)
      const early = await lateBot.join(code)
      if (early.ok) bad(`${late.name} est entre en pleine partie (attendu : refus room_in_progress)`)
      else stats.retardataire_refus = early.code || early.status
    }

    const budget = rounds * (seconds + 12) * 1000 + 30000
    const active = () => bots.filter(b => !b.left && !b.isPresenter)
    while (Date.now() - t0 < budget && !bots.every(b => b.over || b.left)) await sleep(500)
    stats.duree_s = Math.round((Date.now() - t0) / 1000)
    if (!active().every(b => b.over)) bad(`pas de fin de partie pour : ${active().filter(b => !b.over).map(b => b.name).join(", ")}`)

    if (lateBot) {
      await sleep(1500)
      const after = await lateBot.join(code)
      if (!after.ok) bad(`${late.name} ne peut toujours pas entrer apres la partie (${after.status} ${after.code})`)
      else stats.retardataire_entre = true
      lateBot.close()
    }

    // --- verdict contre la base ---
    await sleep(2000) // persistance asynchrone des reponses
    const facts = sessionFacts(code)
    if (!facts) throw new Error("aucune session en base")
    if (facts.manches !== rounds) bad(`${facts.manches} manches tirees au lieu de ${rounds}`)
    if (facts.state !== "finished") bad(`session en etat "${facts.state}" au lieu de finished`)
    if (facts.roomStatus !== "finished") bad(`salle en etat "${facts.roomStatus}" au lieu de finished`)
    const rowOf = (uid, r) => facts.reponses.find(x => x.userId === uid && x.round === r)
    let verifiees = 0
    for (const b of bots) {
      if (b.isPresenter) {
        if (facts.reponses.some(x => x.userId === b.id)) bad(`le presentateur ${b.name} a des reponses en base`)
        continue
      }
      for (const [r, it] of b.intents) {
        const row = rowOf(b.id, r)
        const want = EXPECTED[it.action]
        if (it.lost) continue
        if (!want) {
          // Le serveur ecrit une ligne "sans reponse" pour qui n'a rien envoye a
          // temps : elle est normale, mais sans texte, fausse et a zero point.
          if (row && (row.answered || row.verdict !== "wrong" || row.delta !== 0)) {
            bad(`${b.name} manche ${r} (${it.action}) : une reponse a ete comptee (${row.verdict}, ${row.delta} pt)`)
          }
          if (it.action === "lent" && it.ack?.ok) bad(`${b.name} manche ${r} : reponse en retard acceptee`)
          verifiees++
          continue
        }
        if (!it.ack?.ok) { bad(`${b.name} manche ${r} (${it.action}) : reponse refusee (${it.ack?.reason})`); continue }
        if (!row) { bad(`${b.name} manche ${r} (${it.action}) : aucune ligne en base`); continue }
        if (row.verdict !== want) bad(`${b.name} manche ${r} : verdict ${row.verdict}, attendu ${want}`)
        if (row.sourceOwner != null && it.sourceGuess != null) {
          const wantSrc = row.sourceOwner === it.sourceGuess
          if (row.sourceCorrect !== wantSrc) bad(`${b.name} manche ${r} : devinette jugee ${row.sourceCorrect}, attendu ${wantSrc}`)
        }
        verifiees++
      }
      if (b.leaks.length) bad(`${b.name} a vu la reponse avant la revelation (${b.leaks.map(l => `m${l.round} ${l.evt}`).join(", ")})`)
      for (const e of b.errors) bad(`${b.name} : ${e}`)
    }
    const partis = bots.filter(b => b.left)
    for (const b of partis) if (!facts.participants.some(p => p.userId === b.id)) bad(`${b.name} (parti en cours) a disparu des participants`)
    stats.reponses_verifiees = verifiees
    stats.reponses_en_base = facts.reponses.length
    stats.verdicts = facts.reponses.reduce((a, x) => ({ ...a, [x.verdict]: (a[x.verdict] || 0) + 1 }), {})
  } catch (e) {
    bad(`arret : ${e.message}`)
  } finally {
    for (const b of bots) b.close()
  }
  return { label: label || mode, code, ok: problems.length === 0, problems, stats }
}

/** Plans tout faits. */
export const plans = {
  toujours: action => () => ({ action }),
  melange: (seed, poids = { juste: 0.35, proche: 0.2, faux: 0.25, muet: 0.1, lent: 0.1 }) => {
    const r = rng(seed)
    const cumul = Object.entries(poids).reduce((acc, [k, w]) => [...acc, [k, (acc.at(-1)?.[1] ?? 0) + w]], [])
    const memo = new Map()
    return round => {
      if (!memo.has(round)) { const x = r(); memo.set(round, { action: cumul.find(([, c]) => x <= c)?.[0] ?? "faux" }) }
      return memo.get(round)
    }
  },
  avec: (base, extras) => round => ({ ...base(round), ...(extras[round] || {}) }),
}
