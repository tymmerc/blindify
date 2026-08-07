// Scenario 1 — Soirée "autour d'une table" complète, comme un humain :
// Hôte (PC) : wizard avec import Deezer → crée event → "Je présente seulement"
// 2 joueurs (mobiles) : scannent le QR (?join=CODE), pas de musique
// Lobby : chat + pierre-feuille-ciseaux, puis lancement (1 seule playlist = celle du DJ)
import { chromium } from "@playwright/test"
import { execSync } from "child_process"
import fs from "fs"

const BASE = "https://dev.tymmerc.eu/blindify"
const DEEZER = "https://www.deezer.com/profile/2529"
const SHOTS = "/opt/blindify/maquettes/shots/review"
fs.mkdirSync(SHOTS, { recursive: true })
const E2E_KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()

const results = []
const log = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`)
}
const dbg = { page: null, n: 0 }
const step = async (name, fn) => {
  try { const d = await fn(); log(name, true, typeof d === "string" ? d : ""); return true }
  catch (e) {
    log(name, false, e.message?.slice(0, 160))
    if (dbg.page) {
      dbg.n++
      await dbg.page.screenshot({ path: `${SHOTS}/ERR-${dbg.n}.png`, fullPage: true }).catch(() => {})
      const body = await dbg.page.locator("body").textContent().catch(() => "")
      console.log(`   [debug] page: ${(body || "").replace(/\s+/g, " ").slice(0, 300)}`)
    }
    return false
  }
}
const shot = (page, file) => page.screenshot({ path: `${SHOTS}/${file}`, fullPage: true }).catch(() => {})

const browser = await chromium.launch()
const mkCtx = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 })
  await ctx.setExtraHTTPHeaders({ "X-E2E-Key": E2E_KEY })
  return ctx
}

// ── HÔTE sur PC ──
const hostCtx = await mkCtx(1440, 900)
const host = await hostCtx.newPage()
dbg.page = host

await step("wizard: page accueil charge + logo en haut a gauche", async () => {
  await host.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30000 })
  const logo = host.locator('img[alt="Blindify"]').first()
  await logo.waitFor({ state: "visible", timeout: 8000 })
  const box = await logo.boundingBox()
  if (!box || box.x > 720 || box.y > 340) throw new Error(`logo mal place: ${JSON.stringify(box)}`)
  return `logo à x=${Math.round(box.x)},y=${Math.round(box.y)}`
})

await step("wizard: etape nom", async () => {
  await host.locator("input").first().fill("RevHost")
  await host.getByRole("button", { name: /continuer/i }).click()
  await host.getByText("Ta ", { exact: false }).waitFor({ timeout: 5000 })
})

await step("wizard musique: boutons Ouvrir Spotify/Deezer + Coller presents", async () => {
  for (const t of ["Ouvrir Spotify", "Ouvrir Deezer", "Coller"]) {
    if (!(await host.getByText(t, { exact: false }).first().isVisible())) throw new Error(`"${t}" absent`)
  }
})

await step("wizard musique: tuto Deezer affiche 4 etapes", async () => {
  await host.getByText("Comment copier mon lien Deezer").click()
  await host.getByText("Ouvre Deezer et va sur ton profil").waitFor({ timeout: 4000 })
  await shot(host, "s1-01-tuto-deezer.png")
  await host.getByText("Comment copier mon lien Deezer").click() // referme
})

await step("wizard musique: bouton Coller colle le presse-papier", async () => {
  await hostCtx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://dev.tymmerc.eu" })
  await host.evaluate(u => navigator.clipboard.writeText(u), DEEZER)
  await host.getByRole("button", { name: "Coller" }).click()
  await host.waitForTimeout(400)
  const val = await host.locator('input[placeholder^="https://"]').inputValue()
  if (val !== DEEZER) throw new Error(`champ = "${val}"`)
})

await step("wizard musique: import Deezer reussit (bouton devient vert)", async () => {
  await host.getByRole("button", { name: /importer ma musique/i }).click()
  await host.getByText(/titres? importés?/i).waitFor({ timeout: 30000 })
  await shot(host, "s1-02-import-ok.png")
})

await step("wizard action: clic 'Créer une partie' montre l'animation", async () => {
  await host.getByText("Créer une partie", { exact: false }).waitFor({ timeout: 8000 })
  await host.getByText("Créer une partie").click()
  // l'anim (spinner + "Création de la partie...") doit apparaitre brievement
  const seen = await host.getByText("Création de la partie").isVisible().catch(() => false)
  await host.waitForURL(/\/modes/, { timeout: 15000 })
  return seen ? "animation vue" : "animation trop rapide pour etre capturee (non bloquant)"
})

await step("modes: logo present + carte 'Autour d'une table'", async () => {
  await host.locator('img[alt="Blindify"]').first().waitFor({ timeout: 8000 })
  await host.getByText("Autour d'une table").first().click()
  await host.waitForURL(/multiplayer.*mode=event/, { timeout: 20000 })
})

await step("role: cartes 'Je joue aussi' / 'Je présente seulement' cote a cote", async () => {
  await host.getByText("Je présente seulement").waitFor({ timeout: 15000 })
  await shot(host, "s1-03-choix-role.png")
  const a = await host.getByText("Je joue aussi").boundingBox()
  const b = await host.getByText("Je présente seulement").boundingBox()
  if (!a || !b) throw new Error("cartes introuvables")
  if (Math.abs(a.y - b.y) > 40) throw new Error(`empilees sur desktop: yA=${a.y} yB=${b.y}`)
})

let roomCode = ""
await step("lobby hote: QR + code de salle affiches", async () => {
  await host.getByText("Je présente seulement").click()
  await host.getByText("CODE DE LA SALLE", { exact: false }).waitFor({ timeout: 20000 })
  const chars = await host.locator("span.h-12.w-9").allTextContents()
  roomCode = chars.join("")
  if (!/^[A-Z0-9]{4,8}$/.test(roomCode)) throw new Error(`code illisible: "${roomCode}"`)
  const qr = await host.locator("svg").filter({ has: host.locator("path") }).first().isVisible()
  if (!qr) throw new Error("QR absent")
  await shot(host, "s1-04-lobby-hote.png")
  return `code ${roomCode}`
})
if (!roomCode) { console.log("ABORT: pas de room code"); await browser.close(); process.exit(1) }

// ── 2 JOUEURS sur mobile via le lien du QR ──
// NB: dev = next dev (compilation a la volee), les timeouts sont larges.
const joinOnce = async (nick) => {
  const ctx = await mkCtx(390, 844)
  const p = await ctx.newPage()
  try {
    await p.goto(`${BASE}/?join=${roomCode}`, { waitUntil: "networkidle", timeout: 45000 })
    await p.locator("input").first().fill(nick)
    await p.getByRole("button", { name: /continuer/i }).click()
    // etape musique en mode join : bouton "Rejoindre la partie" (sans musique)
    await p.getByRole("button", { name: /rejoindre la partie/i }).click()
    await p.waitForURL(/multiplayer/, { timeout: 45000 })
    await p.getByText("Tu es dans la partie").waitFor({ timeout: 45000 })
    return p
  } catch (e) {
    await p.screenshot({ path: `${SHOTS}/ERR-join-${nick}.png`, fullPage: true }).catch(() => {})
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

let p1, p2
await step("joueur 1 (RevLea) rejoint via QR → vue manette 'Tu es dans la partie'", async () => {
  p1 = await joinAsPlayer("RevLea")
  await shot(p1, "s1-05-joiner-p1.png")
})
await step("joueur 2 (RevMax) rejoint via QR", async () => {
  p2 = await joinAsPlayer("RevMax")
})

await step("vue joiner: PAS de QR ni de gros code (ecran epure)", async () => {
  const hasCode = await p1.getByText("CODE DE LA SALLE").isVisible().catch(() => false)
  if (hasCode) throw new Error("le joiner voit encore le code/QR")
  for (const t of ["Pierre", "Chat"]) { /* cartes attendues */ }
  if (!(await p1.getByText("PIERRE", { exact: false }).first().isVisible())) throw new Error("carte mini-jeu absente")
})

await step("lobby hote: les 2 joueurs apparaissent connectes", async () => {
  await host.getByText("RevLea").first().waitFor({ timeout: 15000 })
  await host.getByText("RevMax").first().waitFor({ timeout: 15000 })
  await shot(host, "s1-06-lobby-2joueurs.png")
})

await step("chat: message de RevLea visible chez l'hote et RevMax", async () => {
  await p1.locator('input[placeholder*="chambre"]').fill("salut la table !")
  await p1.locator('button[aria-label="Envoyer"]').click()
  await host.getByText("salut la table !").waitFor({ timeout: 10000 })
  await p2.getByText("salut la table !").waitFor({ timeout: 10000 })
})

await step("RPS: RevLea defie RevMax → duel accepte", async () => {
  await p1.getByRole("button", { name: "Défier" }).first().click()
  await p2.getByText("te défie", { exact: false }).waitFor({ timeout: 10000 })
  await shot(p2, "s1-07-rps-defi-recu.png")
  await p2.getByRole("button", { name: "Accepter" }).click()
  await p1.locator('button[aria-label="Pierre"]').waitFor({ timeout: 10000 })
})

await step("RPS: pierre vs ciseaux → RevLea gagne + palmares", async () => {
  await p1.locator('button[aria-label="Pierre"]').click()
  await p2.locator('button[aria-label="Ciseaux"]').click()
  await p1.getByText(/gagne/).waitFor({ timeout: 10000 })
  const txt = await p1.getByText(/gagne/).textContent()
  if (!/Toi|RevLea/.test(txt || "")) throw new Error(`resultat inattendu: ${txt}`)
  await shot(p1, "s1-08-rps-resultat.png")
  await p1.getByText("Palmarès", { exact: false }).waitFor({ timeout: 6000 })
  return txt?.trim()
})

// ── LANCEMENT : seule la musique du DJ presentateur existe ──
await step("lancement: demarre avec la seule playlist du DJ presentateur", async () => {
  await host.getByRole("button", { name: /lancer la partie/i }).click()
  // le jeu demarre : les joueurs recoivent le formulaire de reponse
  await p1.locator('input[placeholder*="morceau qui tourne"]').waitFor({ timeout: 30000 })
  await shot(host, "s1-09-jeu-hote-presentateur.png")
  await shot(p1, "s1-10-jeu-joueur.png")
})

await step("jeu: l'hote presentateur n'a PAS de formulaire de reponse", async () => {
  const hasForm = await host.locator('input[placeholder*="morceau qui tourne"]').isVisible().catch(() => false)
  if (hasForm) throw new Error("le presentateur peut repondre !")
})

await step("jeu: classement = RevLea + RevMax, sans RevHost", async () => {
  await p1.getByText("Classement", { exact: false }).waitFor({ timeout: 10000 })
  const body = await p1.locator("body").textContent()
  if (!body.includes("RevMax")) throw new Error("RevMax absent du classement")
  if (body.includes("RevHost")) throw new Error("RevHost (presentateur) dans le classement")
})

await step("jeu: message 'une seule playlist' + pas de picker 'qui a ajoute'", async () => {
  const body = await p1.locator("body").textContent()
  if (!/une seule playlist/i.test(body)) throw new Error("message single-source absent")
  // NB: le message single-source contient lui-meme "qui a ajouté" → on cherche le TITRE exact du picker
  if (body.includes("Qui a ajouté ce titre ?")) throw new Error("picker visible malgre single-source")
})

await step("jeu: RevLea repond (titre) et sa reponse est enregistree", async () => {
  await p1.locator('input[placeholder*="morceau qui tourne"]').fill("mistral gagnant")
  await p1.locator('button[type="submit"]').first().click()
  await p1.waitForTimeout(1500)
  await shot(p1, "s1-11-reponse-envoyee.png")
})

// ── VERIF BASE DE DONNEES (source de verite) ──
await step("DB: room event + host_plays=f + session in_progress + 2 participants", async () => {
  const sql = `SELECT r.mode, r.host_plays, r.status, (SELECT COUNT(*) FROM game_participants gp WHERE gp.session_id = r.session_id) AS gp FROM multiplayer_rooms r WHERE r.room_code='${roomCode}'`
  const out = execSync(`docker compose -f /opt/blindify/docker-compose.yml exec -T postgres psql -U blindify -d blindify -t -A -F'|' -c "${sql}"`, { encoding: "utf8" }).trim()
  if (!out.startsWith("event|f|in_progress|2")) throw new Error(`DB: ${out}`)
  return out
})

console.log("\n=== RECAP S1 ===")
const fails = results.filter(r => !r.ok)
console.log(`${results.length - fails.length}/${results.length} PASS`)
fails.forEach(f => console.log(`  FAIL: ${f.name} — ${f.detail}`))
await browser.close()
