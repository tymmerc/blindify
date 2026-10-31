// La soiree complete, comme en vrai : partie 1 → retardataire qui arrive en
// pleine partie, regarde, puis joue des la manche suivante (T19) → fin de
// partie, il est au classement → l'hote relance → partie 2 avec lui.
// Plus : hote qui recharge sa page en pleine manche, joueur qui quitte et garde son score.
import { chromium, devices } from "@playwright/test"
import fs from "fs"
import { execSync } from "child_process"
// Ensemencement partage : vrais identifiants Deezer, donc extraits rafraichissables.
// retenirSalle : la salle est fermee a la sortie, meme sur un echec.
import { seedLibrary, cleanupSeeded, retenirSalle } from "./seed-library.mjs"

const B = process.argv[2] === "prod" ? "https://blindz.app" : "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/soiree"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { if (!problems.includes(m)) { problems.push(m); say("  !! " + m) } }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }
const wire = (p, tag) => {
  p.on("pageerror", e => bad(`${tag} crash JS: ${String(e).slice(0, 120)}`))
}
const probe = p => p.evaluate(() => {
  const txt = document.body.innerText || ""
  const r = txt.match(/(?:ROUND|MANCHE)\s*(\d+)\s*\/\s*(\d+)/i) || txt.match(/Événement\s+(?:REVEAL|\d+s)\s+(\d+)\s*\/\s*(\d+)/)
  return {
    round: r ? Number(r[1]) : null,
    input: !!document.querySelector('input[placeholder*="morceau qui tourne"]'),
    fin: /FIN DE LA FACE|On rejoue \?/i.test(txt),
    attente: /tu joues dès la prochaine manche|tu joues la prochaine partie/i.test(txt),
    organiser: /ORGANISER/i.test(txt) && /Lancer une partie/i.test(txt),
    lancerVisible: /LANCER LA PARTIE/i.test(txt),
    txt: txt.replace(/\s+/g, " ").slice(0, 200),
  }
}).catch(() => ({ dead: true }))

// ---- mise en place : hote presentateur + 3 joueurs ----
const hostCtx = await mk({ viewport: { width: 1440, height: 900 } })
const host = await hostCtx.newPage()
wire(host, "HOTE")
const grabUserId = page => new Promise(resolve => {
  page.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      try { const d = await r.json(); const id = d?.data?.user?.id; if (id) resolve(id) } catch { /* pas ce call */ }
    }
  })
})
const hostIdP = grabUserId(host)
await host.goto(`${B}/jouer/`, { waitUntil: "networkidle", timeout: 90000 })
await host.locator("input").first().fill("Tymeo")
await host.getByRole("button", { name: /continuer/i }).click()
await host.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
const hostId = await hostIdP
await seedLibrary(hostId, 20)
say(`hote guest ${hostId} seede (titres Deezer neufs)`)
await host.getByText("Créer une partie").click()
await host.waitForURL(/\/modes/, { timeout: 40000 })
await host.getByText("Autour d'une table").first().click()
await host.getByText("Je présente seulement").waitFor({ timeout: 40000 })
await host.getByText("Je présente seulement").click()
await host.getByText("CODE DE LA SALLE").waitFor({ timeout: 40000 })
await host.getByRole("button", { name: "5", exact: true }).click()
await host.getByRole("button", { name: "10s", exact: true }).click()
const code = retenirSalle(await host.locator("[data-code]").first().getAttribute("data-code"), hostId)
say(`soiree ${code} sur ${B}`)
if (!host.url().includes(`code=${code}`)) bad("le code de la salle n'est pas dans l'URL de l'hote apres creation")

const players = []
for (const name of ["Megane", "Max", "Lea"]) {
  const ctx = await mk({ ...devices["iPhone 13"] })
  const p = await ctx.newPage()
  wire(p, name)
  const idP = grabUserId(p)
  await p.goto(`${B}/?join=${code}`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(name)
  await p.getByRole("button", { name: /continuer/i }).click()
  const uid = await idP
  await seedLibrary(uid, 20)
  await p.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
  await p.getByText("Tu es dans la partie").waitFor({ timeout: 90000 })
  players.push({ name, page: p })
}
say("3 joueurs dans le lobby")
await host.getByRole("button", { name: /lancer la partie/i }).click()

// ---- watchers : les joueurs repondent a chaque manche ----
const answered = Object.fromEntries(players.map(p => [p.name, new Set()]))
const leaQuitAt = 3 // Lea quitte a la manche 3, elle doit rester au podium
let leaQuit = false
const playLoop = async ({ name, page }) => {
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    const s = await probe(page)
    if (s.dead || s.fin) return s.fin
    if (name === "Lea" && s.round >= leaQuitAt && !leaQuit) {
      leaQuit = true
      say(`  Lea quitte volontairement en manche ${s.round} (elle avait repondu ${answered.Lea.size} fois)`)
      await page.getByRole("button", { name: /quitter/i }).first().click().catch(() => {})
      return "quit"
    }
    if (s.input && s.round && !answered[name].has(s.round)) {
      answered[name].add(s.round)
      await page.locator('input[placeholder*="morceau qui tourne"]').fill(`rep-${name}-${s.round}`).catch(() => {})
      await page.locator('button[type="submit"]').first().click().catch(() => {})
    }
    await sleep(600)
  }
  return false
}

// ---- pendant la manche 2 : l'hote recharge, Zoe arrive ----
const midGame = (async () => {
  // attendre la manche 2
  while (![...answered.Megane].some(r => r >= 2)) await sleep(500)
  say("  [test] l'hote recharge sa page de projection en pleine partie")
  await host.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
  await sleep(12000)
  const hs = await probe(host)
  if (hs.round || hs.fin) say(`  [ok] l'hote a retrouve sa projection (manche ${hs.round ?? "fin"})`)
  else bad(`l'hote ne retrouve pas sa partie apres rechargement (${hs.txt})`)
})()

const zoeCtx = await mk({ ...devices["iPhone 13"] })
const zoe = await zoeCtx.newPage()
wire(zoe, "Zoe")
const zoeFlow = (async () => {
  while (![...answered.Megane].some(r => r >= 2)) await sleep(500)
  say("  [test] Zoe arrive en retard pendant la partie")
  await zoe.goto(`${B}/?join=${code}`, { waitUntil: "networkidle", timeout: 90000 })
  await zoe.locator("input").first().fill("Zoe")
  await zoe.getByRole("button", { name: /continuer/i }).click()
  await zoe.getByRole("button", { name: /rejoindre la partie/i }).click().catch(() => {})
  await zoe.getByTestId("late-joiner-view").waitFor({ timeout: 30000 }).catch(() => {})
  const zs = await probe(zoe)
  await zoe.screenshot({ path: `${SHOTS}/zoe-attente.png` })
  if (zs.attente) say(`  [ok] Zoe regarde la partie en attendant la manche suivante (arrivee en manche ${zs.round})`)
  else bad(`Zoe ne voit pas la vue d'attente (${zs.txt})`)
  if (zs.organiser) bad("Zoe voit encore le bloc ORGANISER au lieu de la vue d'attente")
  if (zs.input) bad("Zoe a un champ de reponse pendant son attente")
  // Elle joue des la manche suivante, sans rien recharger.
  answered.Zoe = new Set()
  await playLoop({ name: "Zoe", page: zoe })
  const joue = [...answered.Zoe].sort((x, y) => x - y)
  if (zs.round && zs.round >= 5) say("  [ok] Zoe arrivee en derniere manche : elle jouera la partie suivante")
  else if (joue.length && !joue.includes(zs.round)) say(`  [ok] Zoe a joue les manches ${joue.join(", ")}`)
  else bad(`Zoe n'a pas joue apres son arrivee en manche ${zs.round} (manches repondues : ${joue.join(", ") || "aucune"})`)
})()

const results = await Promise.all(players.map(playLoop))
say(`partie 1 terminee (${results.map((r, i) => `${players[i].name}:${r === true ? "fin" : r}`).join(", ")})`)
await Promise.all([midGame, zoeFlow])

// ---- fin de partie : Lea doit etre au podium malgre son depart ----
await sleep(3000)
const megane = players[0].page
const fin = await megane.evaluate(() => document.body.innerText).catch(() => "")
if (/Lea/.test(fin)) say("  [ok] Lea (partie en manche 3) est toujours au classement final")
else bad("Lea a disparu du classement final apres avoir quitte")
await megane.screenshot({ path: `${SHOTS}/podium-avec-lea.png` })

// ---- Zoe, arrivee en route, est au classement final ----
if ((answered.Zoe?.size ?? 0) > 0) {
  if (/Zoe/.test(fin)) say("  [ok] Zoe est au classement final")
  else bad("Zoe a joue des manches mais n'est pas au classement final")
}

// ---- l'hote relance : Zoe doit etre dans la partie 2 ----
const replay = host.getByRole("button", { name: /rejouer|relancer/i }).first()
if (await replay.isVisible().catch(() => false)) {
  say("  [test] l'hote relance une partie")
  await replay.click()
  await sleep(12000)
  // La partie 2 tourne encore quand le script s'arrete : c'est elle qui
  // restait en 'in_progress'. Relance dans la meme salle aujourd'hui ; si un
  // jour elle en cree une autre, son code est dans l'URL de l'hote.
  const code2 = new URL(host.url()).searchParams.get("code")
  if (code2 && code2 !== code) retenirSalle(code2, hostId)
  const zs = await probe(zoe)
  if (zs.input || zs.round) say(`  [ok] Zoe joue la partie 2 (manche ${zs.round})`)
  else bad(`Zoe n'est pas dans la partie 2 (${zs.txt})`)
  await zoe.screenshot({ path: `${SHOTS}/zoe-partie2.png` })
} else {
  bad("pas de bouton Rejouer visible sur l'ecran de l'hote")
}

say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(p => say("  - " + p))
await b.close()
// menage : les bibliotheques synthetiques ne doivent pas s'accumuler en base
try { cleanupSeeded() } catch { /* tant pis */ }
process.exit(problems.length ? 1 : 0)
