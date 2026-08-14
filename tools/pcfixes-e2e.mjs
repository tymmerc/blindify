// Verifie les fixes PC : code colle avec espaces, sequence bras/vinyle/musique,
// chat integre sous le classement, statut "Parti", RPS dans le lobby a distance,
// et le buzzer sans musique importee (fonds commun).
import { chromium, devices } from "@playwright/test"
import fs from "fs"

const B = "https://dev.tymmerc.eu/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const SHOTS = "/opt/blindify/maquettes/shots/pcfixes"
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const bad = m => { problems.push(m); say("  !! " + m) }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const mk = async o => { const c = await b.newContext(o); await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY }); return c }

// ---------- 1. partie "a distance" a 2 sur PC ----------
const hostCtx = await mk({ viewport: { width: 1440, height: 900 } })
const host = await hostCtx.newPage()
host.on("pageerror", e => bad(`HOTE crash: ${String(e).slice(0, 120)}`))
await host.goto(`${B}/`, { waitUntil: "networkidle", timeout: 90000 })
await host.locator("input").first().fill("Tymeo")
await host.getByRole("button", { name: /continuer/i }).click()
await host.locator('input[placeholder^="https://"]').fill("https://www.deezer.com/profile/2529")
await host.getByRole("button", { name: /importer ma musique/i }).click()
await host.getByText(/titres? importés?/).waitFor({ timeout: 90000 })
await host.getByText("Créer une partie").click()
await host.waitForURL(/\/modes/, { timeout: 40000 })
await host.getByText("À distance").first().click()
await host.getByText(/CODE|copie le code|invite/i).first().waitFor({ timeout: 40000 }).catch(() => {})
await sleep(3000)
const hostTxt = await host.evaluate(() => document.body.innerText)
const code = (host.url().match(/code=([A-Z0-9]{6})/) || [])[1]
say("room a distance:", code)
if (!code) { bad("pas de code de room visible cote hote"); process.exit(1) }

// RPS dans le lobby a distance ?
if (/pierre|feuille|ciseaux|défie|defie/i.test(hostTxt)) say("  [ok] pierre-feuille-ciseaux present dans le lobby")
else bad("pas de pierre-feuille-ciseaux dans le lobby a distance")
await host.screenshot({ path: `${SHOTS}/1-lobby-hote.png` })

// joueur PC qui COLLE le code avec des espaces
const p2Ctx = await mk({ viewport: { width: 1280, height: 800 } })
const p2 = await p2Ctx.newPage()
p2.on("pageerror", e => bad(`LEA crash: ${String(e).slice(0, 120)}`))
await p2.goto(`${B}/`, { waitUntil: "networkidle", timeout: 90000 })
await p2.locator("input").first().fill("Lea")
await p2.getByRole("button", { name: /continuer/i }).click()
// etape musique : URL vide -> le bouton principal sert de "Continuer"
await p2.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
const joinBtn = p2.getByRole("button", { name: /rejoindre avec un code/i })
await joinBtn.waitFor({ timeout: 20000 })
await p2.screenshot({ path: `${SHOTS}/debug-action.png` })
say("  [debug action]", (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200))
say("  [debug going]", await joinBtn.getAttribute("disabled"))
// le bouton est desactive pendant l'init de session : on attend qu'il redevienne actif
for (let i = 0; i < 40 && !(await joinBtn.isEnabled()); i++) await sleep(500)
await joinBtn.click()
const spacedCode = code.split("").join(" ")
const ci = p2.locator('input[placeholder="CODE"]')
await ci.waitFor({ timeout: 15000 })
await ci.fill(spacedCode)
const cleaned = await ci.inputValue()
if (cleaned === code) say(`  [ok] code colle avec espaces nettoye ("${spacedCode}" -> "${cleaned}")`)
else bad(`code colle mal nettoye : "${cleaned}"`)
await p2.keyboard.press("Enter")
await p2.getByText(/dans la partie|salon|lobby/i).first().waitFor({ timeout: 30000 }).catch(() => {})
await sleep(2500)

// lancer et observer la sequence platine cote hote
await host.getByRole("button", { name: /lancer/i }).first().click()
const seq = []
for (let i = 0; i < 55; i++) {
  const st = await host.evaluate(() => {
    const arm = document.querySelector(".theater-tonearm")
    const vin = document.querySelector(".theater-vinyl")
    if (!arm || !vin) return null
    return { down: arm.className.includes("down"), spin: vin.className.includes("spinning") }
  }).catch(() => null)
  if (st) seq.push(`${st.down ? "D" : "u"}${st.spin ? "S" : "-"}`)
  await sleep(300)
}
const s0 = seq.join(" ")
say("  sequence bras/vinyle (u=leve D=pose S=tourne):", s0.slice(0, 120))
if (!/u-/.test(s0)) bad("le bras n'est jamais leve avant la manche")
if (/uS/.test(s0)) bad("le vinyle tourne alors que le bras est leve")
if (!/DS/.test(s0)) bad("le vinyle ne tourne jamais bras pose")
if (!/u-.*D-.*DS|u-.*DS/.test(s0)) bad("l'ordre bras pose -> rotation n'est pas respecte")
else say("  [ok] bras leve -> pose -> vinyle tourne")
await host.screenshot({ path: `${SHOTS}/2-jeu-hote.png` })

// chat integre visible sans clic ?
const chatVisible = await host.evaluate(() => !!document.querySelector(".theater-chat-inline"))
if (chatVisible) say("  [ok] chat integre sous le classement")
else bad("chat integre absent en jeu")

// Lea quitte -> statut "Parti" cote hote
await p2.getByRole("button", { name: /quitter/i }).first().click().catch(() => {})
await sleep(3000)
const afterQuit = await host.evaluate(() => document.body.innerText)
say("  [debug chips]", await host.evaluate(() => [...document.querySelectorAll(".theater-pchip")].map(c => c.innerText.replace(/\s+/g, " ")).join(" | ")))
if (/parti/i.test(afterQuit)) say("  [ok] statut 'Parti' affiche pour Lea")
else bad(`pas de statut Parti (${afterQuit.replace(/\s+/g, " ").slice(0, 140)})`)
if (/a quitté la partie/.test(afterQuit)) say("  [ok] annonce de depart affichee")
await host.screenshot({ path: `${SHOTS}/3-parti.png` })
await hostCtx.close(); await p2Ctx.close()

// ---------- 2. buzzer SANS musique importee ----------
const bz = await mk({ ...devices["iPhone 13"] })
const page = await bz.newPage()
page.on("pageerror", e => bad(`BUZZER crash: ${String(e).slice(0, 120)}`))
let soloTracks = 0
page.on("response", async r => {
  if (r.url().includes("/api/games/solo")) {
    try { soloTracks = (await r.json()).data.tracks.length } catch { /* autre */ }
  }
})
await page.goto(`${B}/buzzer/?tap`, { waitUntil: "networkidle", timeout: 60000 })
await page.locator('input[placeholder="Joueur 1"]').fill("Ana")
await page.locator('input[placeholder="Joueur 2"]').fill("Bob")
await page.getByRole("button", { name: /lancer la partie/i }).click()
const board = await page.getByText(/posez tous votre doigt/i).waitFor({ timeout: 60000 }).then(() => true).catch(() => false)
if (board) say(`  [ok] buzzer demarre SANS import (fonds commun : ${soloTracks} titres)`)
else bad(`buzzer sans import ne demarre pas (${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 140)})`)
await page.screenshot({ path: `${SHOTS}/4-buzzer-sans-import.png` })
await bz.close()

say(`\n=== ${problems.length ? problems.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problems.forEach(p => say("  - " + p))
await b.close()
process.exit(problems.length ? 1 : 0)
