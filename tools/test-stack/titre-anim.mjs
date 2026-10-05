// Fin du grand titre de la landing (RotatingEnd, passage « volets ») sur la pile
// de test : HTML pre-rendu, CSS minifie, moins d'animations (au chargement et en
// cours de route), chaque fin sur une ligne a cinq largeurs (Chromium) et sur
// iPhone (WebKit), aucune fin lisible en double, nom du titre dans l'arbre
// d'accessibilite a chaque passage, pas de decalage de mise en page, images
// figees pendant un passage (390 et 1440) et une courte video de la vraie
// landing. Un seul tour (choix de Tym le 05/10, WCAG 2.2.2) : apres les 13
// fins, la premiere revient et se pose, puis plus rien ne bouge (10 s en temps
// reel sur chaque largeur, 60 s en horloge figee).
//
//   campagne-ref.sh <branche> --script /chemin/tools/test-stack/titre-anim.mjs [dossier]
import { chromium, devices, webkit } from "@playwright/test"
import fs from "node:fs"

const APP = "http://blindz-test.localhost:3180/blindify"
const OUT = process.argv[2] ?? "/opt/mira/dossier/preuves/2026-10-05-blindz-anim/pile"
const LARGEURS = [320, 390, 768, 1024, 1440]
const FIGES = [0, 60, 140, 220, 300, 420, 650, 1000]
const PREMIERE = "Le blind test avec vos playlists."
fs.mkdirSync(OUT, { recursive: true })

const problemes = []
const dire = (...a) => console.log(a.join(" "))
const mal = m => { problemes.push(m); dire("  !! " + m) }
const bon = m => dire("  [ok] " + m)
const propre = s => s.replace(/\s+/g, " ").trim()

// Releve des decalages de mise en page (Chromium seulement) et de l'instant ou
// la rotation remplace la fin pre-rendue (__rotation) : un decalage a ce
// moment-la compterait aussi.
const SONDE_DECALAGE = `window.__decalages = [];
try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__decalages.push({ t: e.startTime, v: e.value }) })
  .observe({ type: "layout-shift", buffered: true }) } catch {}
new MutationObserver((_, obs) => {
  if (document.querySelector("h1 .titre-fin [data-etat]")) { window.__rotation = performance.now(); obs.disconnect() }
}).observe(document, { childList: true, subtree: true })`

async function ouvrir(browser, opts) {
  const ctx = await browser.newContext(opts)
  await ctx.addInitScript(SONDE_DECALAGE)
  const page = await ctx.newPage()
  page.on("pageerror", e => mal(`erreur JS ${String(e).slice(0, 160)}`))
  await page.goto(`${APP}/`, { waitUntil: "networkidle", timeout: 120000 })
  await page.evaluate(() => document.fonts.ready)
  return { ctx, page }
}

const hydratee = page => page.waitForSelector("h1 .titre-fin [data-etat]", { state: "attached", timeout: 30000 })

/** Tourne sur toutes les fins dans la page et mesure chacune (texte entier et
 *  en lettres), la hauteur du titre, la fin lisible, les decalages. */
function tourComplet() {
  return (async () => {
    const h1 = document.querySelector("h1")
    const fin = h1.querySelector(".titre-fin")
    const fins = [...fin.querySelectorAll(":scope > [data-etat]")]
    const cs = getComputedStyle(h1)
    const boite = h1.getBoundingClientRect()
    const gauche = boite.left + parseFloat(cs.paddingLeft)
    const droite = boite.right - parseFloat(cs.paddingRight)
    const suivant = h1.nextElementSibling
    const debut = performance.now()
    const taille = parseFloat(cs.fontSize)
    // Chromium rend un rectangle par morceau de texte (avant, dans et apres le
    // <em>) : on compte les lignes par hauteur, pas par rectangle.
    const mesure = el => {
      const r = el.getBoundingClientRect()
      const hauts = [...el.getClientRects()].map(x => x.top).sort((a, b) => a - b)
      const lignes = hauts.filter((t, k) => k === 0 || t - hauts[k - 1] > taille / 2).length
      return { l: r.left, r: r.right, w: r.width, lignes }
    }
    const res = {
      n: fins.length, gauche, droite, largeurVue: document.documentElement.clientWidth,
      taille, entier: [], lettres: [], hauteurs: [], ySuivant: [], lisibles: [], debut,
      depart: fins.map(f => f.dataset.etat).join(","),
    }
    // Un seul tour : si un passage a deja eu lieu, la fin manquee ne reviendra
    // plus. On le dit tout de suite plutot que d'attendre 60 s.
    if (fins[0]?.dataset.etat !== "repos") return { ...res, enRetard: true }
    fins.forEach((f, i) => { res.entier[i] = { texte: f.textContent, ...mesure(f.firstElementChild) } })
    // Echantillons de hauteur pendant tout le tour (animations comprises)
    const echantillon = setInterval(() => {
      res.hauteurs.push(Math.round(h1.getBoundingClientRect().height * 100) / 100)
      res.ySuivant.push(Math.round(suivant.getBoundingClientRect().top * 100) / 100)
    }, 40)
    const vues = new Set()
    while (vues.size < fins.length && performance.now() - debut < 60000) {
      await new Promise(r => setTimeout(r, 40))
      const i = fins.findIndex(f => f.dataset.etat === "entre")
      if (i < 0 || vues.has(i)) continue
      vues.add(i)
      const lisibles = fins.filter(f => f.getAttribute("aria-hidden") !== "true")
      res.lisibles.push({
        nb: lisibles.length,
        estEntree: lisibles[0] === fins[i],
        lu: lisibles[0]?.querySelector(".sr-only")?.textContent ?? null,
        attendu: res.entier[i].texte,
      })
      for (const f of fins.filter(f => f.dataset.etat === "entre" || f.dataset.etat === "sort")) {
        const j = fins.indexOf(f)
        const l = f.querySelector(":scope > [aria-hidden='true']")
        if (l) res.lettres[j] = { texte: l.textContent, ...mesure(l) }
      }
      await Promise.all(fin.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {})))
    }
    clearInterval(echantillon)
    // Fin du tour : la premiere fin, revenue en lettres, se pose au battement
    // suivant (2,2 s). Ensuite, 10 s sans aucune mutation dans la fin du titre.
    const pose = ["repos", ...fins.slice(1).map(() => "attend")].join(",")
    const etats = () => fins.map(f => f.dataset.etat).join(",")
    while (etats() !== pose && performance.now() - debut < 70000) await new Promise(r => setTimeout(r, 50))
    const posee = performance.now()
    const mutations = []
    const obs = new MutationObserver(l => mutations.push(...l.map(m => m.type + ":" + (m.attributeName ?? ""))))
    obs.observe(fin, { attributes: true, childList: true, characterData: true, subtree: true })
    await new Promise(r => setTimeout(r, 10000))
    obs.disconnect()
    const premiere = fins[0]
    res.arret = {
      posee: Math.round(posee - debut),
      etats: etats(),
      mutations: mutations.length,
      exemple: mutations[0] ?? null,
      lisible: fins.findIndex(f => f.getAttribute("aria-hidden") !== "true"),
      visible: getComputedStyle(premiere).visibility === "visible" && premiere.getBoundingClientRect().width > 0,
      // innerText ignore ce qui est en visibility hidden : c'est le texte vu
      texteVu: h1.innerText,
      lettres: fin.querySelectorAll(".volet").length,
      animations: fin.getAnimations({ subtree: true }).length,
    }
    // depuis l'arrivee de la rotation (100 ms de marge avant), pas depuis le
    // chargement : les polices qui arrivent avant ne concernent pas le titre
    const depuis = (window.__rotation ?? debut) - 100
    res.decalages = (window.__decalages || []).filter(d => d.t > depuis)
    res.rotation = window.__rotation ?? null
    return res
  })()
}

function verifierTour(tag, r) {
  const avant = problemes.length
  if (r.enRetard) {
    mal(`${tag} : la rotation etait deja partie avant la mesure (${r.depart}), tour non mesure`)
    return { tag, enRetard: true }
  }
  if (r.n !== 13) mal(`${tag} : ${r.n} fins au lieu de 13`)
  const tol = 0.5
  let pire = null
  for (let i = 0; i < r.n; i++) {
    for (const [forme, m] of [["entier", r.entier[i]], ["lettres", r.lettres[i]]]) {
      if (!m) { mal(`${tag} : fin ${i} jamais vue en ${forme}`); continue }
      if (m.lignes !== 1) mal(`${tag} : « ${m.texte} » (${forme}) sur ${m.lignes} lignes`)
      if (m.r > r.droite + tol || m.l < r.gauche - tol) mal(`${tag} : « ${m.texte} » (${forme}) deborde (${m.l.toFixed(1)} a ${m.r.toFixed(1)}, colonne ${r.gauche.toFixed(1)} a ${r.droite.toFixed(1)})`)
      const marge = r.droite - m.r
      if (!pire || marge < pire.marge) pire = { marge, texte: m.texte, forme }
    }
  }
  // Crenage perdu en coupant en lettres : ecart de largeur entre les deux formes
  const crenage = Math.max(...r.entier.map((e, i) => Math.abs((r.lettres[i]?.w ?? e.w) - e.w)))
  const h = new Set(r.hauteurs), y = new Set(r.ySuivant)
  if (h.size !== 1) mal(`${tag} : hauteur du titre variable ${[...h].join(" / ")}`)
  if (y.size !== 1) mal(`${tag} : le paragraphe sous le titre bouge ${[...y].join(" / ")}`)
  const cls = r.decalages.reduce((s, d) => s + d.v, 0)
  if (r.decalages.length && cls > 0) mal(`${tag} : decalage de mise en page ${cls.toFixed(4)}`)
  if (tag.startsWith("chromium") && r.rotation === null) mal(`${tag} : arrivee de la rotation non relevee`)
  const lect = r.lisibles.filter(x => x.nb !== 1 || !x.estEntree || x.lu !== x.attendu)
  if (lect.length) mal(`${tag} : lecture d'ecran incoherente ${JSON.stringify(lect[0])}`)
  const a = r.arret
  const pose = ["repos", ...Array(r.n - 1).fill("attend")].join(",")
  if (a.etats !== pose || a.mutations || a.lisible !== 0 || !a.visible || propre(a.texteVu) !== PREMIERE || a.lettres || a.animations)
    mal(`${tag} : arret apres un tour incorrect ${JSON.stringify(a)}`)
  else bon(`${tag} : un seul tour, premiere fin posee a ${(a.posee / 1000).toFixed(1)} s, puis 10 s sans aucun changement, « ${propre(a.texteVu)} » visible`)
  if (problemes.length === avant) bon(`${tag} : ${r.n} fins x 2 formes sur une ligne (police ${r.taille}px, colonne ${(r.droite - r.gauche).toFixed(0)}px, plus juste : « ${pire?.texte} » ${pire?.forme} a ${pire?.marge.toFixed(1)}px du bord, crenage perdu ${crenage.toFixed(1)}px au plus) ; hauteur ${[...h].join("/")}px sur ${r.hauteurs.length} releves ; ${r.lisibles.length} passages avec une seule fin lisible ; decalage ${cls}`)
  return { tag, colonne: r.droite - r.gauche, taille: r.taille, plusJuste: pire, hauteur: [...h], decalage: cls, crenage, arret: r.arret, entier: r.entier, lettres: r.lettres }
}

/** Fige un passage (premiere fin -> deuxieme) a plusieurs instants et en fait
 *  une planche : une image par instant, empilees avec leur temps. */
async function planche(browser, tag, opts) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  // Horloge figee : la minuterie du titre ne part que sur runFor, un seul
  // passage, et rien ne bouge pendant les captures.
  await page.clock.install()
  await page.goto(`${APP}/`, { waitUntil: "networkidle", timeout: 120000 })
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50)
  await page.evaluate(() => document.fonts.ready)
  await hydratee(page)
  await page.screenshot({ path: `${OUT}/${tag}-repos.png` })
  await page.clock.runFor(2200)
  await page.waitForSelector("h1 .titre-fin [data-etat='entre']", { state: "attached" })
  await page.evaluate(() => document.querySelector("h1 .titre-fin").getAnimations({ subtree: true }).forEach(a => a.pause()))
  const b = await page.locator("h1").boundingBox()
  const clip = { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: Math.min(b.width + 24, opts.viewport.width - Math.max(0, b.x - 12)), height: b.height + 24 }
  const images = []
  for (const t of FIGES) {
    await page.evaluate(t => document.querySelector("h1 .titre-fin").getAnimations({ subtree: true }).forEach(a => { a.currentTime = t }), t)
    const png = await page.screenshot({ clip })
    images.push({ t, src: `data:image/png;base64,${png.toString("base64")}` })
  }
  await ctx.close()
  const p = await browser.newPage({ viewport: { width: Math.ceil(clip.width) + 140, height: 400 } })
  await p.setContent(`<body style="margin:0;background:#fff;font:14px sans-serif">${images
    .map(i => `<div style="display:flex;align-items:center;border-bottom:1px solid #999"><b style="width:120px;padding-left:12px">${i.t} ms</b><img src="${i.src}" style="width:${Math.ceil(clip.width)}px"></div>`)
    .join("")}</body>`)
  await p.screenshot({ path: `${OUT}/${tag}-passage.png`, fullPage: true })
  await p.close()
  bon(`${tag} : planche du passage (${FIGES.join(", ")} ms) -> ${tag}-passage.png`)
}

/** Nom du titre dans l'arbre d'accessibilite (calcule par Playwright, ce que
 *  lit un lecteur d'ecran) a chaque passage, horloge figee : 14 passages, donc
 *  les 13 fins et un retour au point de depart. */
async function arbreAccessibilite(browser, tag, opts) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await page.clock.install()
  await page.goto(`${APP}/`, { waitUntil: "networkidle", timeout: 120000 })
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50)
  await hydratee(page)
  // Texte entier de chaque fin (la copie sr-only si elle est en lettres) et
  // fin lue au moment ou l'horloge s'arrete
  const { fins, depart } = await page.$$eval("h1 .titre-fin > [data-etat]", fs => ({
    fins: fs.map(f => (f.querySelector(".sr-only") ?? f).textContent),
    depart: fs.findIndex(f => f.getAttribute("aria-hidden") !== "true"),
  }))
  const avant = problemes.length
  for (let k = 0; k <= fins.length; k++) {
    const i = (depart + k) % fins.length
    if (k) {
      await page.clock.runFor(2200)
      await page.waitForSelector(`h1 .titre-fin > [data-etat]:nth-child(${i + 1})[data-etat='entre']`, { state: "attached", timeout: 5000 })
    }
    const arbre = await page.locator("h1").ariaSnapshot()
    const nom = arbre.match(/^- heading "(.*)" \[level=1\]/m)?.[1]
    const attendu = propre(`Le blind test ${fins[i]}`)
    if (propre(nom ?? "") !== attendu) mal(`${tag} : passage ${k}, arbre d'accessibilite ${JSON.stringify(arbre)} au lieu de « ${attendu} »`)
  }
  // Un seul tour : un battement de plus pose la premiere fin, puis 60 s
  // d'horloge sans aucun passage
  const etats = () => page.$$eval("h1 .titre-fin > [data-etat]", fs => fs.map(f => f.dataset.etat).join(","))
  await page.clock.runFor(2200)
  // le rendu React arrive apres le battement : on attend la fin posee
  await page.waitForSelector("h1 .titre-fin > [data-etat]:nth-child(1)[data-etat='repos']", { state: "attached", timeout: 5000 }).catch(() => {})
  const pose = await etats()
  await page.clock.runFor(60000)
  // un passage en trop aurait ete rendu pendant cette attente (hors horloge)
  await page.waitForTimeout(500)
  const apres = await etats()
  const nomFin = propre((await page.locator("h1").ariaSnapshot()).match(/^- heading "(.*)" \[level=1\]/m)?.[1] ?? "")
  const attenduPose = ["repos", ...fins.slice(1).map(() => "attend")].join(",")
  if (depart !== 0 || pose !== attenduPose || apres !== pose || nomFin !== PREMIERE)
    mal(`${tag} : arret en horloge figee incorrect (depart ${depart}, ${pose} puis ${apres}, titre lu « ${nomFin} »)`)
  else bon(`${tag} : horloge figee, apres le 13e passage la premiere fin se pose et rien ne bouge pendant 60 s, titre lu « ${nomFin} »`)
  await ctx.close()
  if (problemes.length === avant) bon(`${tag} : arbre d'accessibilite, le titre se lit « Le blind test » + la bonne fin, entiere, sur ${fins.length + 1} passages de suite (les ${fins.length} fins et retour au depart)`)
}

async function video(browser, tag, opts) {
  const ctx = await browser.newContext({ ...opts, recordVideo: { dir: `${OUT}/video-tmp`, size: opts.viewport } })
  const page = await ctx.newPage()
  await page.goto(`${APP}/`, { waitUntil: "networkidle", timeout: 120000 })
  await hydratee(page)
  await page.waitForTimeout(7600)
  const v = page.video()
  await ctx.close()
  fs.renameSync(await v.path(), `${OUT}/${tag}.webm`)
  bon(`${tag} : video de 3 passages -> ${tag}.webm`)
}

/** Ouvre la page et lance la mesure des qu'elle est prete (sans attendre les
 *  autres pages) : avec un seul tour, un passage manque ne revient pas. */
async function mesurer(browser, opts) {
  const { ctx, page } = await ouvrir(browser, opts)
  await hydratee(page)
  const r = await page.evaluate(tourComplet)
  await ctx.close()
  return r
}

const chrome = await chromium.launch()

// 1. HTML pre-rendu : la premiere fin seulement, d'un seul tenant
{
  const { ctx, page } = await ouvrir(chrome, { viewport: { width: 1440, height: 900 } })
  // Le HTML tel que le serveur l'envoie, lu par le navigateur (DOMParser, pas
  // d'expression reguliere sur du HTML) ; go-prod-front.sh cherche titre-fin
  // dans la page brute, d'ou le test sur le texte brut.
  const pre = await page.evaluate(async () => {
    const brut = await fetch(location.href).then(r => r.text())
    const h1 = new DOMParser().parseFromString(brut, "text/html").querySelector("h1")
    return {
      texte: h1?.textContent ?? "",
      rotation: Boolean(h1?.querySelector("[data-etat], .volet")),
      repere: Boolean(h1?.querySelector(".titre-fin")) && brut.includes("titre-fin"),
    }
  })
  const texte = propre(pre.texte)
  if (texte !== PREMIERE) mal(`HTML pre-rendu : titre « ${texte} »`)
  else if (pre.rotation) mal("HTML pre-rendu : la rotation est deja dans le HTML")
  else if (!pre.repere) mal("HTML pre-rendu : pas de titre-fin (texte attendu par go-prod-front.sh)")
  else bon(`HTML pre-rendu : « ${texte} », rien d'autre dans le h1, repere titre-fin present`)
  // Le nom de l'animation survit-il a la minification ? Si oui, il sert de
  // deuxieme repere apres une mise en prod (le CSS est un fichier a part).
  const css = await page.evaluate(async () => {
    const liens = [...document.querySelectorAll("link[rel='stylesheet']")].map(l => l.href)
    const textes = await Promise.all(liens.map(h => fetch(h).then(r => r.text())))
    return liens.map((h, k) => ({ fichier: new URL(h).pathname, entre: textes[k].includes("@keyframes volet-entre"), kerning: /\.titre-fin\{font-kerning:none\}/.test(textes[k]) }))
  })
  const avecVolet = css.filter(c => c.entre)
  if (!avecVolet.length) mal(`CSS : @keyframes volet-entre introuvable dans ${css.map(c => c.fichier).join(", ")}`)
  else bon(`CSS minifie : @keyframes volet-entre garde son nom dans ${avecVolet.map(c => c.fichier).join(", ")} (font-kerning none : ${avecVolet.some(c => c.kerning) ? "oui" : "non"})`)
  await ctx.close()
}

// 2. Moins d'animations : rien ne bouge
{
  const { ctx, page } = await ouvrir(chrome, { viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
  await page.waitForTimeout(5000)
  const texte = propre(await page.locator("h1").innerText())
  const etats = await page.locator("h1 [data-etat]").count()
  if (texte !== PREMIERE || etats) mal(`moins d'animations : « ${texte} », ${etats} fins tournantes`)
  else bon(`moins d'animations : titre fixe « ${texte} » apres 5 s`)
  await ctx.close()
}

// 2 bis. Moins d'animations demande en cours de route : la fin affichee se pose
// et ne bouge plus, puis la rotation repart quand on retire le reglage
{
  const { ctx, page } = await ouvrir(chrome, { viewport: { width: 390, height: 844 } })
  await hydratee(page)
  await page.waitForSelector("h1 .titre-fin [data-etat='entre']", { state: "attached", timeout: 10000 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  const fige = () => page.$$eval("h1 .titre-fin > [data-etat]", fs => fs.map(f => f.dataset.etat).join(","))
  // l'evenement change arrive au rendu suivant : on attend que la fin se pose
  await page.waitForFunction(() => !document.querySelector("h1 .titre-fin [data-etat='entre'], h1 .titre-fin [data-etat='sort']"), null, { timeout: 5000 }).catch(() => {})
  const pose = await fige()
  const lettres = await page.locator("h1 .volet").count()
  await page.waitForTimeout(5000)
  const apres = await fige()
  await page.emulateMedia({ reducedMotion: "no-preference" })
  const repart = await page.waitForSelector("h1 .titre-fin [data-etat='sort']", { state: "attached", timeout: 5000 }).then(() => true, () => false)
  const etats = pose.split(",")
  if (etats.filter(e => e === "repos").length !== 1 || etats.some(e => e === "entre" || e === "sort") || lettres || apres !== pose || !repart)
    mal(`moins d'animations en cours de route : ${pose} puis ${apres}, ${lettres} lettres, repart ${repart}`)
  else bon("moins d'animations en cours de route : la fin affichee se pose (sans lettres), rien ne bouge en 5 s, la rotation repart quand on retire le reglage")
  await ctx.close()
}

// 3. Une ligne par fin, hauteur fixe, une seule fin lisible, arret apres un
// tour (Chromium, 5 largeurs en meme temps)
const mesures = []
{
  const tours = await Promise.all(LARGEURS.map(w => mesurer(chrome, { viewport: { width: w, height: w < 500 ? 844 : 900 } })))
  tours.forEach((r, k) => mesures.push(verifierTour(`chromium ${LARGEURS[k]}px`, r)))
}

// 4. Planches figees et video (Chromium)
await planche(chrome, "chromium-390", { ...devices["iPhone 13"], deviceScaleFactor: 2 })
await planche(chrome, "chromium-1440", { viewport: { width: 1440, height: 900 } })
await arbreAccessibilite(chrome, "chromium 1440px", { viewport: { width: 1440, height: 900 } })
await video(chrome, "video-1440", { viewport: { width: 1440, height: 900 } })
await video(chrome, "video-390", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
await chrome.close()

// 5. Safari (WebKit) : iPhone 13 et petit ecran
const safari = await webkit.launch()
{
  const opts = [{ ...devices["iPhone 13"] }, { ...devices["iPhone SE"], viewport: { width: 320, height: 568 } }]
  const tours = await Promise.all(opts.map(o => mesurer(safari, o)))
  tours.forEach((r, k) => mesures.push(verifierTour(`webkit ${opts[k].viewport.width}px`, r)))
}
await planche(safari, "webkit-390", { ...devices["iPhone 13"], deviceScaleFactor: 2 })
await arbreAccessibilite(safari, "webkit 390px", { ...devices["iPhone 13"] })
await safari.close()

fs.writeFileSync(`${OUT}/mesures.json`, JSON.stringify(mesures, null, 1))
fs.rmSync(`${OUT}/video-tmp`, { recursive: true, force: true })
dire(`\n=== ${problemes.length ? problemes.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problemes.forEach(p => dire("  - " + p))
process.exit(problemes.length ? 1 : 0)
