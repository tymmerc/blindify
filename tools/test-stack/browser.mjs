// Le seul vrai navigateur de la campagne. Il passe d'une salle a l'autre et
// verifie ce que les bots ne peuvent pas voir : l'ecran, et le son.
//
// Le son : une sonde injectee dans la page se branche sur l'element audio de
// l'app (Web Audio, analyseur) et releve toutes les 100 ms le niveau et la
// frequence dominante. Les extraits de test etant des sons purs a une frequence
// propre a chaque morceau, on sait dire si la BONNE chanson joue, quand elle
// demarre, et si elle s'arrete a la revelation. Pas besoin de carte son.
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, api, rng } from "./bot.mjs"
import { oracle, psql, seedUser } from "./testdb.mjs"
import { freqOf } from "./catalog.mjs"

import { APP, LOUD, judgeAudio, newPage, sleep } from "./probe.mjs"
import { soloCheck, chronoCheck } from "./browser-solo.mjs"

async function wizard(page, name, join) {
  await page.goto(`${APP}/jouer/${join ? `?join=${join}` : ""}`, { waitUntil: "networkidle", timeout: 60000 })
  await page.locator("input").first().fill(name)
  await page.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !page.__uid; i++) await sleep(250)
  if (!page.__uid) throw new Error(`${name} : aucune identite creee`)
}

/** Repond comme un humain : titre, artiste, proprietaire, valider.
 *  Deux formulaires coexistent : celui du telephone "autour d'une table" a des
 *  libelles accessibles, celui "a distance" n'a que des placeholders. */
async function answer(page, truth, ownerName) {
  const byLabel = page.getByLabel("Titre du morceau")
  const t = (await byLabel.isVisible().catch(() => false)) ? byLabel : page.getByPlaceholder("Titre du morceau")
  if (!(await t.isVisible().catch(() => false))) return false
  await t.fill(truth.title)
  const artistLabel = page.getByLabel("Artiste")
  const a = (await artistLabel.isVisible().catch(() => false)) ? artistLabel : page.getByPlaceholder("Tape ici...")
  await a.fill(truth.artist).catch(() => {})
  if (ownerName) await page.getByRole("button", { name: new RegExp(ownerName) }).first().click({ timeout: 2000 }).catch(() => {})
  await page.locator('button[type="submit"]').first().click({ timeout: 3000 }).catch(() => {})
  return true
}

function windowsFrom(bot, code) {
  return Object.entries(bot.timeline)
    .filter(([, w]) => w.revealAt)
    .map(([round, w]) => {
      const k = oracle(code, Number(round))?.k
      return { round: Number(round), startAt: w.startAt, revealAt: w.revealAt, expectedFreq: k == null ? null : freqOf(k) }
    })
    .sort((a, b) => a.round - b.round)
}

const usernameOf = id => psql(`SELECT username FROM users WHERE id = ${Number(id)}`)

/* ------------------------------------------------------------------ */
/* 1. Autour d'une table : l'ecran central (presentateur) + un telephone */
async function tableCheck(browser, seed, out) {
  const problems = [], notes = [], shots = []
  const shot = async (p, name, full = false) => { const f = path.join(out, `table-${name}.png`); await p.screenshot({ path: f, fullPage: full }); shots.push(f) }
  const screen = await newPage(browser, { viewport: { width: 1440, height: 900 } }, "ecran central", problems)
  const bots = [
    new Bot({ name: "BotJuste", plan: () => ({ action: "juste" }), random: rng(seed + 101) }),
    new Bot({ name: "BotFaux", plan: () => ({ action: "faux" }), random: rng(seed + 102) }),
  ]
  let phone = null
  try {
    const p = screen.page
    await wizard(p, "Ecran")
    seedUser(p.__uid, [0, 1, 2, 3, 4, 5, 6, 7])
    await p.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
    await p.getByText("Créer une partie").click()
    await p.waitForURL(/\/modes/, { timeout: 30000 })
    await p.getByText("Autour d'une table").first().click()
    await p.getByText("Je présente seulement").click({ timeout: 30000 })
    await p.getByText("Code de la salle").waitFor({ timeout: 30000 })
    const code = await p.locator("[data-code]").first().getAttribute("data-code")
    notes.push(`salle ${code}`)
    await shot(p, "1-lobby-vide")

    for (const [i, b] of bots.entries()) {
      await b.enter()
      seedUser(b.id, Array.from({ length: 8 }, (_, t) => 8 * (i + 1) + t))
      const j = await b.join(code)
      if (!j.ok) problems.push(`${b.name} ne peut pas entrer (${j.status})`)
    }
    // Le telephone d'un joueur, sur la meme partie : il repond a l'ecran, sans son.
    phone = await newPage(browser, { ...devices["iPhone 13"] }, "telephone", problems)
    await wizard(phone.page, "Telephone", code)
    seedUser(phone.page.__uid, [32, 33, 34, 35, 36, 37, 38, 39])
    await phone.page.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await phone.page.getByText("Tu es dans la partie").waitFor({ timeout: 30000 })
    const ids = [...bots.map(b => b.id), phone.page.__uid]
    for (const b of bots) b.others = ids.filter(id => id !== b.id)
    await sleep(2500)
    await shot(p, "2-lobby-3-joueurs")
    await phone.page.screenshot({ path: path.join(out, "table-3-telephone-lobby.png") }); shots.push(path.join(out, "table-3-telephone-lobby.png"))
    for (const who of ["BotJuste", "BotFaux", "Telephone"]) {
      if (!(await p.getByText(who).first().isVisible().catch(() => false))) problems.push(`l'ecran central n'affiche pas ${who} dans le lobby`)
    }

    await p.getByRole("button", { name: "5", exact: true }).click()
    await p.getByRole("button", { name: "10s", exact: true }).click()
    await sleep(500)
    await p.getByRole("button", { name: /lancer la partie/i }).click()

    // Pendant la partie : le telephone repond juste a chaque manche.
    const answered = new Set()
    const t0 = Date.now()
    let midShot = false, revealShot = false
    while (Date.now() - t0 < 5 * 25000 + 30000 && !bots.every(b => b.over)) {
      const lead = bots[0]
      const cur = lead.current?.round
      // 2 s apres le depart de la musique (startAt), pas apres l'annonce de la manche.
      const musicAt = lead.timeline[cur]?.startAt ?? lead.timeline[cur]?.received ?? 0
      if (cur && !answered.has(cur) && !lead.reveals.has(cur) && Date.now() - musicAt > 2000) {
        answered.add(cur)
        const truth = oracle(code, cur)
        const owner = truth?.ownerId ? usernameOf(truth.ownerId) : null
        if (!(await answer(phone.page, truth, owner))) problems.push(`manche ${cur} : le telephone n'affiche pas le champ de reponse`)
        if (cur === 2 && !midShot) { midShot = true; await shot(p, "4-ecran-en-manche"); await phone.page.screenshot({ path: path.join(out, "table-5-telephone-manche.png") }); shots.push(path.join(out, "table-5-telephone-manche.png")) }
      }
      if (lead.reveals.has(2) && !revealShot) { revealShot = true; await sleep(900); await shot(p, "6-ecran-revelation") }
      await sleep(300)
    }
    if (!bots.every(b => b.over)) problems.push("la partie ne s'est pas terminee a temps")
    await sleep(4000) // animations d'entree du podium
    await shot(p, "7-ecran-podium")
    const podium = await p.evaluate(() => document.body.innerText)
    if (!/classement|on rejoue|résultats/i.test(podium)) problems.push("pas de podium sur l'ecran central")

    // Son : l'ecran central joue chaque manche, le telephone reste muet.
    const windows = windowsFrom(bots[0], code)
    const screenAudio = judgeAudio(await p.evaluate(() => window.__probe.samples), windows, { expectSound: true })
    const phoneAudio = judgeAudio(await phone.page.evaluate(() => window.__probe.samples), windows, { expectSound: false })
    problems.push(...screenAudio.problems.map(x => `ecran central, ${x}`), ...phoneAudio.problems.map(x => `telephone, ${x}`))
    notes.push(`niveau de l'ecran central : ${screenAudio.levelDb ?? "?"} dB par rapport au fichier (curseur a 35 % par defaut sur ordinateur)`)
    const probeErr = await p.evaluate(() => window.__probe.errors)
    if (probeErr.length) problems.push(`sonde : ${probeErr[0]}`)

    // Et la base : le telephone a-t-il ete compte juste ?
    const rowsDb = psql(`SELECT count(*) FILTER (WHERE r.verdict='correct'), count(*) FILTER (WHERE r.source_correct) FROM round_responses r
      JOIN game_rounds gr ON gr.id=r.round_id JOIN multiplayer_rooms m ON m.session_id=gr.session_id
      WHERE m.room_code='${code}' AND r.user_id=${phone.page.__uid}`).split("|").map(Number)
    notes.push(`telephone : ${rowsDb[0]}/${answered.size} reponses justes en base, ${rowsDb[1]} "qui a mis quoi" justes`)
    if (rowsDb[0] < answered.size) problems.push(`le telephone a repondu juste ${answered.size} fois, la base en compte ${rowsDb[0]}`)
    return { label: "Autour d'une table · écran central + téléphone", ok: problems.length === 0, problems, notes, shots, audio: screenAudio }
  } catch (e) {
    problems.push(`arret : ${e.message.split("\n")[0]}`)
    await screen.page.screenshot({ path: path.join(out, "table-erreur.png") }).then(() => shots.push(path.join(out, "table-erreur.png"))).catch(() => {})
    return { label: "Autour d'une table · écran central + téléphone", ok: false, problems, notes, shots }
  } finally {
    for (const b of bots) b.close()
    await screen.ctx.close().catch(() => {})
    await phone?.ctx.close().catch(() => {})
  }
}

/* ------------------------------------------------------------------ */
/* 2. A distance : un joueur sur telephone, avec le son chez lui        */
async function remoteCheck(browser, seed, out) {
  const problems = [], notes = [], shots = []
  const shot = async (p, name) => { const f = path.join(out, `distance-${name}.png`); await p.screenshot({ path: f }); shots.push(f) }
  const host = new Bot({ name: "HoteBot", plan: () => ({ action: "proche" }), random: rng(seed + 201) })
  const other = new Bot({ name: "AutreBot", plan: () => ({ action: "faux" }), random: rng(seed + 202) })
  let tel = null
  try {
    await host.enter(); await other.enter()
    seedUser(host.id, [0, 1, 2, 3, 4, 5, 6, 7]); seedUser(other.id, [8, 9, 10, 11, 12, 13, 14, 15])
    const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "friends", questionCount: 4 } })
    const code = created.data?.room?.room_code
    if (!code) throw new Error(`creation refusee (${created.status})`)
    await api(`/api/rooms/${code}/config`, { method: "POST", token: host.token, body: { questionCount: 4, roundSeconds: 12 } })
    host.code = code; await host.connect(); host.socket.emit("room:join", { roomCode: code })
    await other.join(code)
    notes.push(`salle ${code}`)

    tel = await newPage(browser, { ...devices["iPhone 13"] }, "telephone", problems)
    const p = tel.page
    await wizard(p, "Distant", code)
    seedUser(p.__uid, [16, 17, 18, 19, 20, 21, 22, 23])
    await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
    await p.locator("[data-code]").first().waitFor({ timeout: 30000 })
    const ids = [host.id, other.id, p.__uid]
    host.others = ids.filter(i => i !== host.id); other.others = ids.filter(i => i !== other.id)
    await sleep(2500)
    await shot(p, "1-lobby")
    const lobbyTxt = await p.evaluate(() => document.body.innerText)
    if (!/lance la partie quand tout le monde est là/i.test(lobbyTxt)) problems.push("le joueur ne voit pas qui lance la partie")
    if (!/8 titres/.test(lobbyTxt)) problems.push("le lobby n'affiche pas ce que chaque joueur amene")

    const start = await api(`/api/rooms/${code}/start`, { method: "POST", token: host.token, body: { source: "library" } })
    if (start.status >= 400) throw new Error(`lancement refuse (${start.status} ${JSON.stringify(start.error)})`)
    const answered = new Set()
    const t0 = Date.now()
    let midShot = false, revealShot = false
    while (Date.now() - t0 < 4 * 27000 + 30000 && !host.over) {
      const cur = host.current?.round
      if (cur && !answered.has(cur) && !host.reveals.has(cur) && Date.now() - (host.timeline[cur]?.received ?? 0) > 2500) {
        answered.add(cur)
        const truth = oracle(code, cur)
        if (!(await answer(p, truth, truth?.ownerId ? usernameOf(truth.ownerId) : null))) problems.push(`manche ${cur} : pas de champ de reponse`)
        if (!midShot) { midShot = true; await shot(p, "2-manche") }
      }
      if (host.reveals.has(1) && !revealShot) { revealShot = true; await sleep(800); await shot(p, "3-revelation") }
      await sleep(300)
    }
    if (!host.over) problems.push("la partie ne s'est pas terminee a temps")
    await sleep(4000)
    await shot(p, "4-podium")
    const audio = judgeAudio(await p.evaluate(() => window.__probe.samples), windowsFrom(host, code), { expectSound: true })
    problems.push(...audio.problems.map(x => `telephone, ${x}`))
    notes.push(`niveau du telephone : ${audio.levelDb ?? "?"} dB par rapport au fichier`)
    const ok = psql(`SELECT count(*) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id JOIN multiplayer_rooms m ON m.session_id=gr.session_id
      WHERE m.room_code='${code}' AND r.user_id=${p.__uid} AND r.verdict='correct'`)
    notes.push(`${ok}/${answered.size} reponses justes en base`)
    if (Number(ok) < answered.size) problems.push(`reponses justes tapees : ${answered.size}, comptees : ${ok}`)
    return { label: "À distance · joueur sur téléphone", ok: problems.length === 0, problems, notes, shots, audio }
  } catch (e) {
    problems.push(`arret : ${e.message.split("\n")[0]}`)
    return { label: "À distance · joueur sur téléphone", ok: false, problems, notes, shots }
  } finally {
    host.close(); other.close()
    await tel?.ctx.close().catch(() => {})
  }
}

/* ------------------------------------------------------------------ */
/* 3. Un seul tel : trois doigts sur le meme ecran (tactile multipoint)  */
async function buzzerCheck(browser, seed, out) {
  const problems = [], notes = [], shots = []
  const shot = async (p, name) => { const f = path.join(out, `buzzer-${name}.png`); await p.screenshot({ path: f }); shots.push(f) }
  const NAMES = ["Ana", "Bob", "Cleo"]
  const { ctx, page: p } = await newPage(browser, { ...devices["iPhone 13"] }, "un seul tel", problems)
  const { catalog } = await import("./catalog.mjs")
  const CAT = catalog()
  try {
    await wizard(p, "Ana")
    seedUser(p.__uid, Array.from({ length: 8 }, (_, t) => 24 + t))
    await p.goto(`${APP}/buzzer/`, { waitUntil: "networkidle", timeout: 60000 })
    await p.getByPlaceholder("Joueur 1").fill("Ana")
    await p.getByPlaceholder("Joueur 2").fill("Bob")
    await p.getByRole("button", { name: /ajouter un joueur/i }).click()
    await p.getByPlaceholder("Joueur 3").fill("Cleo")
    await p.getByRole("button", { name: "5", exact: true }).click()
    await shot(p, "1-reglages")
    await p.getByRole("button", { name: /lancer la partie/i }).click()
    await p.getByText("Pose ton doigt ici").first().waitFor({ timeout: 30000 })

    // Doigts : evenements tactiles du protocole Chrome (vrai multipoint, pas de clics).
    const cdp = await ctx.newCDPSession(p)
    let down = []
    const zones = () => p.evaluate(names => {
      const out = {}
      for (const s of document.querySelectorAll("span")) {
        if (names.includes(s.textContent?.trim()) && s.parentElement) {
          const r = s.parentElement.getBoundingClientRect()
          if (r.width > 60) out[s.textContent.trim()] = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        }
      }
      return out
    }, NAMES)
    // Protocole Chrome : touchStart pose les points donnes, touchEnd releve
    // EXACTEMENT les points qu'il contient (verifie sur une page temoin : un
    // touchMove sans un point ne le releve pas).
    let pos = {}
    const pt = n => ({ x: pos[n].x, y: pos[n].y, id: NAMES.indexOf(n) + 1, radiusX: 8, radiusY: 8 })
    const fingers = async names => {
      if (down.length) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: down.map(pt) })
      pos = { ...pos, ...(await zones()) }
      if (names.length) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: names.map(pt) })
      down = names
    }
    const lift = async name => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(name)] })
      down = down.filter(n => n !== name)
    }
    const holding = async () => { await p.getByText("LÂCHE POUR RÉPONDRE").first().waitFor({ timeout: 15000 }); return Date.now() }
    const heard = async () => {
      const s = await p.evaluate(() => window.__probe.samples.slice(-12))
      const f = s.filter(x => x[1] > LOUD).map(x => x[2]).sort((a, b) => a - b)
      if (!f.length) return null
      const freq = f[Math.floor(f.length / 2)]
      return CAT[Math.max(0, Math.min(CAT.length - 1, Math.round((freq - 300) / 55)))]
    }
    const reply = async (t, kind) => {
      await p.getByRole("button", { name: /je suis caché/i }).click({ timeout: 8000 })
      await p.getByPlaceholder("Titre du morceau").fill(kind === "faux" ? "rien du tout" : t?.title ?? "?")
      if (kind === "juste") await p.getByPlaceholder("Artiste (bonus)").fill(t?.artist ?? "?")
      if (kind === "proche") await p.getByPlaceholder("Artiste (bonus)").fill("personne")
      await p.getByRole("button", { name: /^valider$/i }).click()
    }
    const afterWrong = async () => {
      await p.getByText("FAUX.").waitFor({ timeout: 8000 })
      await fingers([])
      await p.getByRole("button", { name: /^continuer$/i }).click()
    }
    const reveal = async (expect, idx) => {
      const btn = p.getByRole("button", { name: /manche suivante|voir le classement/i })
      await btn.waitFor({ timeout: 40000 })
      const at = Date.now()
      const txt = await p.evaluate(() => document.body.innerText)
      if (!txt.includes(expect)) problems.push(`manche ${idx} : attendu "${expect}" a la revelation, lu "${txt.replace(/\s+/g, " ").slice(0, 90)}"`)
      await fingers([])
      await sleep(2600) // mesure du silence apres la revelation
      if (idx === 2) await shot(p, "3-revelation")
      await btn.click()
      return at
    }
    const windows = []
    const round = async (idx, body) => {
      await fingers(NAMES)
      const start = await holding()
      await sleep(2500)
      const t = await heard()
      if (!t) problems.push(`manche ${idx} : aucun son pendant que les doigts sont poses`)
      if (idx === 1) await shot(p, "2-doigts-poses")
      const { liftAt, revealAt } = await body(t)
      windows.push({ round: idx, startAt: start, liftAt, revealAt, expectedFreq: t ? t.freq : null })
    }

    await round(1, async t => { const liftAt = Date.now(); await lift("Ana"); await reply(t, "juste"); return { liftAt, revealAt: await reveal("Ana +3 pts", 1) } })
    await round(2, async t => {
      const liftAt = Date.now(); await lift("Bob"); await reply(t, "faux"); await afterWrong()
      await fingers(["Ana", "Cleo"]); await holding(); await sleep(1200)
      await lift("Cleo"); await reply(t, "proche")
      return { liftAt, revealAt: await reveal("Cleo +1 pt", 2) }
    })
    await round(3, async t => {
      const liftAt = Date.now(); await lift("Ana"); await sleep(250); await lift("Bob")
      await reply(t, "faux"); await afterWrong(); await reply(t, "juste")
      return { liftAt, revealAt: await reveal("Bob +3 pts", 3) }
    })
    await round(4, async () => ({ liftAt: null, revealAt: await reveal("Personne n'a trouvé", 4) }))
    await round(5, async t => { const liftAt = Date.now(); await lift("Cleo"); await reply(t, "juste"); return { liftAt, revealAt: await reveal("Cleo +3 pts", 5) } })

    await sleep(3000)
    await shot(p, "4-classement")
    const fin = await p.evaluate(() => document.body.innerText)
    // Ana 3, Bob 3, Cleo 1 + 3 = 4 : Cleo gagne.
    if (!/Cleo/.test(fin.split("\n").slice(0, 8).join(" "))) problems.push(`classement : Cleo (4 pts) devait gagner, lu "${fin.replace(/\s+/g, " ").slice(0, 90)}"`)

    // Son : musique des que les doigts tiennent, bonne chanson, silence apres la revelation.
    const samples = await p.evaluate(() => window.__probe.samples)
    const audio = judgeAudio(samples, windows.map(w => ({ round: w.round, startAt: w.startAt, revealAt: w.liftAt ?? w.revealAt, expectedFreq: w.expectedFreq })), { expectSound: true })
    // judgeAudio verifie aussi l'arret juste apres la fenetre : ici la musique
    // continue legitimement pendant que le joueur repond, on ne garde que
    // l'arret apres la vraie revelation.
    audio.problems = audio.problems.filter(x => !/continue apres la revelation/.test(x))
    for (const w of windows) {
      const after = samples.filter(([t]) => t >= w.revealAt + 1200 && t <= w.revealAt + 2500)
      if (after.some(([, rms]) => rms > LOUD)) audio.problems.push(`manche ${w.round} : le son continue apres la revelation`)
    }
    problems.push(...audio.problems)
    notes.push(`${windows.length} manches, 3 doigts simules, relais apres une erreur, manche sans buzz`)
    return { label: "Un seul tel · buzzer à trois doigts", ok: problems.length === 0, problems, notes, shots, audio: { ...audio, rounds: audio.rounds } }
  } catch (e) {
    problems.push(`arret : ${e.message.split("\n")[0]}`)
    await shot(p, "erreur").catch(() => {})
    return { label: "Un seul tel · buzzer à trois doigts", ok: false, problems, notes, shots }
  } finally {
    await ctx.close().catch(() => {})
  }
}

export async function runBrowser({ seed, out, only = null }) {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
    // Playwright coupe le son par defaut ; la sonde mesure avant la sortie,
    // mais on laisse la chaine audio complete active pour rester fidele.
    ignoreDefaultArgs: ["--mute-audio"],
  })
  const checks = []
  try {
    // Un seul navigateur, un ecran apres l'autre (jamais deux salles en meme temps).
    const all = { table: tableCheck, distance: remoteCheck, buzzer: buzzerCheck, solo: soloCheck, chrono: chronoCheck }
    for (const [name, fn] of Object.entries(all)) {
      if (!only || only.includes(name)) checks.push(await fn(browser, seed, out))
    }
  } finally {
    await browser.close()
  }
  return { checks }
}
