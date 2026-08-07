// Smoke test PROD post-deploiement : wizard -> event -> config -> join -> lancement.
import { chromium } from "@playwright/test"
import fs from "fs"
const BASE = "https://tymmerc.eu/blindify"
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const log = (n, ok, d = "") => console.log(`${ok ? "PASS" : "FAIL"} | ${n}${d ? " | " + d : ""}`)
const b = await chromium.launch()
const mk = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h } }); await c.setExtraHTTPHeaders({ "X-E2E-Key": E2E_KEY }); return c }

try {
  const host = await (await mk(1440, 900)).newPage()
  await host.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 45000 })
  log("prod: accueil charge + logo", await host.locator('img[alt="Blindify"]').first().isVisible())
  await host.locator("input").first().fill("SmokeDJ")
  await host.getByRole("button", { name: /continuer/i }).click()
  log("prod: boutons Ouvrir Spotify/Deezer + Coller", await host.getByText("Ouvrir Deezer").isVisible() && await host.getByText("Coller").isVisible())
  await host.locator('input[placeholder^="https://"]').fill("https://www.deezer.com/profile/2529")
  await host.getByRole("button", { name: /importer ma musique/i }).click()
  await host.getByText(/titres? importés?/).waitFor({ timeout: 40000 })
  log("prod: import Deezer", true)
  await host.getByText("Créer une partie").click()
  await host.waitForURL(/\/modes/, { timeout: 20000 })
  await host.getByText("Autour d'une table").first().click()
  await host.getByText("Je joue aussi").waitFor({ timeout: 20000 })
  await host.getByText("Je joue aussi").click()
  await host.getByText("CODE DE LA SALLE").waitFor({ timeout: 25000 })
  const code = (await host.locator("span.h-12.w-9").allTextContents()).join("")
  log("prod: lobby event cree", /^[A-Z0-9]{4,8}$/.test(code), code)
  log("prod: bloc Réglages present", await host.getByText("Réglages").isVisible())
  await host.getByRole("button", { name: "5", exact: true }).click()
  await host.getByRole("button", { name: "10s", exact: true }).click()
  await host.waitForTimeout(600)

  const p1 = await (await mk(390, 844)).newPage()
  await p1.goto(`${BASE}/?join=${code}`, { waitUntil: "networkidle", timeout: 45000 })
  await p1.locator("input").first().fill("SmokePote")
  await p1.getByRole("button", { name: /continuer/i }).click()
  await p1.getByRole("button", { name: /rejoindre la partie/i }).click()
  await p1.getByText("Tu es dans la partie").waitFor({ timeout: 45000 })
  log("prod: joueur rejoint via QR (vue manette)", true)
  log("prod: chat + mini-jeu presents", await p1.getByText("PIERRE", { exact: false }).first().isVisible())

  await host.getByText("SmokePote").first().waitFor({ timeout: 15000 })
  await host.getByRole("button", { name: /lancer la partie/i }).click()
  await p1.locator('input[placeholder*="morceau qui tourne"]').waitFor({ timeout: 45000 })
  const header = await p1.locator("header").textContent()
  log("prod: partie lancee avec config 5 manches", /\/5/.test(header || ""), (header || "").slice(0, 40))
  await p1.screenshot({ path: "/opt/blindify/maquettes/shots/review/prod-smoke-game.png", fullPage: true })
  // on quitte proprement
  await host.getByRole("button", { name: /quitter|✕/i }).first().click().catch(() => {})
} catch (e) {
  log("SMOKE", false, e.message?.slice(0, 200))
}
await b.close()
console.log("done")
