import { chromium, devices } from "@playwright/test"
import fs from "fs"

const B = "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/party4"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CHAOS = process.argv.includes("--chaos")
const ROUNDS = 5
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { if (!problems.includes(m)) { problems.push(m); console.log("  !! " + m) } }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }
const audioReq = {}
const audioLog = []
const wireAudio = (p, tag) => {
  audioReq[tag] = 0
  p.on("request", r => { if (/\.mp3|dzcdn|scdn|mediaserver|preview/.test(r.url())) audioReq[tag]++ })
  p.on("response", r => { if (/\.mp3|dzcdn|preview/.test(r.url()) && r.status() >= 400) audioLog.push(`${tag} HTTP ${r.status()} ${r.url().slice(0,80)}`) })
}
const wire = (p, tag) => {
  wireAudio(p, tag)
  p.on("pageerror", e => bad(`${tag} crash JS: ${String(e).slice(0, 140)}`))
  p.on("console", m => {
    const t = m.text()
    if (/multiplayer_audio_play_failed/.test(t)) { audioLog.push(`${tag}: ${t.slice(0,90)}`); return }
    if (m.type() === "error" && !/webpack-hmr|WebSocket connection|vibrate|Failed to load resource|401/.test(t))
      bad(`${tag} console: ${t.slice(0, 140)}`)
  })
}

const probe = p => p.evaluate(() => {
  const txt = document.body.innerText || ""
  const g = re => { const m = txt.match(re); return m ? m[0] : null }
  // Ecran joueur : "ROUND 2/5". Ecran de projection de l'hote : "Événement 6s 1/5".
  const r = txt.match(/(?:ROUND|MANCHE|Manche)\s*(\d+)\s*\/\s*(\d+)/)
    || txt.match(/Événement\s+\d+s\s+(\d+)\s*\/\s*(\d+)/)
  return {
    round: r ? Number(r[1]) : null,
    input: !!document.querySelector('input[placeholder*="morceau qui tourne"]'),
    noted: /C'est noté/.test(txt),
    reveal: /Reveal dans|Bonne réponse|La réponse était/i.test(txt),
    podium: /FIN DE LA FACE|Classement final|On rejoue \?/i.test(txt),
    deconnexion: /Connexion perdue|Resynchronisation|n'est pas passée/i.test(txt),
    tooLate: /Trop tard, la manche/i.test(txt),
    hostGone: /organisateur a quitté/i.test(txt),
    scoreLine: g(/\d+\s*\/\s*\d+\s*ont répondu/),
  }
}).catch(() => ({ dead: true }))

// --- mise en place ---
const hostCtx = await mk({ viewport: { width: 1440, height: 900 } })
const host = await hostCtx.newPage()
wire(host, "HOTE")
await host.goto(`${B}/`, { waitUntil: "networkidle", timeout: 90000 })
await host.locator("input").first().fill("Tymeo")
await host.getByRole("button", { name: /continuer/i }).click()
await host.locator('input[placeholder^="https://"]').fill("https://www.deezer.com/profile/2529")
await host.getByRole("button", { name: /importer ma musique/i }).click()
await host.getByText(/titres? importés?/).waitFor({ timeout: 90000 })
say("import hote:", (await host.getByText(/titres? importés?/).first().innerText()).replace(/\s+/g, " "))
await host.getByText("Créer une partie").click()
await host.waitForURL(/\/modes/, { timeout: 40000 })
await host.getByText("Autour d'une table").first().click()
await host.getByText("Je présente seulement").waitFor({ timeout: 40000 })
await host.getByText("Je présente seulement").click()
await host.getByText("CODE DE LA SALLE").waitFor({ timeout: 40000 })
await host.getByRole("button", { name: String(ROUNDS), exact: true }).click()
await host.getByRole("button", { name: "10s", exact: true }).click()
const code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
say(`\n=== partie ${code} · hote presentateur + 3 joueurs · ${ROUNDS} manches${CHAOS ? " · AVEC CHAOS" : ""} ===`)

const players = []
for (const name of ["Megane", "Max", "Lea"]) {
  const ctx = await mk({ ...devices["iPhone 13"] })
  const p = await ctx.newPage()
  wire(p, name)
  await p.goto(`${B}/?join=${code}`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(name)
  await p.getByRole("button", { name: /continuer/i }).click()
  await p.getByRole("button", { name: /rejoindre la partie/i }).click()
  await p.getByText("Tu es dans la partie").waitFor({ timeout: 90000 })
  players.push({ name, page: p, ctx })
  say(`  ${name} a rejoint`)
  if (!(await host.getByText(name).first().isVisible().catch(() => false)))
    bad(`l'hote ne voit pas ${name} dans le lobby`)
}

await host.getByRole("button", { name: /lancer la partie/i }).click()
say("\npartie lancee, on suit chaque ecran en continu\n")
await sleep(9000)
say("[ecran de projection de l'hote]", (await host.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 240), "\n")
await host.screenshot({ path: `${SHOTS}/hote-en-partie.png` })

// --- boucle pilotee par l'etat, pas par des sleeps ---
const watchers = []
const state = {}
for (const { name, page } of [{ name: "Tymeo", page: host }, ...players]) {
  const presenter = name === "Tymeo"
  const st = state[name] = { rounds: new Set(), answered: new Set(), submittedAt: null, podium: false }
  watchers.push((async () => {
    const deadline = Date.now() + 5 * 60 * 1000
    while (Date.now() < deadline) {
      const s = await probe(page)
      if (s.dead) break
      if (s.podium) { st.podium = true; break }
      if (s.round) st.rounds.add(s.round)
      if (s.deconnexion) bad(`${name} affiche un message de perte de connexion en manche ${s.round}`)
      if (s.tooLate) say(`  (${name}: reponse trop tardive signalee, manche ${s.round})`)
      if (presenter && s.input) bad("l'hote presentateur a un champ de reponse")
      if (presenter && !s.round && !st.sample) {
        st.sample = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 180)
        say("  [ecran hote]", st.sample)
      }
      // un joueur repond des qu'il voit le champ pour une manche pas encore jouee
      if (!presenter && s.input && s.round && !st.answered.has(s.round)) {
        st.answered.add(s.round)
        await page.locator('input[placeholder*="morceau qui tourne"]').fill(`rep-${name}-${s.round}`).catch(() => {})
        await page.locator('button[type="submit"]').first().click().catch(() => bad(`${name} ne peut pas valider en manche ${s.round}`))
        st.submittedAt = { at: Date.now(), round: s.round }
        say(`  ${name} a repondu (manche ${s.round})`)
      }
      // le champ doit disparaitre dans les 3s apres validation
      if (st.submittedAt && Date.now() - st.submittedAt.at > 3000) {
        const cur = await probe(page)
        if (cur.input && cur.round === st.submittedAt.round && !cur.noted && !cur.reveal)
          bad(`${name} : le champ de reponse reste affiche apres validation (manche ${st.submittedAt.round})`)
        st.submittedAt = null
      }
      await sleep(600)
    }
  })())
}

// --- chaos realiste en parallele ---
if (CHAOS) {
  watchers.push((async () => {
    const max = players.find(p => p.name === "Max")
    while (!state.Max.rounds.has(2)) { await sleep(500); if (state.Max.podium) return }
    say("  [chaos] Max recharge sa page en pleine manche")
    await max.page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
    await sleep(12000)
    const s = await probe(max.page)
    if (!s.round && !s.reveal && !s.podium) bad(`Max ne revient pas dans la partie apres rechargement`)
    else say(`  [chaos] Max est revenu (manche ${s.round ?? "reveal"})`)
  })())
  watchers.push((async () => {
    while (!state.Megane.rounds.has(3)) { await sleep(500); if (state.Megane.podium) return }
    say("  [chaos] Zoe arrive en retard")
    const ctx = await mk({ ...devices["iPhone 13"] })
    const zoe = await ctx.newPage()
    let joins = 0
    zoe.on("request", r => { if (r.url().includes("/join")) joins++ })
    await zoe.goto(`${B}/?join=${code}`, { waitUntil: "networkidle", timeout: 90000 })
    await zoe.locator("input").first().fill("Zoe")
    await zoe.getByRole("button", { name: /continuer/i }).click()
    await zoe.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
    await sleep(10000)
    const txt = await zoe.evaluate(() => document.body.innerText)
    if (!/partie est en cours/i.test(txt)) bad("Zoe ne recoit pas le message 'partie en cours'")
    if (joins > 5) bad(`Zoe a envoye ${joins} requetes /join (boucle de retry)`)
    else say(`  [chaos] Zoe: message correct, ${joins} requete(s) /join`)
    await zoe.screenshot({ path: `${SHOTS}/chaos-zoe.png` })
    await ctx.close()
  })())
}

await Promise.all(watchers)

say("\n-- ecran de fin --")
for (const { name, page } of [{ name: "Tymeo", page: host }, ...players]) {
  const st = state[name]
  await page.screenshot({ path: `${SHOTS}/${CHAOS ? "chaos-" : ""}fin-${name}.png` }).catch(() => {})
  const txt = await page.evaluate(() => document.body.innerText).catch(() => "")
  say(`  ${name}: podium=${st.podium} manches vues=[${[...st.rounds].sort((a, c) => a - c)}] reponses=${st.answered.size}`)
  if (!st.podium) bad(`${name} n'atteint pas l'ecran de fin`)
  if (st.rounds.size < ROUNDS) bad(`${name} n'a vu que ${st.rounds.size} manches sur ${ROUNDS}`)
  if (name !== "Tymeo" && st.answered.size < ROUNDS) bad(`${name} n'a pu repondre qu'a ${st.answered.size} manches sur ${ROUNDS}`)
  if (name === "Tymeo") say("    podium hote:", txt.replace(/\s+/g, " ").slice(0, 220))
}

say("\n-- audio --")
say("  requetes audio par client:", JSON.stringify(audioReq))
say("  incidents audio:", audioLog.length ? "\n    " + audioLog.join("\n    ") : "aucun")
say(`\n=== ${problems.length === 0 ? "AUCUN PROBLEME" : problems.length + " PROBLEME(S)"} ===`)
problems.forEach(p => say("  - " + p))
await b.close()
