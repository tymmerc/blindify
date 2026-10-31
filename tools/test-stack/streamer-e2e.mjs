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
//  6. (T5b) le chat Twitch, par le faux serveur IRC : les reponses `!b` sont
//     lues pendant la manche, le chat gagne moitie moins, le copieur presque
//     rien, et la lecture reprend apres une coupure du chat.
//  7. l'overlay se reconnecte 30 fois de suite sans etre bloque ; l'hote
//     exclut un pseudo : il quitte la manche, sa page le dit, il ne revient pas.
// Code 0 si tout passe, 1 sinon.
import fs from "node:fs"
import path from "node:path"
import { chromium } from "@playwright/test"
import { io as ioClient } from "socket.io-client"
import { oracle, seedUser } from "./testdb.mjs"
import { Bot, api } from "./bot.mjs"
import { catalog } from "./catalog.mjs"
import { APP, heardTrack, newPage, sleep } from "./probe.mjs"

const IRC = "http://127.0.0.1:3180/twitch-irc-stub"
const CHANNEL = "chaine_de_test"
const chat = messages => fetch(`${IRC}/say`, { method: "POST", body: JSON.stringify(messages) }).then(r => r.json())
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
  // T5b : la chaine Twitch, si le lobby la propose (absente sur T5a).
  const twitchField = p.getByLabel("Ta chaîne Twitch (facultatif)")
  const withChat = await twitchField.isVisible().catch(() => false)
  if (withChat) await twitchField.fill(CHANNEL)
  return { host, code, overlayUrl, withChat }
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

/** Aucune trame viewer : ni extrait, ni titre avant LA trame de reveal de sa manche. */
function judgeFrames(viewer, reveals) {
  const audio = viewer.frames.filter(f => f.text.includes("/test-audio/"))
  if (audio.length) bad(`${viewer.pseudo} : ${audio.length} trame(s) avec l'adresse d'un extrait`)
  for (const { round, title } of reveals) {
    // Ordre d'arrivee des trames : la premiere qui porte le reveal final de la manche.
    const first = viewer.frames.findIndex(f => f.text.includes("round:reveal:final") && f.text.includes(title))
    const before = first < 0 ? viewer.frames : viewer.frames.slice(0, first)
    const early = before.filter(f => f.text.includes(title))
    if (first < 0) bad(`${viewer.pseudo} : aucun reveal recu pour la manche ${round}`)
    if (early.length) bad(`${viewer.pseudo} : titre de la manche ${round} recu avant le reveal (${early[0].text.slice(0, 160)})`)
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
    const { code, overlayUrl, withChat } = opened
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

    // Un overlay qui se reconnecte souvent (wifi du streamer, OBS qui recharge)
    // ne doit jamais etre bloque par la limite de debit.
    const u = new URL(overlayLink)
    let reconnects = 0
    for (let i = 0; i < 30; i++) {
      const s = ioClient("http://blindz-test.localhost:3180", {
        path: "/blindify/socket.io", transports: ["websocket"], reconnection: false, forceNew: true,
        auth: { overlay: { salle: u.searchParams.get("salle"), jeton: u.searchParams.get("jeton") } },
      })
      const okConnect = await new Promise(resolve => {
        s.on("connect", () => resolve(true))
        s.on("connect_error", () => resolve(false))
        setTimeout(() => resolve(false), 5000)
      })
      s.close()
      if (okConnect) reconnects++
    }
    if (reconnects === 30) ok("overlay : 30 reconnexions de suite, aucune bloquee")
    else bad(`overlay : ${30 - reconnects} reconnexion(s) refusee(s) sur 30`)

    console.log("2. Trois viewers sur /live")
    for (const pseudo of ["Lena", "Malik", "Zoe"]) viewers.push(await openViewer(browser, code, pseudo))
    await host.page.getByText("3 viewers prêts").waitFor({ timeout: 10000 }).then(() => ok("le lobby compte 3 viewers"), () => bad("le lobby ne compte pas 3 viewers"))
    await shot(viewers[0].page, "viewer-1-attente")
    const vilain = await openViewer(browser, code, "Vilain")
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
    if (withChat) {
      await host.page.getByTestId("streamer-twitch").getByText("lu en direct").waitFor({ timeout: 10000 })
        .then(() => ok("chat Twitch : lu en direct"), () => bad("chat Twitch : pas connecte au faux IRC"))
      const r = await chat([
        { channel: CHANNEL, login: "chatteur1", displayName: "Chatteur1", text: `!b ${t1.title} - ${t1.artist}` },
        { channel: CHANNEL, login: "bavard", text: `${t1.title} c'est facile` },
        { channel: CHANNEL, login: "chatteur1", text: "!b autre - reponse" },
      ])
      if (r.delivered !== 3) bad(`faux chat : ${r.delivered} message(s) remis sur 3`)
      await sleep(3000)
      await chat({ channel: CHANNEL, login: "copieur", displayName: "Copieur", text: `!b ${t1.title} - ${t1.artist}` })
    }
    await answer(viewers[0], t1.title, t1.artist)
    await answer(viewers[1], t1.title, "")
    await answer(viewers[2], "pas du tout", "personne")
    // L'hote exclut « Vilain » depuis les reponses qui arrivent (deux clics).
    await answer(vilain, t1.title, t1.artist)
    await host.page.getByRole("button", { name: "Exclure Vilain" }).first().click({ timeout: 5000 })
    await host.page.getByRole("button", { name: "Confirmer : exclure Vilain" }).click({ timeout: 5000 })
    await vilain.page.getByText("Le streamer t'a retiré de cette partie.").waitFor({ timeout: 8000 })
      .then(() => ok("exclure : la page du viewer exclu le dit"), () => bad("exclure : la page du viewer exclu ne change pas"))
    await shot(vilain.page, "viewer-exclu")
    await shot(viewers[0].page, "viewer-3-envoye")
    await host.page.getByTestId("streamer-arrivals").getByText(withChat ? "5 réponses" : "3 réponses").waitFor({ timeout: 6000 }).then(() => ok(`le streamer voit ${withChat ? 5 : 3} réponses`), () => bad("le streamer ne voit pas toutes les réponses"))
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
    // Apres le reveal (la phase du chat est finie) : Vilain tente de revenir.
    await vilain.page.goto(`${APP}/live/?code=${code}`, { waitUntil: "networkidle", timeout: 60000 })
    await vilain.page.getByLabel("Ton pseudo").fill("Vilain")
    await vilain.page.getByRole("button", { name: "Rejoindre le live" }).click()
    await vilain.page.getByText("Le streamer t'a retiré de cette partie.").waitFor({ timeout: 8000 })
      .then(() => ok("exclure : il ne revient pas, meme en rouvrant la page"), () => bad("exclure : le viewer exclu est revenu"))
    const boardAfterKick = await overlay.page.getByTestId("streamer-leaderboard").textContent()
    if (boardAfterKick.includes("Vilain")) bad("exclure : Vilain est encore au classement de l'overlay")
    else ok("exclure : Vilain n'apparait pas au classement, malgre sa bonne reponse")
    await viewers[0].page.getByTestId("live-result").waitFor({ timeout: 8000 })
    const r0 = await viewers[0].page.getByTestId("live-result").textContent()
    const r1 = await viewers[1].page.getByTestId("live-result").textContent()
    const r2 = await viewers[2].page.getByTestId("live-result").textContent()
    if (/Bien joué/.test(r0) && /1er sur \d/.test(r0)) ok("Lena : titre et artiste, 1re")
    else bad(`Lena : resultat inattendu (${r0})`)
    if (/Presque/.test(r1) && /e sur \d/.test(r1)) ok("Malik : le titre seul, classe")
    else bad(`Malik : resultat inattendu (${r1})`)
    if (/Raté/.test(r2)) ok("Zoe : ratee")
    else bad(`Zoe : resultat inattendu (${r2})`)
    if (!(await host.page.textContent("body")).includes("Toi 1 · 0 Chat")) bad("duo : la manche n'est pas au streamer")
    else ok("duo : le streamer gagne la manche 1")
    if (withChat) {
      const board = await overlay.page.getByTestId("streamer-leaderboard").textContent()
      const lines = (await overlay.page.getByTestId("streamer-leaderboard").locator("li").allTextContents()).map(t => t.replace(/\s+/g, " "))
      const pts = name => Number((lines.find(l => l.includes(name)) ?? "").match(/(\d+)\s*$/)?.[1] ?? NaN)
      if (!/Chatteur1/.test(board) || !/chat/.test(board)) bad(`overlay : Chatteur1 absent du classement ou sans la marque chat (${board})`)
      else ok("overlay : le chat est au classement, avec sa marque")
      const lena = pts("Lena"), c1 = pts("Chatteur1"), cp = pts("Copieur")
      // Plein bareme : 30 au plus sur la page, donc 15 au plus dans le chat.
      if (c1 > 0 && c1 <= 15) ok(`chat : moitié du barème (Chatteur1 ${c1}, Lena ${lena} sur la page)`)
      else bad(`chat : barème inattendu (Chatteur1 ${c1}, Lena ${lena})`)
      if (!Number.isNaN(cp) && cp >= c1 / 2) bad(`anti-spoiler : le copieur garde trop de points (${cp})`)
      else ok(`anti-spoiler : le copieur 3 s plus tard prend ${Number.isNaN(cp) ? "trop peu pour le top 5" : `${cp} point(s)`}`)
    }
    await shot(viewers[0].page, "viewer-4-reveal")
    await shot(host.page, "streamer-3-reveal")
    await composite(browser, overlayLink, "#18181b", "overlay-3-reveal-fond-sombre")
    await composite(browser, overlayLink, "#f2f2f2", "overlay-3-reveal-fond-clair")

    console.log("4. Manche 2, puis fin de partie")
    await host.page.getByTestId("streamer-next").click()
    await viewers[0].page.getByLabel("Titre").waitFor({ timeout: 15000 })
    const t2 = oracle(code, 2)
    if (withChat) {
      // Coupure du chat : le lecteur se reconnecte seul, puis lit de nouveau.
      await fetch(`${IRC}/drop`, { method: "POST" })
      await host.page.getByTestId("streamer-twitch").getByText("on se reconnecte").waitFor({ timeout: 5000 })
        .then(() => ok("chat Twitch : la coupure se voit chez le streamer"), () => bad("chat Twitch : coupure invisible chez le streamer"))
      let back = false
      for (let i = 0; i < 40 && !back; i++) {
        const st = await (await fetch(`${IRC}/state`)).json()
        back = st.clients.some(c => c.channels.includes(CHANNEL))
        if (!back) await sleep(250)
      }
      if (back) ok("chat Twitch : reprise apres une coupure")
      else bad("chat Twitch : pas de reprise apres coupure")
      await host.page.getByTestId("streamer-twitch").getByText("lu en direct").waitFor({ timeout: 5000 }).catch(() => bad("chat Twitch : l'etat ne revient pas a « lu en direct »"))
      const r = await chat({ channel: CHANNEL, login: "revenant", displayName: "Revenant", text: `!b ${t2.title} - ${t2.artist}` })
      if (r.delivered !== 1) bad("faux chat : message non remis apres la reprise")
    }
    await answer(viewers[2], t2.title, t2.artist)
    await host.page.getByTestId("streamer-next").waitFor({ timeout: 40000 })
    reveals.push({ round: 2, title: t2.title, at: Date.now() })
    await host.page.getByTestId("streamer-end").click()
    await overlay.page.getByTestId("overlay-podium").waitFor({ timeout: 10000 })
    const podium = await overlay.page.getByTestId("overlay-podium").textContent()
    if (withChat) {
      const finalBoard = await host.page.getByTestId("streamer-leaderboard").textContent()
      if (finalBoard.includes("Revenant")) ok("chat : la reponse lue apres la reprise compte")
      else bad(`chat : la reponse lue apres la reprise n'a pas compte (${finalBoard})`)
    }
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
