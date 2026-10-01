// Joueur robot sans navigateur : un invite, un socket, un comportement.
//
// Il fait exactement ce que fait le client web (REST pour entrer dans la
// salle, socket pour jouer) et note tout ce qu'il voit, pour que le scenario
// compare ensuite ses intentions avec ce que la base a retenu.
//
// Comportements par manche :
//   juste   titre + artiste + bon proprietaire      -> verdict "correct"
//   proche  bon titre, mauvais artiste               -> verdict "close"
//   faux    rien de juste                            -> verdict "wrong"
//   muet    ne repond pas (force le chemin minuterie)
//   lent    repond apres la fin de manche            -> refus "round_over", aucune ligne
// Evenements ponctuels : deco (coupe le reseau puis revient), quitte (part en cours).
import { createRequire } from "node:module"
import fs from "node:fs"
import { oracle } from "./testdb.mjs"

const { io } = createRequire("/opt/blindify/frontend/package.json")("socket.io-client")
const BACKEND = "http://127.0.0.1:3098"
const ORIGIN = "http://blindz-test.localhost:3180"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))
/** Coupures reseau rattrapees par une reprise : comptees dans le rapport. */
export const retries = []

export async function api(path, { method = "GET", token, body } = {}) {
  // Deux reprises sur coupure reseau (connexion keep-alive fermee par le
  // serveur au moment ou le client la reutilise : "fetch failed"). La cause
  // exacte remonte dans l'erreur finale, pour le rapport.
  let res
  for (let essai = 1; ; essai++) {
    try {
      res = await fetch(`${BACKEND}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "X-E2E-Key": KEY, Origin: ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      break
    } catch (e) {
      const cause = e?.cause?.code || e?.cause?.message || e.message
      if (essai >= 3) throw new Error(`${method} ${path} : ${cause} (3 essais)`)
      retries.push(`${method} ${path} : ${cause}`)
      await sleep(300 * essai)
    }
  }
  const j = await res.json().catch(() => null)
  return { status: res.status, data: j?.data, error: j?.error }
}

/** Petit generateur pseudo-aleatoire a graine : une campagne se rejoue a l'identique. */
export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000 }
}

export class Bot {
  constructor({ name, plan, random, isPresenter = false }) {
    this.name = name
    this.plan = plan            // (round) => { action, deco?, quitte? }
    this.random = random
    this.isPresenter = isPresenter
    this.intents = new Map()    // round -> { action, sourceGuess, ack }
    this.leaks = []             // reponse vue sur le fil avant la revelation
    this.errors = []
    this.rounds = new Set()
    this.reveals = new Set()
    this.over = false
    this.left = false
    this.others = []            // ids des autres joueurs, pour une fausse devinette
    this.timeline = {}          // manche -> { startAt, revealAt } (horloge du VPS), pour la sonde audio
  }

  async enter() {
    const g = await api("/api/auth/guest", { method: "POST", body: { nickname: this.name } })
    if (!g.data?.sessionToken) throw new Error(`${this.name} : invite refuse (${g.status} ${JSON.stringify(g.error)})`)
    this.token = g.data.sessionToken
    this.id = g.data.user.id
    return this
  }

  connect() {
    return new Promise((resolve, reject) => {
      const s = io(BACKEND, {
        path: "/socket.io", auth: { token: this.token }, transports: ["websocket"],
        extraHeaders: { "X-E2E-Key": KEY, Origin: ORIGIN }, reconnection: false,
      })
      const t = setTimeout(() => reject(new Error(`${this.name} : socket muet`)), 15000)
      s.on("connect", () => { clearTimeout(t); resolve() })
      s.on("connect_error", e => { clearTimeout(t); reject(new Error(`${this.name} : ${e.message}`)) })
      this.socket = s
      this.wire(s)
    })
  }

  async join(code) {
    this.code = code
    const r = await api(`/api/rooms/${code}/join`, { method: "POST", token: this.token })
    if (r.status >= 400) return { ok: false, status: r.status, code: r.error?.code || r.error }
    if (!this.socket) await this.connect()
    this.socket.emit("room:join", { roomCode: code })
    return { ok: true }
  }

  /** Anti-triche : pendant une manche, la bonne reponse ne doit circuler dans
   *  AUCUN message, sauf l'echo de ce que CE joueur a lui-meme tape. Le titre est
   *  cherche partout (il est unique au catalogue), l'artiste seulement dans la
   *  piste en cours (plusieurs morceaux partagent un artiste). */
  inspect(evt, payload) {
    const cur = this.current
    if (!cur || this.reveals.has(cur.round) || !cur.truth?.title) return
    // Etat d'une manche DEJA revelee : c'est la revelation, pas une fuite. Cas
    // vu le 02/10/2026 (graine 303) : un joueur coupe du reseau manque
    // game:round:reveal et ne recoit, a son retour, que l'etat de resynchro.
    if (evt === "game:state" && payload?.currentRound === cur.round && (payload?.phase === "REVEAL" || payload?.phase === "FINISHED")) {
      this.onReveal({ round: cur.round })
      return
    }
    const mine = this.intents.get(cur.round)
    if (mine?.sentTitle === cur.truth.title) return
    const blob = JSON.stringify(payload ?? "")
    const track = JSON.stringify(payload?.track ?? payload?.currentTrack ?? "")
    if (blob.includes(cur.truth.title)) this.leaks.push({ round: cur.round, evt, quoi: "titre" })
    else if (cur.truth.artist && track.includes(cur.truth.artist)) this.leaks.push({ round: cur.round, evt, quoi: "artiste" })
  }

  wire(s) {
    s.on("game:state", p => this.inspect("game:state", p))
    // onRound pose this.current (et la verite de la NOUVELLE manche) avant son
    // premier await : l'inspection qui suit juge donc la bonne manche. Avant,
    // elle passait en premier et comparait a la manche deja revelee.
    s.on("game:round:start", p => { void this.onRound(p); this.inspect("game:round:start", p) })
    s.on("game:round:reveal", p => this.onReveal(p))
    s.on("game:over", () => { this.over = true })
    s.on("room:error", e => this.errors.push(`room:error ${JSON.stringify(e).slice(0, 120)}`))
  }

  async onRound(p) {
    const round = p?.round
    if (!round || this.rounds.has(round) || this.left) return
    this.rounds.add(round)
    this.timeline[round] = { received: Date.now(), startAt: p?.timing?.startAt ?? Date.now(), plannedReveal: p?.timing?.revealAt ?? null }
    const truth = oracle(this.code, round)
    this.current = { round, truth, startedAt: Date.now(), revealAt: p?.timing?.revealAt }
    if (this.isPresenter) return
    const step = this.plan(round) || { action: "muet" }
    if (step.quitte) { await this.quit(); return }
    const intent = { action: step.action, deco: Boolean(step.deco) }
    // Coupure AVANT de repondre : la reponse part apres le retour, comme la
    // relance du client web. Il faut des manches d'au moins 10 s.
    if (step.deco) await this.flap()
    this.intents.set(round, intent)
    if (step.action === "muet" || !truth) return
    const pickOther = () => this.others.length ? this.others[Math.floor(this.random() * this.others.length)] : this.id
    let title = "personne", artist = "inconnu", source = pickOther()
    if (step.action === "juste") { title = truth.title; artist = truth.artist; source = truth.ownerId }
    if (step.action === "proche") { title = truth.title; artist = "zzz" }
    if (step.action === "lent") {
      // Apres la fin de manche : le serveur doit refuser, sans rien compter.
      const wait = (p?.timing?.revealAt ?? Date.now() + 10000) - Date.now() + 1500
      await sleep(Math.max(0, wait))
      title = truth.title; artist = truth.artist
    } else {
      // Comme un humain : il faut ENTENDRE le morceau. On compte donc a partir
      // du depart de la musique (timing.startAt, 1,6 s apres l'annonce), pas
      // de l'annonce. Avant le 02/10/2026, deux bots rapides et le telephone
      // pouvaient tous repondre (grace a l'oracle) pendant le compte a rebours :
      // la manche etait revelee avant la premiere note (graine 202).
      const untilMusic = Math.max(0, (p?.timing?.startAt ?? Date.now()) - Date.now())
      await sleep(untilMusic + 1500 + this.random() * 4000)
    }
    if (this.left || !this.socket?.connected) { intent.lost = true; return }
    // Revenu d'une coupure apres la revelation : le client web affiche alors le
    // resultat et ne propose plus de repondre. On fait pareil (le comportement
    // "lent", lui, repond expres trop tard pour tester le refus du serveur).
    if (intent.deco && step.action !== "lent" && this.reveals.has(round)) { intent.lost = true; intent.revealedWhileAway = true; return }
    intent.sentTitle = title
    intent.sourceGuess = source
    intent.ack = await new Promise(resolve => {
      this.socket.timeout(5000).emit("game:answer",
        { roomCode: this.code, guessTitle: title, guessArtist: artist, sourceUserId: source, round },
        (err, res) => resolve(err ? { ok: false, reason: "timeout" } : res))
    })
  }

  onReveal(p) {
    const round = p?.round
    if (!round || this.reveals.has(round)) return
    this.reveals.add(round)
    if (this.timeline[round]) this.timeline[round].revealAt = Date.now()
    // Comme un humain qui lit le resultat, puis "suivant".
    setTimeout(() => { if (!this.left) this.socket?.emit("game:ready", { roomCode: this.code }) }, 1500 + this.random() * 2500)
  }

  /** Coupure reseau de 3 s en pleine manche, puis retour comme le fait le client. */
  async flap() {
    await sleep(800)
    this.socket?.disconnect()
    await sleep(3000)
    this.socket = null
    await this.connect().catch(e => this.errors.push(`reconnexion : ${e.message}`))
    this.socket?.emit("room:join", { roomCode: this.code })
    this.socket?.emit("game:sync", { roomCode: this.code })
  }

  async quit() {
    this.left = true
    this.socket?.emit("game:leave", { roomCode: this.code })
    await sleep(300)
    this.socket?.disconnect()
  }

  close() { try { this.socket?.disconnect() } catch { /* deja ferme */ } }
}
