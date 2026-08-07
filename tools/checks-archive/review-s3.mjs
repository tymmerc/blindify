// Scenario 3 — Hote "Je joue aussi" : il apparait dans les connectes ET dans la
// partie, et il A le formulaire de reponse. + Scenario 4 : divers (friends chat,
// logo modes, redirect nginx sans :8443).
import { chromium } from "@playwright/test"
import { execSync } from "child_process"
import fs from "fs"

const BASE = "https://dev.tymmerc.eu/blindify"
const DEEZER = "https://www.deezer.com/profile/2529"
const SHOTS = "/opt/blindify/maquettes/shots/review"
fs.mkdirSync(SHOTS, { recursive: true })
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()

const results = []
const log = (n, ok, d = "") => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"} | ${n}${d ? " | " + d : ""}`) }
const step = async (n, fn) => { try { const d = await fn(); log(n, true, typeof d === "string" ? d : ""); return true } catch (e) { log(n, false, e.message?.slice(0, 160)); return false } }
const shot = (p, f) => p.screenshot({ path: `${SHOTS}/${f}`, fullPage: true }).catch(() => {})

const browser = await chromium.launch()
const mkCtx = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 })
  await ctx.setExtraHTTPHeaders({ "X-E2E-Key": E2E_KEY })
  return ctx
}

// ── S3 : hote joue aussi ──
const hostCtx = await mkCtx(1440, 900)
const host = await hostCtx.newPage()
let roomCode = ""

await step("hote AVEC musique choisit 'Je joue aussi'", async () => {
  await host.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30000 })
  await host.locator("input").first().fill("RevDJ")
  await host.getByRole("button", { name: /continuer/i }).click()
  await host.locator('input[placeholder^="https://"]').fill(DEEZER)
  await host.getByRole("button", { name: /importer ma musique/i }).click()
  await host.getByText(/titres? importés?/i).waitFor({ timeout: 40000 })
  await host.getByText("Créer une partie").click()
  await host.waitForURL(/\/modes/, { timeout: 15000 })
  await host.getByText("Autour d'une table").first().click()
  await host.getByText("Je joue aussi").waitFor({ timeout: 15000 })
  await host.getByText("Je joue aussi").click()
  await host.getByText("CODE DE LA SALLE").waitFor({ timeout: 20000 })
  const chars = await host.locator("span.h-12.w-9").allTextContents()
  roomCode = chars.join("")
  return `room ${roomCode}`
})

await step("l'hote-joueur apparait dans la liste des connectes", async () => {
  await host.getByText("RevDJ").waitFor({ timeout: 15000 })
  await shot(host, "s3-01-hote-dans-liste.png")
})

let p1
await step("1 joueur rejoint", async () => {
  const ctx = await mkCtx(390, 844)
  p1 = await ctx.newPage()
  await p1.goto(`${BASE}/?join=${roomCode}`, { waitUntil: "networkidle", timeout: 30000 })
  await p1.locator("input").first().fill("RevAmi")
  await p1.getByRole("button", { name: /continuer/i }).click()
  await p1.getByRole("button", { name: /rejoindre la partie/i }).click()
  await p1.getByText("Tu es dans la partie").waitFor({ timeout: 25000 })
})

await step("lancement: l'hote-joueur A le formulaire de reponse", async () => {
  await host.getByText("RevAmi").first().waitFor({ timeout: 15000 })
  await host.getByRole("button", { name: /lancer la partie/i }).click()
  await host.locator('input[placeholder*="morceau qui tourne"]').waitFor({ timeout: 45000 })
  await shot(host, "s3-02-hote-repond.png")
})

await step("classement (en jeu): RevDJ ET RevAmi tous les deux dedans", async () => {
  // garde-fou : on doit etre EN JEU (formulaire visible), pas au lobby
  if (!(await host.locator('input[placeholder*="morceau qui tourne"]').isVisible())) throw new Error("pas en jeu")
  const body = await host.locator("body").textContent()
  if (!body.includes("RevDJ")) throw new Error("hote absent du classement")
  if (!body.includes("RevAmi")) throw new Error("joueur absent du classement")
})

await step("DB: host_plays=t + 2 participants au jeu", async () => {
  const sql = `SELECT r.mode, r.host_plays, (SELECT COUNT(*) FROM game_participants gp WHERE gp.session_id = r.session_id) FROM multiplayer_rooms r WHERE r.room_code='${roomCode}'`
  const out = execSync(`docker compose -f /opt/blindify/docker-compose.yml exec -T postgres psql -U blindify -d blindify -t -A -F'|' -c "${sql}"`, { encoding: "utf8" }).trim()
  if (!out.startsWith("event|t|2")) throw new Error(`DB: ${out}`)
  return out
})

// ── S4 : divers ──
await step("friends: lobby auto-heberge + chat partage present", async () => {
  const ctx = await mkCtx(1280, 800)
  const f = await ctx.newPage()
  await f.goto(`${BASE}/multiplayer/?mode=friends&intent=host`, { waitUntil: "networkidle", timeout: 45000 })
  try {
    await f.getByText(/Lobby · Chat|dis quelque chose/i).first().waitFor({ timeout: 45000 })
  } catch (e) {
    await shot(f, "ERR-friends.png")
    const vis = await f.locator("main, section").first().textContent().catch(() => "")
    console.log(`   [debug friends] url=${f.url()} vue: ${(vis || "").replace(/[\n\t ]+/g, " ").slice(0, 250)}`)
    throw e
  }
  await shot(f, "s4-01-friends-chat.png")
})

await step("nginx: redirect /blindify → /blindify/ SANS :8443", async () => {
  const out = execSync(`curl -s -o /dev/null -D - https://dev.tymmerc.eu/blindify | grep -i '^location'`, { encoding: "utf8" }).trim()
  if (out.includes("8443")) throw new Error(out)
  return out
})

await step("favicon + logo-mark servis (200)", async () => {
  for (const f of ["logo-mark.png", "favicon-32x32.png", "apple-touch-icon.png", "icon-512.png"]) {
    const code = execSync(`curl -s -o /dev/null -w '%{http_code}' ${BASE}/${f}`, { encoding: "utf8" })
    if (code !== "200") throw new Error(`${f}: ${code}`)
  }
})

console.log("\n=== RECAP S3+S4 ===")
const fails = results.filter(r => !r.ok)
console.log(`${results.length - fails.length}/${results.length} PASS`)
fails.forEach(f => console.log(`  FAIL: ${f.n} — ${f.d}`))
await browser.close()
