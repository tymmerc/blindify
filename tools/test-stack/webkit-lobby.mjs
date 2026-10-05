// Joueurs iPhone (WebKit) qui rejoignent un salon "Autour d'une table" par le
// lien du QR (/jouer/?join=CODE), sur la PILE ISOLEE (jamais la prod).
//
// Le bug suivi : sous WebKit, un joueur restait parfois sur "Preparation du
// lobby..." (1 entree sur 18 sur la pile le 02/10/2026, jamais sous Chromium ;
// sur blindz.app, le 3e joueur WebKit 2 fois sur 2). Ce script
// rejoue l'entree un grand nombre de fois et, pour chaque joueur, enregistre
// une chronologie complete : requetes vues par la page (fetch, XHR du
// long-polling socket.io, WebSocket, ouverture et fermeture), requetes vues par
// le navigateur, trames socket.io, console, et l'etat affiche (toutes les
// 200 ms). Un joueur bloque est decrit en detail (requetes jamais terminees,
// cookie, capture) ; les entrees lentes aussi.
//
//   node webkit-lobby.mjs [--browser webkit|chromium] [--rooms 12] [--players 3]
//                         [--montage mixte|meme|trois] [--timeout 30000]
//                         [--pause 0] [--cle oui|non] [--sonde oui|non] [--latence 0]
//                         [--bots 0] [--entree jouer|accueil] [--cpu non|oui]
//                         [--chronos lentes|toutes] [--perte non|oui]
//                         [--out /dossier] [--tag nom]
//
// "meme" : tous les joueurs d'une salle dans un seul navigateur (un contexte
// chacun) ; "trois" : un navigateur par joueur ; "mixte" alterne les deux.
// --cle non : sans l'en-tete de contournement de la limite /api/auth (comme un
// vrai telephone) ; il faut alors --pause (ms entre deux salles) pour rester
// sous 60 requetes par minute. --sonde non : sans la sonde injectee dans la
// page (seulement les ecoutes du navigateur), au cas ou elle changerait le
// minutage. --chronos toutes : garde aussi la chronologie des entrees rapides.
// --latence N : le navigateur passe par un proxy local qui retarde chaque sens
// de N ms (latence.mjs), comme un telephone en 4G ; sans lui, les courses
// entre requetes restent invisibles sur la pile (tout est sur la machine).
// --bots N : N joueurs robots deja dans la salle, qui relisent la salle
// (GET /api/rooms/CODE) a chaque arrivee comme le fait le client web : une
// grande tablee charge le serveur au moment ou les iPhone entrent.
// --entree accueil : le joueur ouvre /?join=CODE (l'adresse des QR imprimes,
// redirigee vers /jouer/ par un script en ligne), comme le diagnostic du 02/10 ;
// par defaut il ouvre /jouer/?join=CODE.
// --cpu oui : une fois tous les joueurs d'une salle entres, mesure pendant 5 s
// le temps processeur des navigateurs lances par ce script (salon au repos).
// Le 02/10 sur blindz.app, la variante WebKit avait brule 1,6 coeur en continu
// et tous ses onglets s'etaient figes 27 s d'affilee : on veut savoir si les
// pages du salon tournent a vide sous WebKit.
// --perte oui : le premier POST du join de chaque joueur reste sans reponse
// (le navigateur le retient, rien n'arrive au serveur), comme une requete
// perdue sur un telephone. Sert a prouver ce que fait l'ecran "Preparation du
// lobby" quand le join ne revient pas : attente sans fin, ou relance.
// Joueur bloque : on releve aussi l'etat React du salon (salle, session,
// statut du join...) et les requetes terminees selon la page (Resource Timing).
// Code de sortie : 0 si personne n'est reste bloque, 1 sinon.
import { webkit, chromium, devices } from "@playwright/test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Bot, api } from "./bot.mjs"
import { startLatencyProxy } from "./latence.mjs"

const FRONT = "http://blindz-test.localhost:3180/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))

function options(argv) {
  const o = { browser: "webkit", rooms: 12, players: 3, montage: "mixte", timeout: 30000, pause: 0, cle: "oui", sonde: "oui", chronos: "lentes", perte: "non", latence: 0, bots: 0, entree: "jouer", cpu: "non", out: null, tag: null }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "")
    if (!(k in o)) throw new Error(`option inconnue : ${argv[i]}`)
    const v = argv[++i]
    o[k] = typeof o[k] === "number" ? Number(v) : v
  }
  if (!["webkit", "chromium"].includes(o.browser)) throw new Error(`navigateur inconnu : ${o.browser}`)
  if (!["mixte", "meme", "trois"].includes(o.montage)) throw new Error(`montage inconnu : ${o.montage}`)
  if (!["jouer", "accueil"].includes(o.entree)) throw new Error(`entree inconnue : ${o.entree}`)
  if (!["oui", "non"].includes(o.perte)) throw new Error(`--perte oui ou non : ${o.perte}`)
  o.tag ??= `${o.browser}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`
  o.out ??= path.join(os.tmpdir(), "webkit-lobby", o.tag)
  return o
}

// Sonde injectee avant le code de la page : elle survit a la navigation
// client /jouer/ -> /multiplayer/ (meme document). Tout est horodate (ms epoch).
const PAGE_PROBE = `(() => {
  if (window.__wk) return
  const L = window.__wk = []
  const now = () => Math.round(performance.timeOrigin + performance.now())
  const push = e => { e.t = now(); L.push(e); if (L.length > 6000) L.shift() }
  let seq = 0
  const short = (v, n = 160) => String(v ?? "").slice(0, n)
  const nativeFetch = window.fetch
  window.fetch = function (input, init) {
    const id = ++seq
    const url = typeof input === "string" ? input : input && input.url
    const method = (init && init.method) || (input && input.method) || "GET"
    push({ k: "fetch", id, ph: "start", method, url: short(url) })
    return nativeFetch.apply(this, arguments).then(
      r => { push({ k: "fetch", id, ph: "end", status: r.status }); return r },
      e => { push({ k: "fetch", id, ph: "error", err: short(e) }); throw e })
  }
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (m, u) { this.__wk = { id: ++seq, m, u: short(u) }; return xo.apply(this, arguments) }
  XMLHttpRequest.prototype.send = function (body) {
    const w = this.__wk
    if (w) {
      push({ k: "xhr", id: w.id, ph: "send", method: w.m, url: w.u, body: body ? short(body, 120) : undefined })
      this.addEventListener("loadend", () => push({ k: "xhr", id: w.id, ph: "loadend", status: this.status, resp: short(this.responseText, 120) }))
      for (const ev of ["error", "abort", "timeout"]) this.addEventListener(ev, () => push({ k: "xhr", id: w.id, ph: ev }))
    }
    return xs.apply(this, arguments)
  }
  const NativeWS = window.WebSocket
  function WrappedWS(url, protocols) {
    const ws = protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols)
    const id = ++seq
    push({ k: "ws", id, ph: "new", url: short(url) })
    ws.addEventListener("open", () => push({ k: "ws", id, ph: "open" }))
    ws.addEventListener("close", e => push({ k: "ws", id, ph: "close", code: e.code, reason: short(e.reason, 80), clean: e.wasClean }))
    ws.addEventListener("error", () => push({ k: "ws", id, ph: "error" }))
    ws.addEventListener("message", e => push({ k: "ws", id, ph: "in", data: short(e.data, 100) }))
    const send = ws.send.bind(ws)
    ws.send = d => { push({ k: "ws", id, ph: "out", data: short(d, 100) }); return send(d) }
    return ws
  }
  WrappedWS.prototype = NativeWS.prototype
  for (const c of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) WrappedWS[c] = NativeWS[c]
  window.WebSocket = WrappedWS
  for (const ev of ["visibilitychange", "pagehide", "pageshow", "freeze", "resume"]) {
    document.addEventListener(ev, () => push({ k: "doc", ph: ev, hidden: document.hidden }), true)
    window.addEventListener(ev, () => push({ k: "win", ph: ev }), true)
  }
  let last = ""
  setInterval(() => {
    const txt = document.body ? document.body.innerText : ""
    const st = txt.includes("Préparation du lobby") ? "preparation"
      : txt.includes("Tu es dans la partie") ? "dans-la-partie"
      : txt.includes("Rejoindre la partie") ? "wizard"
      : txt.includes("Comment tu") ? "pseudo"
      : document.querySelector(".animate-spin") ? "chargement" : "autre"
    const key = st + " " + location.pathname + location.search
    if (key !== last) { last = key; push({ k: "ecran", ph: st, url: location.pathname + location.search }) }
  }, 200)
})()`

// Etat React du salon d'un joueur bloque, lu dans la page (build de prod : les
// noms des composants sont minifies). On remonte de l'ecran affiche jusqu'au
// composant qui porte le plus de hooks (ModeLobbyView) et on lit ses useState
// / useReducer dans l'ordre de declaration : les 25 premiers sont nommes
// d'apres ModeLobbyView.tsx (ordre de la branche fix/webkit-lobby-bloque), la
// suite est donnee brute.
const REACT_STATE = `(() => {
  const NOMS = ["userPayload", "loading", "error", "errorAction", "showMusicImport", "view", "lobby",
    "flowStarted", "requireSpotify", "pendingAction", "hasPendingAuthRestore", "room", "participants",
    "tracks", "gameState", "starting", "joining", "joinRetrying", "errorCode", "importing", "socketNotice",
    "answerRejectSignal", "rateLimited", "streamerMode", "soloSource", "socketConnected"]
  let best = null, bestN = 0
  for (const node of document.body.querySelectorAll("*")) {
    const key = Object.keys(node).find(k => k.startsWith("__reactFiber$"))
    if (!key) continue
    for (let f = node[key]; f; f = f.return) {
      if (typeof f.type !== "function") continue
      let n = 0
      for (let h = f.memoizedState; h && n < 1000; h = h.next) n++
      if (n > bestN) { best = f; bestN = n }
    }
    if (bestN > 40) break
  }
  if (!best) return { erreur: "composant introuvable" }
  const court = v => {
    if (v === null || v === undefined || typeof v !== "object") return v
    if (Array.isArray(v)) return "tableau(" + v.length + ")"
    if (v.user && v.user.id) return { user: v.user.id, provider: v.user.provider }
    if (v.room_code) return { room_code: v.room_code, status: v.status }
    if (v.status !== undefined) return { status: v.status, message: v.message ?? null }
    return "objet(" + Object.keys(v).slice(0, 6).join(",") + ")"
  }
  const etats = {}
  const brut = []
  let i = 0
  for (let h = best.memoizedState; h; h = h.next) {
    if (!h.queue) continue
    if (i < NOMS.length) etats[NOMS[i]] = court(h.memoizedState)
    else if (brut.length < 20) brut.push(court(h.memoizedState))
    i++
  }
  return { hooks: bestN, etats, suite: brut }
})()`

// Requetes terminees selon la page (API et socket), avec leur depart et leur duree.
const RESOURCES = `performance.getEntriesByType("resource")
  .filter(e => /\/api\/|socket\.io/.test(e.name))
  .map(e => ({ n: e.name.replace(location.origin, "").replace(/&t=[^&]+/, "").slice(0, 110), debut: Math.round(e.startTime), duree: Math.round(e.duration) }))`

/** Temps processeur cumule (en tics, 100 par seconde) des processus descendants
 *  de `root` : les navigateurs lances par ce script, pas le script lui-meme. */
function browserTicks(root = process.pid) {
  const procs = new Map()
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue
    try {
      const st = fs.readFileSync(`/proc/${d}/stat`, "utf8")
      const f = st.slice(st.lastIndexOf(")") + 2).split(" ")
      procs.set(Number(d), { ppid: Number(f[1]), ticks: Number(f[11]) + Number(f[12]) })
    } catch { /* processus deja termine */ }
  }
  const children = new Map()
  for (const [pid, p] of procs) children.set(p.ppid, [...(children.get(p.ppid) ?? []), pid])
  let ticks = 0
  const todo = [...(children.get(root) ?? [])]
  while (todo.length) {
    const pid = todo.pop()
    ticks += procs.get(pid)?.ticks ?? 0
    todo.push(...(children.get(pid) ?? []))
  }
  return ticks
}

/** Coeurs consommes par les navigateurs pendant `ms` sans rien faire. */
async function idleCpu(ms = 5000) {
  const before = browserTicks()
  await sleep(ms)
  return Math.round(((browserTicks() - before) / 100 / (ms / 1000)) * 100) / 100
}

async function newRoom(tag) {
  const host = new Bot({ name: `Hote${tag}`, plan: () => ({ action: "muet" }), random: Math.random, isPresenter: true })
  await host.enter()
  const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "event", questionCount: 3, hostPlays: false, nickname: host.name, maxPlayers: 16 } })
  const code = created.data?.room?.room_code
  if (!code) throw new Error(`salle refusee ${created.status} ${JSON.stringify(created.error)}`)
  host.code = code
  await host.connect()
  host.socket.emit("room:join", { roomCode: code })
  return { host, code }
}

/** Robots deja attables. Comme un telephone dans le salon, chacun relit la
 *  salle a chaque annonce d'arrivee (refreshParticipants du client web). */
async function seatBots(n, code, tag, bots) {
  for (let i = 1; i <= n; i++) {
    const bot = new Bot({ name: `Robot${tag}x${i}`, plan: () => ({ action: "muet" }), random: Math.random })
    bots.push(bot)
    await bot.enter()
    const joined = await bot.join(code)
    if (!joined.ok) throw new Error(`robot refuse (${joined.status} ${joined.code})`)
    const reread = () => { void api(`/api/rooms/${code}`, { token: bot.token }).catch(() => {}) }
    bot.socket.on("room:presence", p => { if (p?.type === "joined") reread() })
    bot.socket.on("player-joined", reread)
  }
}

/** Branche les ecoutes cote navigateur (requetes, websocket, console). */
function listen(page, net) {
  const t = () => Date.now()
  const ids = new Map()
  let n = 0
  const idOf = r => { if (!ids.has(r)) ids.set(r, ++n); return ids.get(r) }
  const u = r => r.url().replace(FRONT, "").slice(0, 150)
  page.on("request", r => net.push({ t: t(), k: "req", id: idOf(r), ph: "start", method: r.method(), url: u(r), body: (r.postData() || "").slice(0, 100) || undefined }))
  page.on("response", r => net.push({ t: t(), k: "req", id: idOf(r.request()), ph: "response", status: r.status() }))
  page.on("requestfinished", r => net.push({ t: t(), k: "req", id: idOf(r), ph: "finished" }))
  page.on("requestfailed", r => net.push({ t: t(), k: "req", id: idOf(r), ph: "failed", err: r.failure()?.errorText }))
  page.on("console", m => net.push({ t: t(), k: "console", ph: m.type(), text: m.text().slice(0, 240) }))
  page.on("pageerror", e => net.push({ t: t(), k: "pageerror", text: String(e).slice(0, 240) }))
  page.on("websocket", ws => {
    const id = ++n
    net.push({ t: t(), k: "pw-ws", id, ph: "open", url: ws.url().replace(/^ws:\/\/[^/]+/, "").slice(0, 150) })
    ws.on("framesent", f => net.push({ t: t(), k: "pw-ws", id, ph: "out", data: String(f.payload).slice(0, 100) }))
    ws.on("framereceived", f => net.push({ t: t(), k: "pw-ws", id, ph: "in", data: String(f.payload).slice(0, 100) }))
    ws.on("socketerror", e => net.push({ t: t(), k: "pw-ws", id, ph: "error", err: String(e).slice(0, 120) }))
    ws.on("close", () => net.push({ t: t(), k: "pw-ws", id, ph: "close" }))
  })
}

/** Requetes commencees et jamais terminees (vue page et vue navigateur). */
function pending(events) {
  const open = new Map()
  for (const e of events) {
    const key = `${e.k}:${e.id}`
    if ((e.k === "fetch" && e.ph === "start") || (e.k === "xhr" && e.ph === "send") || (e.k === "req" && e.ph === "start")) open.set(key, e)
    else if (["end", "error", "loadend", "abort", "timeout", "finished", "failed"].includes(e.ph)) open.delete(key)
  }
  return [...open.values()]
}

/** Paquets CONNECT socket.io ("40") envoyes, comptes par session engine.io
 *  (sid). Plus d'un CONNECT dans la meme session = le bug du double connect()
 *  pendant la poignee de main : le serveur ferme alors la session. Une
 *  reconnexion ouvre une nouvelle session, son CONNECT est normal. */
function connectsBySession(events) {
  const isConnect = p => p === "40" || p.startsWith("40{")
  const sidOf = url => /[?&]sid=([^&]+)/.exec(url || "")?.[1] ?? "?"
  const wsUrl = new Map()
  const bySid = {}
  const add = (sid, n) => { if (n) bySid[sid] = (bySid[sid] ?? 0) + n }
  for (const e of events) {
    if (e.k === "ws" && e.ph === "new") wsUrl.set(e.id, e.url)
    if (e.k === "xhr" && e.ph === "send" && e.body) add(sidOf(e.url), e.body.split("\x1e").filter(isConnect).length)
    if (e.k === "ws" && e.ph === "out" && e.data && isConnect(e.data)) add(sidOf(wsUrl.get(e.id)), 1)
  }
  return bySid
}

/** Resume utile d'une chronologie : ou en est la requete de join, combien de
 *  requetes etaient en vol quand elle est partie, ce qu'a fait le socket. */
function digest(events, code) {
  const joinStart = events.find(e => e.k === "fetch" && e.ph === "start" && e.url.includes(`/rooms/${code}/join`))
  const joinEnd = joinStart && events.find(e => e.k === "fetch" && e.id === joinStart.id && e.ph !== "start")
  const pwJoin = events.find(e => e.k === "req" && e.ph === "start" && e.url.includes(`/rooms/${code}/join`))
  const pwJoinEnd = pwJoin && events.find(e => e.k === "req" && e.id === pwJoin.id && (e.ph === "finished" || e.ph === "failed"))
  const inFlightAtJoin = pwJoin ? pending(events.filter(e => e.t < pwJoin.t)).filter(e => e.k === "req").map(e => `${e.method} ${e.url}`) : null
  const count = (k, ph) => events.filter(e => e.k === k && e.ph === ph).length
  const connects = connectsBySession(events)
  return {
    connects: Object.values(connects).reduce((a, b) => a + b, 0),
    connectEnDouble: Object.values(connects).some(n => n > 1),
    joinFetch: joinStart ? { startedAt: joinStart.t, settled: joinEnd ? { ph: joinEnd.ph, status: joinEnd.status, ms: joinEnd.t - joinStart.t } : "jamais" } : "jamais envoye",
    joinNavigateur: pwJoin ? { startedAt: pwJoin.t, settled: pwJoinEnd ? { ph: pwJoinEnd.ph, ms: pwJoinEnd.t - pwJoin.t } : "jamais" } : "jamais envoye",
    inFlightAtJoin,
    xhr400: events.filter(e => e.k === "xhr" && e.ph === "loadend" && e.status >= 400).length,
    wsNew: count("ws", "new"), wsOpen: count("ws", "open"), wsClose: count("ws", "close"),
    screens: events.filter(e => e.k === "ecran").map(e => `${e.ph}@${e.t}`),
  }
}

// Retient le premier POST /api/rooms/CODE/join de la page : ni reponse ni
// erreur, la requete reste en suspens. Les suivants passent normalement.
async function holdFirstJoin(page, onHeld) {
  let held = false
  await page.route(u => /\/api\/rooms\/[A-Z0-9]+\/join$/.test(u.pathname), route => {
    if (route.request().method() !== "POST" || held) return route.continue()
    held = true
    onHeld({ url: route.request().url(), at: Date.now() })
  })
}

async function joinAs({ browser, name, code, tag, opts, device }) {
  const ctx = await browser.newContext({ ...device })
  if (opts.cle === "oui") await ctx.setExtraHTTPHeaders({ "X-E2E-Key": KEY }) // limite /api/auth : 60/min par IP
  if (opts.sonde === "oui") await ctx.addInitScript(PAGE_PROBE)
  const p = await ctx.newPage()
  let joinHeld = null
  if (opts.perte === "oui") await holdFirstJoin(p, held => { joinHeld = held })
  const net = []
  listen(p, net)
  const log = { name, tag, browser: opts.browser, code, steps: {}, ok: false }
  const t0 = Date.now()
  const step = k => { log.steps[k] = Date.now() - t0 }
  try {
    const entree = opts.entree === "accueil" ? `${FRONT}/?join=${code}` : `${FRONT}/jouer/?join=${code}`
    await p.goto(entree, { waitUntil: "networkidle", timeout: 60000 }); step("page")
    const go = p.getByRole("button", { name: /continuer/i })
    for (let i = 0; i < 6 && !(await go.isEnabled().catch(() => false)); i++) {
      await p.locator("input").first().fill(name, { timeout: 30000 })
      await p.waitForTimeout(300)
    }
    step("pseudo")
    await go.click({ timeout: 30000 }); step("continuer")
    await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 30000 }); step("rejoindre")
    await p.getByText("Tu es dans la partie").waitFor({ timeout: opts.timeout }); step("dans-la-partie")
    log.ok = true
  } catch (e) {
    log.erreur = String(e.message).split("\n")[0].slice(0, 200)
    log.urlAuBlocage = p.url()
    log.texteAuBlocage = (await p.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 300)
    log.cookies = (await ctx.cookies().catch(() => [])).map(c => `${c.name} (domaine ${c.domain}, ${c.value ? "present" : "vide"})`)
    log.ressources = await p.evaluate(RESOURCES).catch(() => [])
    await p.screenshot({ path: path.join(opts.out, `${tag}-${name}-blocage.png`) }).catch(() => {})
  }
  log.joinRetenu = joinHeld
  log.joinMs = log.steps["dans-la-partie"] != null ? log.steps["dans-la-partie"] - log.steps.rejoindre : null
  // Releve aussi pour les entrees reussies : la lecture est verifiee a chaque passage.
  log.etatReact = await p.evaluate(REACT_STATE).catch(e => ({ erreur: String(e).slice(0, 160) }))
  // Encore 1 s pour voir la suite (socket qui se reconnecte, etc.).
  await sleep(1000)
  const inPage = opts.sonde === "oui" ? await Promise.race([p.evaluate(() => window.__wk || []).catch(() => []), sleep(5000).then(() => [])]) : []
  const events = [...inPage, ...net].sort((a, b) => a.t - b.t)
  log.digest = digest(events, code)
  const slow = log.joinMs == null || log.joinMs > 5000
  if (!log.ok || slow || opts.chronos === "toutes") {
    log.pendingAtEnd = pending(events).map(e => `${e.k} ${e.method ?? ""} ${e.url}`)
    fs.writeFileSync(path.join(opts.out, `${tag}-${name}-chronologie.json`), JSON.stringify({ t0, log, events }, null, 1))
  }
  return { ctx, log }
}

async function room(i, opts, launcher, results) {
  const montage = opts.montage === "mixte" ? (i % 2 ? "trois" : "meme") : opts.montage
  const tag = `${montage}-${i}`
  const { host, code } = await newRoom(i)
  const bots = []
  const device = opts.browser === "webkit" ? devices["iPhone 13"] : devices["Pixel 7"]
  const shared = montage === "meme" ? await launcher.launch() : null
  const own = []
  const names = ["Megane", "Max", "Lea", "Noe", "Ines", "Sacha"].slice(0, opts.players)
  try {
    await seatBots(opts.bots, code, i, bots)
    for (const name of names) {
      const browser = shared ?? await launcher.launch()
      if (!shared) own.push(browser)
      const { log } = await joinAs({ browser, name, code, tag, opts, device })
      results.push({ ...log, montage })
    }
    await sleep(500)
    if (opts.cpu === "oui") {
      const cores = await idleCpu()
      cpuSamples.push(cores)
      console.log(`${tag} : navigateurs au repos, ${names.length} onglets dans le salon : ${cores} coeur`)
    }
  } finally {
    await shared?.close().catch(() => {})
    for (const b of own) await b.close().catch(() => {})
    for (const bot of bots) bot.close()
    host.close()
  }
  const these = results.filter(r => r.tag === tag)
  console.log(`${tag} salle ${code} : ${these.map(r => `${r.name}=${r.ok ? `${r.joinMs} ms` : "BLOQUE"}`).join(" ")}`)
}

const cpuSamples = []

async function main() {
  const opts = options(process.argv.slice(2))
  fs.mkdirSync(opts.out, { recursive: true })
  const engine = opts.browser === "webkit" ? webkit : chromium
  const proxy = opts.latence > 0 ? await startLatencyProxy(opts.latence) : null
  const launcher = { launch: () => engine.launch(proxy ? { proxy: { server: proxy.url } } : {}) }
  const results = []
  console.log(`${opts.browser}, ${opts.rooms} salles de ${opts.players} joueurs (+${opts.bots} robots), montage ${opts.montage}, latence ${opts.latence} ms par sens, sortie ${opts.out}`)
  for (let i = 1; i <= opts.rooms; i++) {
    try { await room(i, opts, launcher, results) } catch (e) { console.log(`salle ${i} : echec du montage (${e.message})`) }
    // Un proxy contourne (navigateur qui ne l'utilise pas pour *.localhost) ne
    // retarderait rien : mieux vaut s'arreter que mesurer autre chose.
    if (proxy && i === 1 && proxy.stats.http === 0) { console.log("ECHEC : le navigateur n'est pas passe par le proxy de latence"); process.exit(2) }
    if (opts.pause && i < opts.rooms) await sleep(opts.pause)
  }
  if (proxy) { console.log(`proxy de latence : ${JSON.stringify(proxy.stats)}`); await proxy.close() }
  fs.writeFileSync(path.join(opts.out, "resultats.json"), JSON.stringify(results, null, 1))
  const stuck = results.filter(r => !r.ok)
  const slow = results.filter(r => r.ok && r.joinMs > 5000)
  const times = results.filter(r => r.ok).map(r => r.joinMs).sort((a, b) => a - b)
  const pct = q => times.length ? times[Math.min(times.length - 1, Math.floor(q * times.length))] : null
  console.log(`\n${results.length - stuck.length}/${results.length} entrees reussies, ${slow.length} lentes (> 5 s), mediane ${pct(0.5)} ms, p90 ${pct(0.9)} ms, max ${times.at(-1) ?? null} ms`)
  const doubles = results.filter(r => r.digest.connectEnDouble).length
  const perdus = results.filter(r => r.digest.xhr400 > 0).length
  if (opts.sonde === "oui") console.log(`CONNECT socket.io en double dans une meme session : ${doubles}/${results.length} entrees ; POST du long-polling refuses (400) : ${perdus}/${results.length}`)
  if (cpuSamples.length) console.log(`navigateurs au repos : ${cpuSamples.join(" ; ")} coeur (une mesure par salle)`)
  if (results[0]) console.log(`etat React (1re entree, controle de la lecture) : ${JSON.stringify(results[0].etatReact)}`)
  for (const r of [...stuck, ...slow]) {
    console.log(`- ${r.tag} ${r.name} ${r.ok ? `LENT ${r.joinMs} ms` : `BLOQUE (${r.erreur})`}`)
    if (r.joinRetenu) console.log(`  premier join retenu (--perte oui) a ${r.joinRetenu.at}`)
    console.log(`  join vu par la page : ${JSON.stringify(r.digest.joinFetch)}, par le navigateur : ${JSON.stringify(r.digest.joinNavigateur)}`)
    console.log(`  en vol au depart du join : ${JSON.stringify(r.digest.inFlightAtJoin)}`)
    console.log(`  xhr >= 400 : ${r.digest.xhr400}, websockets ${r.digest.wsNew} crees / ${r.digest.wsOpen} ouverts / ${r.digest.wsClose} fermes`)
    if (!r.ok) {
      console.log(`  ecran : ${r.texteAuBlocage}\n  en suspens : ${(r.pendingAtEnd || []).join(" | ")}`)
      console.log(`  etat React : ${JSON.stringify(r.etatReact)}`)
    }
  }
  process.exit(stuck.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
