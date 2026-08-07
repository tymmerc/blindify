// Scenario 2 — "j'ai change d'avis" : hote SANS musique, 2 joueurs sans musique,
// lancement bloque → CTA "Ajouter de la musique" → modale d'import → relance OK.
import { chromium } from "@playwright/test"
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

// Hote SANS musique (saute l'etape musique du wizard)
const hostCtx = await mkCtx(1440, 900)
const host = await hostCtx.newPage()

await step("hote sans musique: wizard → event → 'Je présente seulement'", async () => {
  await host.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30000 })
  await host.locator("input").first().fill("RevNoMus")
  await host.getByRole("button", { name: /continuer/i }).click()
  await host.getByRole("button", { name: /^continuer/i }).click() // musique vide → Continuer
  await host.getByText("Créer une partie").click()
  await host.waitForURL(/\/modes/, { timeout: 15000 })
  await host.getByText("Autour d'une table").first().click()
  await host.getByText("Je présente seulement").waitFor({ timeout: 15000 })
  await host.getByText("Je présente seulement").click()
  await host.getByText("CODE DE LA SALLE").waitFor({ timeout: 20000 })
})

const chars = await host.locator("span.h-12.w-9").allTextContents()
const roomCode = chars.join("")
console.log("room:", roomCode)

const joinOnce = async (nick) => {
  const ctx = await mkCtx(390, 844)
  const p = await ctx.newPage()
  p.on("response", async r => {
    if (r.url().includes("/api/") && r.status() >= 400)
      console.log(`   [net ${nick}]`, r.status(), r.request().method(), r.url().replace("https://dev.tymmerc.eu", ""), (await r.text().catch(() => "")).slice(0, 160))
  })
  try {
    await p.goto(`${BASE}/?join=${roomCode}`, { waitUntil: "networkidle", timeout: 45000 })
    await p.locator("input").first().fill(nick)
    await p.getByRole("button", { name: /continuer/i }).click()
    await p.getByRole("button", { name: /rejoindre la partie/i }).click()
    await p.getByText("Tu es dans la partie").waitFor({ timeout: 45000 })
    return p
  } catch (e) {
    await p.screenshot({ path: `${SHOTS}/ERR-s2-join-${nick}.png`, fullPage: true }).catch(() => {})
    const vis = await p.locator("main, section").first().textContent().catch(() => "")
    console.log(`   [debug ${nick}] url=${p.url()} vue: ${(vis || "").replace(/[\n\t ]+/g, " ").slice(0, 250)}`)
    await ctx.close().catch(() => {})
    throw e
  }
}
const joinAsPlayer = async (nick) => {
  try { return await joinOnce(nick) }
  catch { console.log(`   [retry] ${nick}...`); return await joinOnce(nick) }
}

await step("2 joueurs sans musique rejoignent", async () => {
  await joinAsPlayer("RevZoe")
  await host.waitForTimeout(5000) // laisse le 1er join se poser (dev server)
  await joinAsPlayer("RevTom")
  await host.getByText("RevZoe").first().waitFor({ timeout: 15000 })
  await host.getByText("RevTom").first().waitFor({ timeout: 15000 })
})

await step("lancement bloque: erreur playlist + CTA 'Ajouter de la musique'", async () => {
  await host.getByRole("button", { name: /lancer la partie/i }).click()
  await host.getByText(/au moins une playlist importée/i).waitFor({ timeout: 15000 })
  await host.getByRole("button", { name: /ajouter de la musique/i }).waitFor({ timeout: 5000 })
  await shot(host, "s2-01-erreur-cta.png")
})

await step("CTA ouvre la modale d'import (meme salle, pas de recreation)", async () => {
  await host.getByRole("button", { name: /ajouter de la musique/i }).click()
  await host.getByText("Ajoute ta musique").waitFor({ timeout: 5000 })
  await shot(host, "s2-02-modale-import.png")
})

await step("import Deezer depuis la modale", async () => {
  const input = host.locator('div.fixed input[placeholder^="https://"]')
  await input.fill(DEEZER)
  // ProfileImportBlock : bouton "Go" (ou "Importer")
  const go = host.locator("div.fixed button", { hasText: /^(Go|Importer)/i }).first()
  await go.click()
  await host.locator("div.fixed").getByText(/importé|synchronisé|titres/i).first().waitFor({ timeout: 40000 })
  await shot(host, "s2-03-import-fait.png")
})

await step("retour lobby: 'C'est bon, revenir au lobby' ferme + efface l'erreur", async () => {
  await host.getByText("C'est bon, revenir au lobby").click()
  await host.waitForTimeout(800)
  const errStill = await host.getByText(/au moins une playlist importée/i).isVisible().catch(() => false)
  if (errStill) throw new Error("l'erreur est encore affichee")
})

await step("relance: la partie demarre cette fois (meme code de salle)", async () => {
  await host.getByRole("button", { name: /lancer la partie/i }).click()
  // cote hote presentateur : l'ecran de jeu arrive (classement / manche)
  await host.getByText(/Classement|Manche|face/i).first().waitFor({ timeout: 30000 })
  await shot(host, "s2-04-partie-lancee.png")
  return `room ${roomCode}`
})

console.log("\n=== RECAP S2 ===")
const fails = results.filter(r => !r.ok)
console.log(`${results.length - fails.length}/${results.length} PASS`)
fails.forEach(f => console.log(`  FAIL: ${f.n} — ${f.d}`))
await browser.close()
