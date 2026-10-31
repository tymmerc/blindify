// T5 sur la pile : le mode streamer joue dans de vrais navigateurs.
//
//   campagne-ref.sh <ref> --script /chemin/absolu/tools/test-stack/streamer-e2e.mjs [dossier-captures]
//
// Un hote (le streamer, sur ordinateur), l'overlay OBS (1920x1080, lien signe
// recupere dans le lobby) et 3 viewers sur la page /live (format iPhone).
// Partie en duo : le chat repond, puis le streamer. On verifie :
//  1. le lobby donne un lien d'overlay, l'overlay affiche le code et le QR ;
//  2. l'overlay joue le bon morceau pendant la manche ; les pages viewer ne
//     jouent jamais rien ;
//  3. aucune trame recue par un viewer ne contient l'adresse d'un extrait, ni
//     le titre avant le reveal de sa manche ;
//  4. chaque viewer voit son resultat et sa place, le classement et le podium
//     de l'overlay sont ceux attendus ;
//  5. captures : overlay sur fond sombre et sur fond clair (transparence),
//     page viewer sur iPhone, page du streamer sur ordinateur.
// Code 0 si tout passe, 1 sinon.
import fs from "node:fs"
import path from "node:path"
import { chromium } from "@playwright/test"
import { oracle, seedUser } from "./testdb.mjs"
import { Bot, api } from "./bot.mjs"
import { catalog } from "./catalog.mjs"
import { APP, heardTrack, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || `/opt/blindify/.test-stack/logs/streamer-${Date.now()}`
fs.mkdirSync(OUT, { recursive: true })
const CAT = catalog()

const problems = []
const notes = []
const bad = m => { problems.push(m); console.log(`  ECHEC ${m}`) }
const ok = m => { notes.push(m); console.log(`  ok    ${m}`) }
const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  return file
}

/** Toutes les trames socket.io recues par une page (websocket ET polling), horodatees. */
function recordFrames(page) {
  const frames = []
  page.on("websocket", ws => ws.on("framereceived", f => frames.push({ at: Date.now(), text: String(f.payload) })))
  page.on("response", async r => {
    if (!r.url().includes("/socket.io/") || r.request().method() !== "GET") return
    try { frames.push({ at: Date.now(), text: await r.text() }) } catch { /* corps deja lu */ }
  })
  return frames
}

/** Le streamer : identite, musique, salle streamer en duo, 5 manches de 10 s. */
async function openHost(browser) {
  const host = await newPage(browser, { viewport: { width: 1440, height: 900 } }, "streamer", problems)
  const p = host.page
  await p.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 60000 })
  await p.locator("input").first().fill("Streamo")
  await p.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
  if (!p.__uid) throw new Error("streamer : aucune identite creee")
  seedUser(p.__uid, [0, 1, 2, 3, 4, 5, 6, 7])
  await p.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
  await p.getByText("Créer une partie").click()
  await p.waitForURL(/\/modes/, { timeout: 30000 })
  const overlayResponse = p.waitForResponse(r => /\/api\/rooms\/[A-Z0-9]+\/overlay$/.test(r.url()), { timeout: 30000 })
  await p.getByText("Avec ta communauté").first().click()
  await p.getByTestId("streamer-setup").waitFor({ timeout: 30000 })
  const code = await p.locator("[data-code]").first().getAttribute("data-code")
  const overlayUrl = (await (await overlayResponse).json())?.data?.url
  if (!overlayUrl) throw new Error("lobby : pas de lien d'overlay")
  await p.getByRole("radio", { name: /Ton chat, puis toi/ }).click()
  await p.getByRole("button", { name: "10s", exact: true }).click()
  return { host, code, overlayUrl }
}

/** L'adresse du lien d'overlay pointe sur la pile (base du front). */
function overlayOnStack(url) {
  const u = new URL(url)
  return `${APP}/streamer/overlay/${u.search}`
}

async function openViewer(browser, code, pseudo) {
  const v = await newPage(browser, IPHONE, `viewer ${pseudo}`, problems)
  const frames = recordFrames(v.page)
  await v.page.goto(`${APP}/live/?code=${code}`, { waitUntil: "networkidle", timeout: 60000 })
  await v.page.getByLabel("Ton pseudo").fill(pseudo)
  await v.page.getByRole("button", { name: "Rejoindre le live" }).click()
  await v.page.getByText("Tu es dans la partie").waitFor({ timeout: 20000 })
  return { ...v, pseudo, frames }
}

/** Overlay compose sur un fond, pour voir la transparence. */
async function composite(browser, overlayUrl, background, name) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await ctx.newPage()
  await page.setContent(`<body style="margin:0;background:${background}"><iframe src="${overlayUrl}" style="border:0;width:1920px;height:1080px;background:transparent" allowtransparency="true"></iframe></body>`)
  await sleep(3500)
  const file = await shot(page, name)
  await ctx.close()
  return file
}

async function answer(viewer, title, artist) {
  const t = viewer.page.getByLabel("Titre")
  await t.waitFor({ timeout: 15000 })
  await viewer.page.waitForFunction(() => !document.querySelector('input[aria-label="Titre"]')?.disabled, null, { timeout: 15000 })
  await t.fill(title)
  await viewer.page.getByLabel("Artiste").fill(artist)
  await viewer.page.getByRole("button", { name: "Envoyer ma réponse" }).click()
  await viewer.page.getByTestId("live-sent").waitFor({ timeout: 8000 })
}

/** Aucune trame viewer : ni extrait, ni titre avant le reveal de sa manche. */
function judgeFrames(viewer, reveals) {
  const audio = viewer.frames.filter(f => f.text.includes("/test-audio/"))
  if (audio.length) bad(`${viewer.pseudo} : ${audio.length} trame(s) avec l'adresse d'un extrait`)
  for (const { round, title, at } of reveals) {
    const early = viewer.frames.filter(f => f.at < at - 200 && f.text.includes(title))
    if (early.length) bad(`${viewer.pseudo} : titre de la manche ${round} recu avant le reveal`)
  }
  return audio.length === 0
}

async function main() {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
  const viewers = []
  let host = null
  let overlay = null
  try {
    console.log("1. Lobby du streamer et overlay")
    const opened = await openHost(browser)
    host = opened.host
    const { code, overlayUrl } = opened
    ok(`salle ${code}, lien d'overlay signe ${overlayUrl.includes("jeton=") ? "present" : "ABSENT"}`)
    const overlayLink = overlayOnStack(overlayUrl)
    overlay = await newPage(browser, { viewport: { width: 1920, height: 1080 } }, "overlay", problems)
    await overlay.page.goto(overlayLink, { waitUntil: "networkidle", timeout: 60000 })
    await overlay.page.getByTestId("overlay-join").waitFor({ timeout: 20000 })
    if (!(await overlay.page.getByTestId("overlay-join").textContent())?.includes(code)) bad("overlay : code absent")
    else ok("overlay : code et QR affiches")
    await shot(host.page, "streamer-1-lobby")

    // Le code est a l'ecran du live : personne d'autre que le streamer n'entre dans la salle.
    const intrus = await new Bot({ name: "Intrus", plan: () => ({ action: "juste" }) }).enter()
    const refus = await api(`/api/rooms/${code}/join`, { method: "POST", token: intrus.token })
    if (refus.status === 403 && refus.error?.code === "streamer_viewer") ok("un compte qui tente d'entrer dans la salle est renvoye vers /live")
    else bad(`entree dans la salle streamer non refusee (${refus.status} ${JSON.stringify(refus.error)})`)

    console.log("2. Trois viewers sur /live")
    for (const pseudo of ["Lena", "Malik", "Zoe"]) viewers.push(await openViewer(browser, code, pseudo))
    await host.page.getByText("3 viewers prêts").waitFor({ timeout: 10000 }).then(() => ok("le lobby compte 3 viewers"), () => bad("le lobby ne compte pas 3 viewers"))
    await shot(viewers[0].page, "viewer-1-attente")
    await composite(browser, overlayLink, "#18181b", "overlay-1-lobby-fond-sombre")
    await composite(browser, overlayLink, "#f2f2f2", "overlay-1-lobby-fond-clair")

    console.log("3. Manche 1 : le chat, puis le streamer")
    await host.page.getByRole("button", { name: "Lancer la partie" }).click()
    await host.page.getByTestId("streamer-next").click({ timeout: 30000 })
    await viewers[0].page.getByLabel("Titre").waitFor({ timeout: 15000 })
    const t1 = oracle(code, 1)
    if (!t1) throw new Error("manche 1 introuvable en base")
    const heard = await heardTrack(overlay.page, 8000)
    if (!heard) bad("overlay : aucun son pendant la manche 1")
    else if (heard.k !== t1.k) bad(`overlay : mauvais morceau (k=${heard.k}, attendu ${t1.k})`)
    else ok(`overlay : joue le bon morceau (${heard.title})`)
    await shot(viewers[0].page, "viewer-2-manche")
    await answer(viewers[0], t1.title, t1.artist)
    await answer(viewers[1], t1.title, "")
    await answer(viewers[2], "pas du tout", "personne")
    await shot(viewers[0].page, "viewer-3-envoye")
    await host.page.getByTestId("streamer-arrivals").getByText("3 réponses").waitFor({ timeout: 6000 }).then(() => ok("le streamer voit 3 réponses"), () => bad("le streamer ne voit pas les 3 réponses"))
    const hostText = await host.page.textContent("body")
    if (hostText.includes(t1.title)) bad("page du streamer : le titre est affiche avant le reveal")
    await shot(host.page, "streamer-2-manche")
    await composite(browser, overlayLink, "#18181b", "overlay-2-manche-fond-sombre")
    await host.page.getByTestId("streamer-guess").waitFor({ timeout: 20000 })
    await host.page.getByLabel("Titre").fill(t1.title)
    await host.page.getByLabel("Artiste").fill(t1.artist)
    await host.page.getByRole("button", { name: "Valider" }).click()
    await host.page.getByTestId("streamer-next").waitFor({ timeout: 10000 })
    const reveals = [{ round: 1, title: t1.title, at: Date.now() }]
    await viewers[0].page.getByTestId("live-result").waitFor({ timeout: 8000 })
    const r0 = await viewers[0].page.getByTestId("live-result").textContent()
    const r1 = await viewers[1].page.getByTestId("live-result").textContent()
    const r2 = await viewers[2].page.getByTestId("live-result").textContent()
    if (/Bien joué/.test(r0) && /1er sur 3/.test(r0)) ok("Lena : titre et artiste, 1re")
    else bad(`Lena : resultat inattendu (${r0})`)
    if (/Presque/.test(r1) && /2e sur 3/.test(r1)) ok("Malik : le titre seul, 2e")
    else bad(`Malik : resultat inattendu (${r1})`)
    if (/Raté/.test(r2)) ok("Zoe : ratee")
    else bad(`Zoe : resultat inattendu (${r2})`)
    if (!(await host.page.textContent("body")).includes("Toi 1 · 0 Chat")) bad("duo : la manche n'est pas au streamer")
    else ok("duo : le streamer gagne la manche 1")
    await shot(viewers[0].page, "viewer-4-reveal")
    await shot(host.page, "streamer-3-reveal")
    await composite(browser, overlayLink, "#18181b", "overlay-3-reveal-fond-sombre")
    await composite(browser, overlayLink, "#f2f2f2", "overlay-3-reveal-fond-clair")

    console.log("4. Manche 2, puis fin de partie")
    await host.page.getByTestId("streamer-next").click()
    await viewers[0].page.getByLabel("Titre").waitFor({ timeout: 15000 })
    const t2 = oracle(code, 2)
    await answer(viewers[2], t2.title, t2.artist)
    await host.page.getByTestId("streamer-next").waitFor({ timeout: 40000 })
    reveals.push({ round: 2, title: t2.title, at: Date.now() })
    await host.page.getByTestId("streamer-end").click()
    await overlay.page.getByTestId("overlay-podium").waitFor({ timeout: 10000 })
    const podium = await overlay.page.getByTestId("overlay-podium").textContent()
    if (["Lena", "Zoe", "Malik"].every(n => podium.includes(n))) ok("overlay : podium des 3 viewers")
    else bad(`overlay : podium inattendu (${podium})`)
    await composite(browser, overlayLink, "#18181b", "overlay-4-podium-fond-sombre")
    await shot(viewers[0].page, "viewer-5-fin")
    await shot(host.page, "streamer-4-fin")

    console.log("5. Anti-triche et son des viewers")
    for (const v of viewers) {
      if (judgeFrames(v, reveals)) ok(`${v.pseudo} : aucune trame avec un extrait`)
      const plays = await v.page.evaluate(() => window.__probe.plays)
      if (plays > 0) bad(`${v.pseudo} : la page viewer a joue du son (${plays})`)
    }
    if (!viewers.some(v => v.frames.length > 5)) bad("trames viewer non capturees : le controle anti-triche n'a rien vu")
  } catch (e) {
    bad(`arret : ${e.message}`)
    if (host) await shot(host.page, "erreur-streamer").catch(() => {})
    if (overlay) await shot(overlay.page, "erreur-overlay").catch(() => {})
  } finally {
    await browser.close()
  }
  fs.writeFileSync(path.join(OUT, "resultat.json"), JSON.stringify({ ok: problems.length === 0, problems, notes, catalogue: CAT.length }, null, 2))
  console.log(problems.length ? `\nKO : ${problems.length} probleme(s)` : "\nOK : mode streamer vert")
  process.exit(problems.length ? 1 : 0)
}

await main()
