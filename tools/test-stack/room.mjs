// Une salle complete jouee par des bots, puis jugee contre la base de test.
//
//   runRoom({ mode, hostPlays, players, rounds, seconds, seed, late })
//
// players : [{ name, plan: round => ({ action, deco?, quitte? }) }]
// L'hote est le premier de la liste (presentateur si mode event sans hostPlays).
// Rend { label, code, ok, problems, stats } ; ne jette jamais : une salle qui
// plante est un verdict, pas une exception qui arreterait la campagne.
import { Bot, api, rng } from "./bot.mjs"
import { seedUser, sessionFacts, oracle, psql } from "./testdb.mjs"

const sleep = ms => new Promise(r => setTimeout(r, ms))
const EXPECTED = { juste: "correct", proche: "close", faux: "wrong" }

/** Manches dont le titre (unique au catalogue) apparait dans une reponse de /start. */
function startLeaks(code, res) {
  const raw = JSON.stringify(res.data ?? "")
  const total = Number(res.data?.session?.totalRounds) || 0
  const out = []
  for (let r = 1; r <= total; r++) {
    const truth = oracle(code, r)
    if (truth?.title && raw.includes(truth.title)) out.push(r)
  }
  return out
}

export async function runRoom({ label, mode, hostPlays = false, players, rounds = 5, seconds = 10, seed = 1, late = null, tracksEach = 8, expectAbsent = null }) {
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
    // Anti-triche cote REST : la reponse HTTP du lancement arrive chez l'hote,
    // qui joue souvent lui aussi. Elle ne doit porter aucun titre de la partie,
    // pas plus que celle d'une relance en pleine partie (double clic, 2e onglet).
    const startLeak = startLeaks(code, start)
    if (startLeak.length) bad(`la reponse HTTP du lancement donne a l'hote les titres des manches ${startLeak.join(", ")}`)
    const again = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
    if (again.status >= 400) bad(`relance pendant la partie refusee (${again.status} ${JSON.stringify(again.error)})`)
    else {
      const againLeak = startLeaks(code, again)
      if (againLeak.length) bad(`une relance pendant la partie donne a l'hote les titres des manches ${againLeak.join(", ")}`)
    }

    // Retardataire (T19) : il entre en pleine partie, regarde la manche en
    // cours sans pouvoir y repondre, puis joue a partir de la suivante.
    let lateBot = null
    if (late) {
      lateBot = new Bot({ name: late.name, plan: () => ({ action: "juste" }), random: rng(seed * 7), watchFromState: true })
      await lateBot.enter()
      seedUser(lateBot.id, [40, 41, 42, 43])
      await sleep(late.afterMs ?? 15000)
      const early = await lateBot.join(code)
      if (!early.ok) bad(`${late.name} refuse en pleine partie (${early.status} ${early.code}), attendu : il regarde puis joue`)
      else {
        stats.retardataire_en_cours = early.lateJoin
        if (!early.lateJoin) bad(`${late.name} : la reponse du join ne dit pas qu'il arrive en cours de partie`)
        await sleep(400)
        const refused = await lateBot.answerNow(0)
        if (refused?.reason !== "waiting") bad(`${late.name} : reponse pendant l'attente ${JSON.stringify(refused)}, attendu un refus "waiting"`)
      }
    }
    const budget = rounds * (seconds + 12) * 1000 + 30000
    const active = () => bots.filter(b => !b.left && !b.isPresenter)
    while (Date.now() - t0 < budget && !bots.every(b => b.over || b.left)) await sleep(500)
    stats.duree_s = Math.round((Date.now() - t0) / 1000)
    if (!active().every(b => b.over)) bad(`pas de fin de partie pour : ${active().filter(b => !b.over).map(b => b.name).join(", ")}`)

    if (lateBot) {
      await sleep(1500)
      const after = await lateBot.join(code)
      if (!after.ok) bad(`${late.name} ne peut pas revenir apres la partie (${after.status} ${after.code})`)
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
      if (b.leaks.length) bad(`${b.name} a vu la reponse avant la revelation (${b.leaks.map(l => `m${l.round} ${l.quoi} dans ${l.evt}`).join(", ")})`)
      for (const e of b.errors) bad(`${b.name} : ${e}`)
    }
    if (lateBot) {
      try { judgeLateBot(lateBot, facts, bad, stats) } finally { lateBot.close() }
    }
    const partis = bots.filter(b => b.left)
    for (const b of partis) if (!facts.participants.some(p => p.userId === b.id)) bad(`${b.name} (parti en cours) a disparu des participants`)
    if (expectAbsent) judgeAbsents(bots, expectAbsent, bad, stats)
    stats.reponses_verifiees = verifiees
    // Joueurs revenus d'une coupure apres la revelation de leur manche : ils
    // n'ont pas repondu (comme le client web), on les compte pour les voir.
    stats.revelees_pendant_coupure = bots.reduce((n, b) => n + [...b.intents.values()].filter(i => i.revealedWhileAway).length, 0)
    stats.reponses_en_base = facts.reponses.length
    stats.verdicts = facts.reponses.reduce((a, x) => ({ ...a, [x.verdict]: (a[x.verdict] || 0) + 1 }), {})
  } catch (e) {
    bad(`arret : ${e.message}`)
  } finally {
    for (const b of bots) b.close()
  }
  return { label: label || mode, code, ok: problems.length === 0, problems, stats }
}

/**
 * Le retardataire (T19) : aucune ligne pour les manches regardees, ses
 * reponses comptees a partir de la manche suivante, son score dans
 * game_participants, et jamais la reponse avant la revelation.
 */
function judgeLateBot(b, facts, bad, stats) {
  const watched = [...(b.watched ?? [])]
  const played = [...b.intents.keys()]
  stats.retardataire_manches = { regardees: watched, jouees: played }
  // Entre pendant un reveal, il n'a regarde aucune manche en cours : rien a
  // juger cote anti-triche, ce n'est pas un echec (le rapport le montre).
  if (!played.length) bad(`${b.name} n'a joue aucune manche apres son arrivee`)
  for (const r of watched) {
    if (facts.reponses.some(x => x.userId === b.id && x.round === r)) bad(`${b.name} : une ligne en base pour la manche ${r}, qu'il regardait`)
  }
  for (const r of played) {
    const it = b.intents.get(r)
    if (it.lost) continue
    if (!it.ack?.ok) { bad(`${b.name} manche ${r} : reponse refusee apres son arrivee (${it.ack?.reason})`); continue }
    const row = facts.reponses.find(x => x.userId === b.id && x.round === r)
    if (row?.verdict !== "correct") bad(`${b.name} manche ${r} : verdict ${row?.verdict}, attendu correct`)
  }
  const mine = facts.participants.find(p => p.userId === b.id)
  if (!mine) bad(`${b.name} absent de game_participants : son score est perdu`)
  else {
    const fromRows = facts.reponses.filter(x => x.userId === b.id).reduce((n, x) => n + x.delta, 0)
    if (mine.score !== fromRows) bad(`${b.name} : score ${mine.score} en base, ${fromRows} d'apres ses manches`)
    stats.retardataire_score = mine.score
  }
  if (b.leaks.length) bad(`${b.name} a vu la reponse avant la revelation (${b.leaks.map(l => `m${l.round} ${l.quoi} dans ${l.evt}`).join(", ")})`)
  for (const e of b.errors) bad(`${b.name} : ${e}`)
}

/**
 * Joueurs absents (T22) : au classement de fin recu par un joueur reste
 * jusqu'au bout, les partis sont toujours la, marques absents, et les autres non.
 */
function judgeAbsents(bots, expectAbsent, bad, stats) {
  const final = bots.find(b => !b.left && !b.isPresenter && b.overPlayers)?.overPlayers
  if (!final) { bad("aucun classement de fin recu pour juger les absents"); return }
  stats.absents = []
  for (const b of bots) {
    if (b.isPresenter) continue
    const p = final[b.id]
    const want = expectAbsent.includes(b.name)
    if (!p) { bad(`${b.name} a disparu du classement de fin`); continue }
    if (p.absent) stats.absents.push(b.name)
    if (Boolean(p.absent) !== want) bad(`${b.name} : ${want ? "pas marque absent" : "marque absent a tort"} au classement de fin`)
  }
}

/**
 * Tout le monde s'en va en pleine partie (T22, partie 829 du 14/11 : 12
 * manches revelees pour personne). La partie doit se figer sans bruler de
 * manche, puis s'arreter toute seule : partie « abandoned », salle en attente.
 * Delai attendu : 15 s sans joueur, 2 min de veille, plus un passage du filet.
 */
export async function runGhostRoom({ label, players, rounds = 10, seconds = 10, seed = 1, leaveAt = 2, tracksEach = 8 }) {
  const problems = []
  const bad = m => problems.push(m)
  const bots = players.map((name, i) => new Bot({
    name, random: rng(seed * 31 + i),
    plan: round => (round >= leaveAt ? { action: "muet", quitte: true } : { action: "juste" }),
  }))
  const [host] = bots
  const stats = { mode: "friends", joueurs: bots.length, manches: rounds, secondes: seconds, seed, depart_a_la_manche: leaveAt }
  let code = null
  const t0 = Date.now()
  try {
    await Promise.all(bots.map(b => b.enter()))
    bots.forEach((b, i) => seedUser(b.id, Array.from({ length: tracksEach }, (_, t) => 200 + i * tracksEach + t)))
    const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "friends", questionCount: rounds, nickname: host.name } })
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
    const ids = bots.map(b => b.id)
    for (const b of bots) b.others = ids.filter(id => id !== b.id)
    await sleep(800)
    const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
    if (start.status >= 400) throw new Error(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`)

    for (const until = Date.now() + (leaveAt * (seconds + 15) + 20) * 1000; Date.now() < until && !bots.every(b => b.left); ) await sleep(500)
    if (!bots.every(b => b.left)) throw new Error(`les joueurs ne sont pas partis a la manche ${leaveAt}`)
    const leftAt = Date.now()

    // Code genere par le serveur ([A-Z0-9]) : rien a echapper.
    const look = () => {
      const [state = "", current = "0", room = ""] = (psql(`SELECT g.state, coalesce(g.current_round, 0), m.status
        FROM game_sessions g JOIN multiplayer_rooms m ON m.room_code = g.room_code
        WHERE g.room_code = '${code}' ORDER BY g.id DESC LIMIT 1`).split("\n")[0] || "").split("|")
      return { state, current: Number(current), room }
    }
    let seen = look()
    for (const until = leftAt + 200_000; Date.now() < until && seen.state === "in_progress"; ) {
      await sleep(2000)
      seen = look()
    }
    stats.arret_apres_s = Math.round((Date.now() - leftAt) / 1000)
    stats.etat = seen
    const lastRevealed = Number(psql(`SELECT coalesce(max(gr.round_index), 0) FROM round_responses r
      JOIN game_rounds gr ON gr.id = r.round_id JOIN game_sessions g ON g.id = gr.session_id
      WHERE g.room_code = '${code}'`) || 0)
    stats.manches_revelees = lastRevealed
    if (seen.state !== "abandoned") bad(`partie en etat "${seen.state}" ${stats.arret_apres_s} s apres le depart de tous, attendu : arretee (abandoned)`)
    if (seen.room !== "waiting") bad(`salle en etat "${seen.room}", attendu : de retour en attente`)
    // La manche en cours au depart peut encore se reveler (15 s avant la veille), pas plus.
    if (lastRevealed > leaveAt) bad(`${lastRevealed} manches revelees alors que tout le monde est parti a la manche ${leaveAt}`)
    if (seen.current > leaveAt) bad(`la partie compte ${seen.current} manches jouees, attendu au plus ${leaveAt}`)
    if (stats.arret_apres_s < 120) bad(`arretee ${stats.arret_apres_s} s apres le depart : trop tot, la veille dure 2 min`)
    stats.duree_s = Math.round((Date.now() - t0) / 1000)
  } catch (e) {
    bad(`arret : ${e.message}`)
  } finally {
    for (const b of bots) b.close()
  }
  return { label, code, ok: problems.length === 0, problems, stats }
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
