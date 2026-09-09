// Verifie que la reponse d'une manche ne sort JAMAIS du serveur avant le
// reveal, ni par le socket (game:state / game:round:start), ni par l'API REST
// (/rooms/:code/state), et que le reveal + l'ecran de resultats marchent
// toujours (le caviardage ne doit rien casser).
//
// Methode : hote presentateur + 2 joueuses (bibliotheques seedees par SQL,
// zero appel Deezer), plus un espion socket.io connecte avec le token d'une
// joueuse qui enregistre chaque trame. Tout le monde passe chaque manche.
import { chromium, devices } from "@playwright/test"
import fs from "fs"
import { execSync } from "child_process"
import { createRequire } from "module"

const requireFront = createRequire("/opt/blindify/frontend/package.json")
const { io } = requireFront("socket.io-client")

const IS_PROD = process.argv[2] === "prod"
const B = IS_PROD ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const ORIGIN = IS_PROD ? "https://blindz.app" : "https://dev.tymmerc.eu"
const SOCKET_PATH = IS_PROD ? "/socket.io" : "/blindify/socket.io"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { problems.push(m); say("  !! " + m) }
const okk = m => say("  [ok] " + m)

const psql = sql => execSync(
  `docker exec blindify-postgres psql -U blindify -d blindify -qAt -c "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`
).toString().trim()

const seedLibrary = (userId, n) => psql(
  `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata)
   SELECT provider, 'e2e-' || md5(random()::text || id::text), ${userId}, title, artist, album_cover, audio_url, duration_ms, metadata
   FROM audio_sources WHERE user_id = 3103 AND audio_url IS NOT NULL AND audio_url <> '' LIMIT ${n}`)

const grabUserId = page => new Promise(resolve => {
  page.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      try { const d = await r.json(); const id = d?.data?.user?.id; if (id) resolve(id) } catch { /* pas ce call */ }
    }
  })
})

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }

// ── Hote presentateur ──
const hostCtx = await mk({ viewport: { width: 1440, height: 900 } })
const host = await hostCtx.newPage()
const hostIdP = grabUserId(host)
await host.goto(`${B}/`, { waitUntil: "networkidle", timeout: 90000 })
await host.locator("input").first().fill("Tymeo")
await host.getByRole("button", { name: /continuer/i }).click()
await host.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
const hostId = await hostIdP
seedLibrary(hostId, 12)
await host.getByText(/créer une partie/i).click()
await host.waitForURL(/\/modes/, { timeout: 40000 })
await host.getByText("Autour d'une table").first().click()
await host.getByText("Je présente seulement").waitFor({ timeout: 40000 })
await host.getByText("Je présente seulement").click()
await host.getByText("CODE DE LA SALLE").waitFor({ timeout: 40000 })
// La plus courte partie possible pour aller vite
for (const n of ["5", "10"]) {
  const btn = host.getByRole("button", { name: n, exact: true })
  if (await btn.count()) { await btn.first().click(); break }
}
await host.getByRole("button", { name: "10s", exact: true }).click().catch(() => {})
const code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
say(`room ${code}, hote guest ${hostId}`)

// ── Deux joueuses ──
const players = []
for (const name of ["Lea", "Max"]) {
  const ctx = await mk({ ...devices["iPhone 13"] })
  const p = await ctx.newPage()
  const idP = grabUserId(p)
  await p.goto(`${B}/?join=${code}`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(name)
  await p.getByRole("button", { name: /continuer/i }).click()
  const uid = await idP
  seedLibrary(uid, 12)
  await p.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
  await p.getByText("Tu es dans la partie").waitFor({ timeout: 90000 })
  players.push({ name, ctx, page: p, uid })
  say(`  ${name}: guest ${uid} seedee`)
}

// ── Espion socket avec le token de Lea ──
const leaCookies = await players[0].ctx.cookies()
const leaToken = leaCookies.find(c => c.name === "blindify_session_token")?.value
if (!leaToken) bad("token de session de Lea introuvable dans les cookies")
const LEA_MARKER = "zzxqmarker"   // texte unique tape par Lea, ne doit jamais fuiter
const frames = []   // { ev, phase, round, title, metaOwner, otherGuesses }
const spy = io(ORIGIN, {
  path: SOCKET_PATH,
  auth: { token: leaToken },
  extraHeaders: { "X-E2E-Key": KEY },
  transports: ["polling", "websocket"],
})
const recordState = (ev) => (st) => {
  if (!st || st.roomCode !== code) return
  // Texte tape par les AUTRES joueurs pendant la manche : ne doit jamais fuiter.
  const otherGuesses = Object.values(st.players ?? {})
    .filter(p => p.hasAnswered && (String(p.lastGuess ?? "").trim() || p.lastGuessTitle || p.lastGuessArtist))
    .map(p => p.lastGuess ?? p.lastGuessTitle ?? p.lastGuessArtist)
  frames.push({
    ev, phase: st.phase, round: st.currentRound,
    title: st.currentTrack?.title ?? null,
    artist: st.currentTrack?.artist ?? null,
    cover: st.currentTrack?.albumCover ?? null,
    metaOwner: st.currentTrack?.metadata?.owner_username ?? null,
    otherGuesses,
  })
}
spy.on("game:state", recordState("state"))
spy.on("game:round:start", (p) => {
  if (p?.roomCode !== code) return
  frames.push({ ev: "start", phase: "GUESSING", round: p.round, title: p.track?.title ?? null, artist: p.track?.artist ?? null, cover: p.track?.albumCover ?? null, metaOwner: p.track?.metadata?.owner_username ?? null })
})
spy.on("game:round:reveal", (p) => {
  if (p?.roomCode !== code) return
  frames.push({ ev: "reveal", phase: "REVEAL", round: p.round, title: p.track?.title ?? null, artist: p.track?.artist ?? null })
})
spy.on("connect", () => spy.emit("room:join", { roomCode: code }))

// ── Lancement ──
await host.getByRole("button", { name: /lancer la partie/i }).click()
await sleep(2500)
const sessionId = psql(`SELECT session_id FROM multiplayer_rooms WHERE room_code='${code}'`)
const answerRows = psql(`SELECT round_index || '|' || correct_title FROM game_rounds WHERE session_id=${sessionId} ORDER BY round_index`)
const answers = Object.fromEntries(answerRows.split("\n").filter(Boolean).map(l => {
  const i = l.indexOf("|"); return [Number(l.slice(0, i)), l.slice(i + 1)]
}))
const totalRounds = Object.keys(answers).length
say(`session ${sessionId}, ${totalRounds} manches, corrige charge depuis la base`)

// ── Boucle de partie : tout le monde passe, on observe ──
let lastRound = 0
let restChecked = false
let revealUiChecked = false
const t0 = Date.now()
while (Date.now() - t0 < 5 * 60 * 1000) {
  const hs = await host.evaluate(() => {
    const txt = document.body.innerText || ""
    const r = txt.match(/Événement\s+(?:REVEAL|\d+s)\s+(\d+)\s*\/\s*(\d+)/)
    return {
      round: r ? Number(r[1]) : null,
      reveal: /REVEAL/.test(txt),
      fin: /FIN DE LA FACE|On rejoue \?/i.test(txt),
    }
  }).catch(() => ({}))
  if (hs.fin) break
  if (hs.round && hs.round !== lastRound) lastRound = hs.round

  // Une fois, en pleine manche 1+ : /state cote Lea doit etre caviarde
  if (!restChecked && lastRound >= 1 && !hs.reveal) {
    restChecked = true
    const st = await players[0].page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include" })
      return await r.json()
    }, `${B}/api/rooms/${code}/state`)
    const tracks = st?.data?.tracks ?? []
    const current = st?.data?.gameState?.currentRound ?? lastRound
    const future = tracks.filter(t => t.round >= current)
    const leaked = future.filter(t => t.title || t.artist || t.audio_url || t.album_cover || t.metadata?.owner_username)
    if (!tracks.length) bad("/state ne renvoie aucune track pendant la partie")
    else if (leaked.length) bad(`/state fuit ${leaked.length} manches non revelees (ex round ${leaked[0].round}: ${JSON.stringify(leaked[0]).slice(0, 120)})`)
    else okk(`/state caviarde bien les ${future.length} manches non revelees (round courant ${current})`)
    const raw = JSON.stringify(st)
    const leakedTitles = Object.entries(answers).filter(([r, t]) => Number(r) >= current && raw.includes(t))
    if (leakedTitles.length) bad(`des titres du corrige apparaissent dans /state: ${leakedTitles.map(([r]) => r).join(",")}`)
    else okk("aucun titre du corrige dans la reponse /state")
    if (st?.data?.gameState?.currentTrack?.title) bad("gameState.currentTrack.title present dans /state pendant le GUESSING")

    // /rounds (roundsSummary) cote Lea (membre) : titres non reveles caviardes
    const rs = await players[0].page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include" })
      return { status: r.status, body: await r.json().catch(() => null) }
    }, `${B}/api/rooms/${code}/rounds`)
    const rounds = rs.body?.data?.rounds ?? []
    const leakedRounds = rounds.filter(r => r.round >= current && (r.title || r.artist))
    if (rs.status !== 200) bad(`/rounds refuse a un membre (HTTP ${rs.status})`)
    else if (leakedRounds.length) bad(`/rounds fuit ${leakedRounds.length} manches non revelees (ex round ${leakedRounds[0].round}: ${leakedRounds[0].title})`)
    else okk("/rounds caviarde les manches non revelees pour un membre")

    // /rounds pour un NON-membre (l'espion via une nouvelle session guest) : 403
    const outsider = await mk({ ...devices["iPhone 13"] })
    const op = await outsider.newPage()
    await op.goto(`${B}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await op.locator("input").first().fill("Intrus")
    await op.getByRole("button", { name: /continuer/i }).click().catch(() => {})
    await op.waitForTimeout(1500)
    const outRounds = await op.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include" })
      return { status: r.status, body: await r.text() }
    }, `${B}/api/rooms/${code}/rounds`)
    if (outRounds.status === 200 && /correct|"title":"[^"]/i.test(outRounds.body)) bad("/rounds sert le corrige a un NON-membre")
    else okk(`/rounds refuse un non-membre (HTTP ${outRounds.status})`)
    await outsider.close()

    // /games/history cote Lea : la session in_progress ne doit porter aucune track
    const hist = await players[0].page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include" })
      return await r.json().catch(() => null)
    }, `${B}/api/games/history`)
    const live = (hist?.data?.games ?? []).find(g => g.state === "in_progress")
    if (live && (live.tracks?.length ?? 0) > 0) bad(`/games/history expose ${live.tracks.length} tracks de la partie EN COURS`)
    else okk("/games/history n'expose aucune track de la partie en cours")
  }

  // Une fois : au reveal de la manche 1, le titre doit s'afficher chez Lea
  if (!revealUiChecked && hs.reveal && lastRound >= 1) {
    revealUiChecked = true
    await sleep(1800)
    const txt = await players[0].page.evaluate(() => document.body.innerText).catch(() => "")
    const expected = answers[lastRound]
    if (expected && txt.toLowerCase().includes(expected.toLowerCase().slice(0, 12)))
      okk(`reveal manche ${lastRound}: le titre "${expected}" s'affiche bien chez la joueuse`)
    else bad(`reveal manche ${lastRound}: titre "${expected}" introuvable sur l'ecran joueuse`)
  }

  // Lea tape une VRAIE reponse (marqueur unique) pour prouver que son texte ne
  // fuite pas aux autres via game:state ; Max passe.
  if (!hs.reveal) {
    const input = players[0].page.locator('input[placeholder*="morceau"]').first()
    if (await input.count() && await input.isVisible().catch(() => false)) {
      await input.fill(LEA_MARKER).catch(() => {})
      await players[0].page.getByRole("button", { name: /valider|envoyer/i }).first().click({ timeout: 250 }).catch(() => {})
    }
  }
  await players[1].page.getByText(/Je sais pas, passer/i).click({ timeout: 250 }).catch(() => {})
  await sleep(400)
}
say(`partie terminee apres ${lastRound} manches`)

// ── Analyse des trames espionnees ──
const guessingFrames = frames.filter(f => f.phase === "GUESSING" && (f.title !== null || f.artist !== null || f.cover || f.metaOwner))
const leakyGuessing = guessingFrames.filter(f => f.title || f.artist || f.cover || f.metaOwner)
say(`${frames.length} trames socket enregistrees (${frames.filter(f => f.ev === "start").length} start, ${frames.filter(f => f.ev === "reveal").length} reveal)`)
if (leakyGuessing.length) bad(`${leakyGuessing.length} trames GUESSING contiennent titre/artiste/pochette/owner (ex: ${JSON.stringify(leakyGuessing[0])})`)
else okk("aucune trame GUESSING ne porte la reponse (titre, artiste, pochette, owner)")
// Le texte tape par Lea ne doit jamais apparaitre dans une trame GUESSING
const guessLeakFrames = frames.filter(f => f.phase === "GUESSING" && (f.otherGuesses ?? []).some(g => String(g).includes(LEA_MARKER)))
const anyGuessLeak = frames.filter(f => f.phase === "GUESSING" && (f.otherGuesses ?? []).length)
if (guessLeakFrames.length) bad(`la reponse tapee par Lea ("${LEA_MARKER}") fuite dans ${guessLeakFrames.length} trames game:state pendant le GUESSING`)
else okk(`aucune reponse de joueur ne fuite dans game:state pendant le GUESSING (${anyGuessLeak.length} trames avec texte, marqueur absent)`)
const revealFrames = frames.filter(f => f.ev === "reveal")
if (!revealFrames.length) bad("aucune trame game:round:reveal recue par l'espion")
else if (revealFrames.every(f => !f.title)) bad("les trames reveal n'embarquent pas le track complet (payload.track)")
else okk(`les trames reveal portent bien la reponse (ex: "${revealFrames.find(f => f.title)?.title}")`)
const wrongReveal = revealFrames.filter(f => f.title && answers[f.round] && f.title !== answers[f.round])
if (wrongReveal.length) bad(`titre de reveal errone: ${JSON.stringify(wrongReveal[0])}`)

// ── Fin de partie : resultats complets + room soldee en base ──
await sleep(2500)
const finalState = await players[0].page.evaluate(async (url) => {
  const r = await fetch(url, { credentials: "include" })
  return await r.json()
}, `${B}/api/rooms/${code}/state`)
const finalTracks = finalState?.data?.tracks ?? []
if (finalTracks.length !== totalRounds) bad(`/state post-partie renvoie ${finalTracks.length}/${totalRounds} tracks`)
else if (finalTracks.some(t => !t.title)) bad("des titres manquent dans /state post-partie (ecran resultats casse)")
else okk("post-partie: /state renvoie la playlist complete avec titres (ecran resultats OK)")
const roomStatus = psql(`SELECT status FROM multiplayer_rooms WHERE room_code='${code}'`)
if (roomStatus !== "finished") bad(`room status='${roomStatus}' apres game over (attendu 'finished')`)
else okk("room passee a 'finished' en base au game over")

say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(p => say("  - " + p))
spy.close()
await b.close()
try { psql("DELETE FROM audio_sources WHERE external_id LIKE 'e2e-%'") } catch { /* tant pis */ }
process.exit(problems.length ? 1 : 0)
