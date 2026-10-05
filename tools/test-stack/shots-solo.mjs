// Captures du parcours solo et defi, au telephone (390x844) et sur ordinateur
// (1440x900) : lobby, partie, fin, creation du defi, defi releve par un ami.
// Sert aux captures avant/apres d'un changement d'interface ; tourne sur la
// pile de test (jamais sur dev ni sur la prod).
//
//   tools/test-stack/campagne-ref.sh <branche> --script $PWD/tools/test-stack/shots-solo.mjs --out /dossier/captures [--apres]
//
// --apres ajoute le parcours de l'onglet "Defier un ami" (15 a 17) et verifie
// que l'ami voit le pseudo du createur.
//
// Chaque ecran est photographie en pleine page. Le debordement horizontal est
// mesure sur chaque ecran et note dans resume.json (au-dela de 2 px = probleme).
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { APP, newPage, sleep, heardTrack } from "./probe.mjs"

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const OUT = arg("--out", "/tmp/shots-solo")
// --apres : parcours ajoutes par la refonte (onglet "Defier un ami", lien
// affiche en fin de partie, pseudo sur le defi). Sans lui : parcours d'avant.
const APRES = process.argv.includes("--apres")
const SEED = Number(arg("--seed", "5"))
const LINK = `https://www.deezer.com/fr/playlist/${SEED % 40}`
const PSEUDO = "Tym"

const VIEWPORTS = {
  tel: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["iPhone 13"].userAgent,
  },
  pc: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
}

const summary = { app: APP, seed: SEED, screens: [], problems: [], notes: [] }

async function shot(page, vp, name) {
  await sleep(400)
  const file = path.join(OUT, `${vp}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  summary.screens.push({ vp, name, file, overflow })
  if (overflow > 2) summary.problems.push(`${vp} ${name} : deborde de ${overflow} px en largeur`)
}

/** Clique le premier bouton visible dont le nom correspond, sinon rien. */
async function clickIfAny(page, name) {
  const b = page.getByRole("button", { name }).first()
  if (await b.isVisible().catch(() => false)) { await b.click(); return true }
  return false
}

/** Une manche : donne la bonne reponse (si on l'entend) ou passe. */
async function playRound(page, { answer, onDialog }) {
  const input = page.getByPlaceholder(/morceau qui tourne/i)
  await input.waitFor({ timeout: 30000 })
  if (answer) {
    const t = await heardTrack(page)
    await input.fill(t?.title ?? "rien")
    await page.getByPlaceholder(/qui chante/i).fill(t?.artist ?? "").catch(() => {})
    await page.getByRole("button", { name: /^valider$/i }).click()
  } else {
    await heardTrack(page) // apres le compte a rebours du disque
    await page.getByRole("button", { name: /passer cette question/i }).click({ timeout: 10000, force: true })
  }
  const next = page.getByRole("button", { name: /manche suivante|terminer/i })
  await Promise.race([
    next.waitFor({ timeout: 15000 }),
    page.getByText(/résultats du défi|partie terminée/i).first().waitFor({ timeout: 15000 }),
  ]).catch(() => {})
  if (onDialog && await next.isVisible().catch(() => false)) await onDialog()
  if (await next.isVisible().catch(() => false)) await next.click()
}

/** Lobby solo : chaque onglet, puis le formulaire rempli. */
async function shootLobby(page, vp) {
  await page.goto(`${APP}/modes/`, { waitUntil: "networkidle", timeout: 60000 })
  await shot(page, vp, "01-modes")
  await page.goto(`${APP}/solo/`, { waitUntil: "networkidle", timeout: 60000 })
  await shot(page, vp, "02-lobby")
  if (await clickIfAny(page, /^chrono$/i)) await shot(page, vp, "03-lobby-chrono")
  if (await clickIfAny(page, /^(défi|défier un ami|défier un pote)$/i)) await shot(page, vp, "04-lobby-defi")
}

/** Lit le code du defi dans le presse-papier apres "Defier un ami". */
async function challengeCodeFromClipboard(page, vp) {
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "")
  const code = copied.match(/code=([A-Z0-9]+)/i)?.[1] ?? null
  summary.notes.push(`${vp} : lien du defi copie = ${copied || "(rien)"}`)
  if (!code) summary.problems.push(`${vp} : pas de lien de defi dans le presse-papier`)
  return code
}

/** Cinq manches (la premiere repondue juste, les autres passees). */
async function playFive(page, vp, shots) {
  for (let i = 0; i < 5; i++) {
    await playRound(page, {
      answer: i === 0,
      onDialog: i === 0 && shots.dialog ? () => shot(page, vp, shots.dialog) : null,
    })
    if (i === 0 && shots.round) {
      // Capture en pleine manche : celle d'apres, une fois le son parti.
      await page.getByPlaceholder(/morceau qui tourne/i).waitFor({ timeout: 30000 })
      await heardTrack(page)
      await shot(page, vp, shots.round)
    }
  }
  await page.getByText(/partie terminée/i).first().waitFor({ timeout: 20000 })
  await sleep(2500)
}

/** Partie solo classique de 5 titres jusqu'a l'ecran de fin, puis creation du defi. */
async function playAndChallenge(page, vp) {
  await page.goto(`${APP}/solo/`, { waitUntil: "networkidle", timeout: 60000 })
  await page.getByPlaceholder(/open\.spotify\.com\/user/).first().fill(LINK)
  await page.getByRole("button", { name: "5", exact: true }).first().click()
  await shot(page, vp, "05-lobby-rempli")
  // Le chargement est trop court sur la pile pour etre vu : on retient la
  // reponse 2 s pour photographier l'ecran d'attente.
  await page.route("**/api/quick-play", async route => { await sleep(2000); await route.continue().catch(() => {}) }, { times: 1 })
  await page.getByRole("button", { name: /lancer le blind test/i }).click()
  await sleep(700)
  await shot(page, vp, "06-chargement")
  await playFive(page, vp, { dialog: "08-resultat-manche", round: "07-manche" })
  await shot(page, vp, "09-fin")
  await page.getByRole("button", { name: /défier un ami/i }).click()
  await sleep(1800)
  await shot(page, vp, "10-defi-cree")
  return challengeCodeFromClipboard(page, vp)
}

/** Nouveau parcours : onglet "Defier un ami" du lobby, partie, lien affiche. */
async function playChallengeTab(page, vp) {
  await page.goto(`${APP}/solo/?tab=challenge`, { waitUntil: "networkidle", timeout: 60000 })
  await page.getByPlaceholder(/open\.spotify\.com\/user/).first().fill(LINK)
  await page.getByRole("button", { name: "5", exact: true }).first().click()
  await shot(page, vp, "15-onglet-defi-rempli")
  await page.getByRole("button", { name: /jouer et lancer le défi/i }).click()
  await playFive(page, vp, {})
  await shot(page, vp, "16-onglet-defi-fin")
  const name = await page.getByLabel(/ton nom sur le défi/i).inputValue().catch(() => "")
  if (name !== PSEUDO) summary.problems.push(`${vp} : le pseudo connu n'est pas pre-rempli sur le defi ("${name}")`)
  await page.getByRole("button", { name: /défier un ami/i }).click()
  await page.getByLabel(/lien du défi/i).waitFor({ timeout: 15000 })
  await sleep(800)
  await shot(page, vp, "17-onglet-defi-pret")
  const shown = await page.getByLabel(/lien du défi/i).inputValue()
  if (!/\/challenge\/\?code=/.test(shown)) summary.problems.push(`${vp} : le lien du defi n'est pas affiche (${shown})`)
  return challengeCodeFromClipboard(page, vp)
}

/** L'ami : page sans code, accueil du defi, une manche, resultats. */
async function friendSide(browser, vp, code) {
  const problems = []
  const { ctx, page } = await newPage(browser, VIEWPORTS[vp], `${vp}-ami`, problems)
  try {
    await page.goto(`${APP}/challenge/`, { waitUntil: "networkidle", timeout: 60000 })
    await shot(page, vp, "11-defi-sans-code")
    await page.goto(`${APP}/challenge/?code=${code}`, { waitUntil: "networkidle", timeout: 60000 })
    if (APRES && !(await page.getByText(`Défi de ${PSEUDO}`).isVisible().catch(() => false))) {
      summary.problems.push(`${vp} : l'ami ne voit pas "Defi de ${PSEUDO}"`)
    }
    await page.getByPlaceholder("Ton pseudo").fill("Rival")
    await shot(page, vp, "12-defi-accueil")
    await page.getByRole("button", { name: /jouer|relever|commencer|lancer/i }).first().click()
    for (let i = 0; i < 5; i++) {
      await playRound(page, { answer: i === 0 })
      if (i === 0) {
        await page.getByPlaceholder(/morceau qui tourne/i).waitFor({ timeout: 30000 })
        await heardTrack(page)
        await shot(page, vp, "13-defi-manche")
      }
    }
    await page.getByText(/résultats du défi/i).waitFor({ timeout: 20000 })
    await sleep(2500)
    await shot(page, vp, "14-defi-resultats")
  } finally {
    summary.problems.push(...problems)
    await ctx.close().catch(() => {})
  }
}

async function runViewport(browser, vp) {
  const problems = []
  const { ctx, page } = await newPage(browser, VIEWPORTS[vp], vp, problems)
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(APP).origin })
  // Un joueur qui revient : pseudo deja connu (comme apres /jouer).
  await ctx.addInitScript(p => { try { localStorage.setItem("blindify_nickname", p) } catch { /* rien */ } }, PSEUDO)
  try {
    await shootLobby(page, vp)
    const classicCode = await playAndChallenge(page, vp)
    const code = APRES ? await playChallengeTab(page, vp) : classicCode
    if (code) await friendSide(browser, vp, code)
  } catch (e) {
    summary.problems.push(`${vp} : arret : ${e.message.split("\n").slice(0, 4).join(" / ").slice(0, 300)}`)
    await page.screenshot({ path: path.join(OUT, `${vp}-erreur.png`), fullPage: true }).catch(() => {})
  } finally {
    summary.problems.push(...problems)
    await ctx.close().catch(() => {})
  }
}

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
  ignoreDefaultArgs: ["--mute-audio"],
})
try {
  for (const vp of Object.keys(VIEWPORTS)) await runViewport(browser, vp)
} finally {
  await browser.close()
}
fs.writeFileSync(path.join(OUT, "resume.json"), JSON.stringify(summary, null, 2))
console.log(`${summary.screens.length} captures dans ${OUT}`)
for (const s of summary.screens) console.log(`  ${s.vp} ${s.name}${s.overflow > 2 ? ` (deborde de ${s.overflow} px)` : ""}`)
for (const p of summary.problems) console.log(`  !! ${p}`)
process.exit(summary.problems.length ? 1 : 0)
