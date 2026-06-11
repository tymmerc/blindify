// Simulation navigateur : 5 joueurs par mode (friends, event), streamer en éclaireur.
// Lance 5 contextes chromium isolés (5 sessions invité) contre la PROD.
// Vérifie la convergence (même round/phase sur les 5 écrans) à chaque étape.
import { chromium } from "@playwright/test"
import fs from "fs"

// Bypass rate-limits pour les tests (voir playwright.config.ts pour le pourquoi).
let E2E_KEY = ""
try { E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim() } catch {}

const BASE = "https://tymmerc.eu/blindify"
const API = `${BASE}/api`
const SPOTIFY_PROFILE = "https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"
const SHOTS = "/opt/blindify/maquettes/sim5"
fs.mkdirSync(SHOTS, { recursive: true })

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const results = { friends: {}, event: {}, streamer: {} }

async function newPlayer(browser, nickname) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: E2E_KEY ? { "X-E2E-Key": E2E_KEY } : {},
  })
  const page = await ctx.newPage()
  // authLimiter backend : 15 req/min — retry avec backoff si la fenêtre est pleine.
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await page.request.post(`${API}/auth/guest`, {
      data: { nickname },
      headers: { Origin: "https://tymmerc.eu", Referer: "https://tymmerc.eu/blindify/" },
    })
    if (res.ok()) return { ctx, page, nickname }
    if (res.status() === 429) {
      log(`[auth] 429 pour ${nickname}, retry dans 20s (tentative ${attempt + 1})`)
      await new Promise(r => setTimeout(r, 20000))
      continue
    }
    throw new Error(`guest auth failed for ${nickname}: ${res.status()}`)
  }
  throw new Error(`guest auth failed for ${nickname}: 429 après retries`)
}

async function guestButtonIfShown(page) {
  const btn = page.locator("button", { hasText: "Jouer sans compte" })
  if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(3000)
  }
}

// Franchit tous les écrans intermédiaires (gate login, prompt pseudo, wizard)
// jusqu'à atteindre le lobby. Tolère plusieurs passes.
async function settle(page, nickname, opts = {}) {
  for (let pass = 0; pass < 5; pass++) {
    await page.waitForTimeout(1500)
    await guestButtonIfShown(page)

    const pseudo = page.locator("input[placeholder*='pseudo'], input[placeholder*='Pseudo'], input[placeholder*='appelles']").first()
    if (await pseudo.isVisible({ timeout: 1200 }).catch(() => false)) {
      await pseudo.fill(nickname)
      const cont = page.locator("button", { hasText: /Continuer|Valider|Go/i }).first()
      await cont.click().catch(() => {})
      await page.waitForTimeout(2000)
      continue
    }

    if (opts.create) {
      const createBtn = page.locator("button, a").filter({ hasText: /Cr[ée]er une (partie|salle)/i }).first()
      if (await createBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
        await createBtn.click()
        await page.waitForTimeout(3000)
        continue
      }
    }
    if (opts.joinCode) {
      const codeInput = page.locator("input[placeholder*='code'], input[placeholder*='Code'], input[placeholder*='CODE']").first()
      if (await codeInput.isVisible({ timeout: 1200 }).catch(() => false)) {
        await codeInput.fill(opts.joinCode)
        const joinBtn = page.locator("button").filter({ hasText: /Rejoindre|Go|Valider/i }).first()
        await joinBtn.click().catch(() => {})
        await page.waitForTimeout(2500)
        continue
      }
    }

    const text = await page.locator("body").innerText().catch(() => "")
    if (/Code de la salle|ROOM_CODE|Lancer la partie|PRESS START|Attente|participants|Crew/i.test(text)) return true
  }
  return false
}

async function extractCode(page) {
  const text = await page.locator("body").innerText()
  // Forme compacte (ex: "YU7WH2")
  const compact = (text.match(/\b([A-HJ-NP-Z2-9]{5,8})\b/g) || []).filter(x => /\d/.test(x))
  if (compact[0]) return compact[0]
  // Forme tuiles : lettres séparées par des espaces/sauts de ligne (ex: "H 4 X L W Z")
  const tiles = text.match(/(?:\b[A-HJ-NP-Z2-9][\s ]+){4,7}[A-HJ-NP-Z2-9]\b/)
  if (tiles) {
    const joined = tiles[0].replace(/\s+/g, "")
    if (joined.length === 6) return joined
  }
  return ""
}

// Lit l'état visible d'une page : round courant, phase devinée depuis le DOM.
async function readState(page) {
  const text = await page.locator("body").innerText().catch(() => "")
  const round = text.match(/Round\s+(\d+)\s*\/\s*(\d+)/i)
  const guessInput = await page
    .locator("input[placeholder='Titre du morceau'], input[aria-label='Titre du morceau']")
    .first()
    .isVisible({ timeout: 300 })
    .catch(() => false)
  const reveal = /Prêt pour la suite|prochain round dans|Réponse|Bonne réponse/i.test(text)
  const over = /Rejouer|Partie terminée|terminé|Victoire|Podium/i.test(text)
  return {
    round: round ? `${round[1]}/${round[2]}` : null,
    phase: guessInput ? "GUESSING" : over ? "OVER" : reveal ? "REVEAL" : "?",
  }
}

async function waitAll(players, predicate, label, timeoutMs = 45000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const states = await Promise.all(players.map(p => readState(p.page)))
    if (states.every(predicate)) return states
    await new Promise(r => setTimeout(r, 700))
  }
  const states = await Promise.all(players.map(p => readState(p.page)))
  throw new Error(`TIMEOUT ${label} — états: ${JSON.stringify(states)}`)
}

function converged(states) {
  const rounds = new Set(states.map(s => s.round))
  const phases = new Set(states.map(s => s.phase))
  return { ok: rounds.size === 1 && phases.size === 1, rounds: [...rounds], phases: [...phases] }
}

async function answer(page, title, artist) {
  const t = page.locator("input[placeholder='Titre du morceau'], input[aria-label='Titre du morceau']").first()
  const a = page.locator("input[placeholder='Tape ici...'], input[aria-label='Artiste']").first()
  await t.fill(title).catch(() => {})
  await a.fill(artist).catch(() => {})
  const submit = page.locator("button", { hasText: /Valider ma réponse|Valider/i }).first()
  await submit.click().catch(() => {})
}

async function playRounds(players, modeKey, roundsToPlay) {
  for (let i = 1; i <= roundsToPlay; i++) {
    // Tous en phase GUESSING
    let states = await waitAll(players, s => s.phase === "GUESSING", `${modeKey} round ${i} guessing`)
    let conv = converged(states)
    log(`[${modeKey}] round ${states[0].round} GUESSING — convergence: ${conv.ok ? "OUI" : "NON " + JSON.stringify(conv)}`)
    results[modeKey][`round${i}_guessing`] = conv
    if (i === 1) await players[0].page.screenshot({ path: `${SHOTS}/${modeKey}-guessing.png` })

    // Tout le monde répond (réponses bidon, le but est la synchro)
    await Promise.all(players.map(p => answer(p.page, "Réponse Test", "Artiste Test")))

    // Tous en REVEAL (early reveal car tout le monde a répondu)
    states = await waitAll(players, s => s.phase === "REVEAL" || s.phase === "OVER", `${modeKey} round ${i} reveal`)
    conv = converged(states)
    log(`[${modeKey}] round ${i} REVEAL — convergence: ${conv.ok ? "OUI" : "NON " + JSON.stringify(conv)}`)
    results[modeKey][`round${i}_reveal`] = conv
    if (i === 1) await players[0].page.screenshot({ path: `${SHOTS}/${modeKey}-reveal.png` })

    if (states.every(s => s.phase === "OVER")) { log(`[${modeKey}] partie terminée au round ${i}`); break }
    // L'auto-ready (7s) fait avancer tout seul — on attend le round suivant dans la boucle.
  }
}

// ---------- MODE FRIENDS : 5 joueurs ----------
async function runFriends(browser) {
  log("=== MODE FRIENDS — 5 joueurs ===")
  const names = ["Tym", "Lucie", "Marc", "Jo", "Sarah"].map(n => `${n}_S5`)
  const players = []
  for (const n of names) players.push(await newPlayer(browser, n))
  const [host, ...rest] = players

  await host.page.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=${host.nickname}`)
  await settle(host.page, host.nickname, { create: true })
  const code = await extractCode(host.page)
  if (!code) {
    await host.page.screenshot({ path: `${SHOTS}/debug-friends-host.png` })
    throw new Error("friends: room code introuvable sur la page host (cf debug-friends-host.png)")
  }
  log(`[friends] room ${code} créée par ${host.nickname}`)

  for (const p of rest) {
    await p.page.goto(`${BASE}/multiplayer?mode=friends&code=${code}&nickname=${p.nickname}`)
    const ok = await settle(p.page, p.nickname, { joinCode: code })
    if (!ok) await p.page.screenshot({ path: `${SHOTS}/debug-friends-${p.nickname}.png` })
  }
  await host.page.waitForTimeout(3000)

  // Lobby : les 5 noms visibles côté host ?
  const lobbyText = await host.page.locator("body").innerText()
  const present = names.filter(n => lobbyText.includes(n))
  log(`[friends] lobby host voit ${present.length}/5 joueurs: ${present.join(", ")}`)
  results.friends.lobby = { seen: present.length, names: present }
  await host.page.screenshot({ path: `${SHOTS}/friends-lobby.png` })

  const launch = host.page.locator("button").filter({ hasText: /lancer la partie|press start/i }).first()
  await launch.click({ timeout: 10000 })
  log("[friends] partie lancée")

  await playRounds(players, "friends", 3)
  for (const p of players) await p.ctx.close()
}

// ---------- MODE EVENT : 1 présentateur + 4 participants ----------
async function runEvent(browser) {
  log("=== MODE EVENT — 1 présentateur + 4 participants ===")
  const players = []
  for (const n of ["Prez_S5", "Lucie_S5", "Marc_S5", "Jo_S5", "Sarah_S5"]) players.push(await newPlayer(browser, n))
  const [host, ...rest] = players

  await host.page.goto(`${BASE}/multiplayer?mode=event&intent=host&nickname=${host.nickname}`)
  await settle(host.page, host.nickname, { create: true })
  const code = await extractCode(host.page)
  if (!code) {
    await host.page.screenshot({ path: `${SHOTS}/debug-event-host.png` })
    throw new Error("event: room code introuvable (cf debug-event-host.png)")
  }
  log(`[event] room ${code} créée (présentateur)`)

  for (const p of rest) {
    await p.page.goto(`${BASE}/multiplayer?mode=event&code=${code}&nickname=${p.nickname}`)
    const ok = await settle(p.page, p.nickname, { joinCode: code })
    if (!ok) await p.page.screenshot({ path: `${SHOTS}/debug-event-${p.nickname}.png` })
  }
  await host.page.waitForTimeout(3000)
  const lobbyText = await host.page.locator("body").innerText()
  const seen = ["Lucie_S5", "Marc_S5", "Jo_S5", "Sarah_S5"].filter(n => lobbyText.includes(n))
  log(`[event] présentateur voit ${seen.length}/4 participants`)
  results.event.lobby = { seen: seen.length }
  await host.page.screenshot({ path: `${SHOTS}/event-lobby.png` })

  const launch = host.page.locator("button").filter({ hasText: /lancer la partie|press start|lancer/i }).first()
  await launch.click({ timeout: 10000 })
  log("[event] partie lancée")

  // En event, le présentateur ne répond pas : la convergence se mesure sur les 4 participants,
  // et on vérifie que le présentateur affiche le même round.
  const participants = rest
  for (let i = 1; i <= 2; i++) {
    let states = await waitAll(participants, s => s.phase === "GUESSING", `event round ${i} guessing`)
    const hostState = await readState(host.page)
    const conv = converged([...states, { round: hostState.round, phase: states[0].phase }])
    log(`[event] round ${states[0].round} GUESSING — 4 participants + présentateur même round: ${conv.ok ? "OUI" : "NON " + JSON.stringify({ participants: states, presenter: hostState })}`)
    results.event[`round${i}_guessing`] = conv
    if (i === 1) await participants[0].page.screenshot({ path: `${SHOTS}/event-guessing.png` })

    await Promise.all(participants.map(p => answer(p.page, "Réponse Test", "Artiste Test")))
    states = await waitAll(participants, s => s.phase === "REVEAL" || s.phase === "OVER", `event round ${i} reveal`)
    const conv2 = converged(states)
    log(`[event] round ${i} REVEAL — convergence participants: ${conv2.ok ? "OUI" : "NON " + JSON.stringify(conv2)}`)
    results.event[`round${i}_reveal`] = conv2
    if (states.every(s => s.phase === "OVER")) break
  }
  await host.page.screenshot({ path: `${SHOTS}/event-presenter.png` })
  for (const p of players) await p.ctx.close()
}

// ---------- MODE STREAMER : éclaireur (WIP) ----------
async function runStreamer(browser) {
  log("=== MODE STREAMER — éclaireur (mode marqué Bientôt) ===")
  const host = await newPlayer(browser, "Streamer_S5")
  await host.page.goto(`${BASE}/multiplayer?mode=streamer&intent=host&nickname=Streamer_S5`)
  await host.page.waitForTimeout(4000)
  await guestButtonIfShown(host.page)
  await host.page.waitForTimeout(2000)
  const text = await host.page.locator("body").innerText()
  const code = await extractCode(host.page)
  results.streamer.probe = { hasCode: Boolean(code), excerpt: text.slice(0, 300).replace(/\n+/g, " · ") }
  log(`[streamer] code: ${code || "aucun"} — page: ${results.streamer.probe.excerpt.slice(0, 160)}`)
  await host.page.screenshot({ path: `${SHOTS}/streamer-probe.png` })
  await host.ctx.close()
}

const modes = process.argv.slice(2).length ? process.argv.slice(2) : ["friends", "event", "streamer"]
const browser = await chromium.launch()
try {
  if (modes.includes("friends")) { try { await runFriends(browser) } catch (e) { results.friends.error = e.message; log("[friends] ÉCHEC:", e.message) } }
  if (modes.includes("event")) { try { await runEvent(browser) } catch (e) { results.event.error = e.message; log("[event] ÉCHEC:", e.message) } }
  if (modes.includes("streamer")) { try { await runStreamer(browser) } catch (e) { results.streamer.error = e.message; log("[streamer] ÉCHEC:", e.message) } }
} finally {
  await browser.close()
}
console.log("\n=== RÉSULTATS ===")
console.log(JSON.stringify(results, null, 2))
