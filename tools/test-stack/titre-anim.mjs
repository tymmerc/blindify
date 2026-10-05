// Fin du grand titre de la landing (RotatingEnd, passage « volets ») sur la pile
// de test : HTML pre-rendu, moins d'animations, chaque fin sur une ligne a cinq
// largeurs (Chromium) et sur iPhone (WebKit), aucune fin lisible en double, pas
// de decalage de mise en page, images figees pendant un passage (390 et 1440)
// et une courte video de la vraie landing.
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
    }
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
  if (problemes.length === avant) bon(`${tag} : ${r.n} fins x 2 formes sur une ligne (police ${r.taille}px, colonne ${(r.droite - r.gauche).toFixed(0)}px, plus juste : « ${pire?.texte} » ${pire?.forme} a ${pire?.marge.toFixed(1)}px du bord, crenage perdu ${crenage.toFixed(1)}px au plus) ; hauteur ${[...h].join("/")}px sur ${r.hauteurs.length} releves ; ${r.lisibles.length} passages avec une seule fin lisible ; decalage ${cls}`)
  return { tag, colonne: r.droite - r.gauche, taille: r.taille, plusJuste: pire, hauteur: [...h], decalage: cls, crenage, entier: r.entier, lettres: r.lettres }
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

// 3. Une ligne par fin, hauteur fixe, une seule fin lisible (Chromium, 5 largeurs en meme temps)
const mesures = []
{
  const pages = await Promise.all(LARGEURS.map(w => ouvrir(chrome, { viewport: { width: w, height: w < 500 ? 844 : 900 } })))
  await Promise.all(pages.map(({ page }) => hydratee(page)))
  const tours = await Promise.all(pages.map(({ page }) => page.evaluate(tourComplet)))
  tours.forEach((r, k) => mesures.push(verifierTour(`chromium ${LARGEURS[k]}px`, r)))
  await Promise.all(pages.map(({ ctx }) => ctx.close()))
}

// 4. Planches figees et video (Chromium)
await planche(chrome, "chromium-390", { ...devices["iPhone 13"], deviceScaleFactor: 2 })
await planche(chrome, "chromium-1440", { viewport: { width: 1440, height: 900 } })
await video(chrome, "video-1440", { viewport: { width: 1440, height: 900 } })
await video(chrome, "video-390", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
await chrome.close()

// 5. Safari (WebKit) : iPhone 13 et petit ecran
const safari = await webkit.launch()
{
  const opts = [{ ...devices["iPhone 13"] }, { ...devices["iPhone SE"], viewport: { width: 320, height: 568 } }]
  const pages = await Promise.all(opts.map(o => ouvrir(safari, o)))
  await Promise.all(pages.map(({ page }) => hydratee(page)))
  const tours = await Promise.all(pages.map(({ page }) => page.evaluate(tourComplet)))
  tours.forEach((r, k) => mesures.push(verifierTour(`webkit ${opts[k].viewport.width}px`, r)))
  await Promise.all(pages.map(({ ctx }) => ctx.close()))
}
await planche(safari, "webkit-390", { ...devices["iPhone 13"], deviceScaleFactor: 2 })
await safari.close()

fs.writeFileSync(`${OUT}/mesures.json`, JSON.stringify(mesures, null, 1))
fs.rmSync(`${OUT}/video-tmp`, { recursive: true, force: true })
dire(`\n=== ${problemes.length ? problemes.length + " PROBLEME(S)" : "AUCUN PROBLEME"} ===`)
problemes.forEach(p => dire("  - " + p))
process.exit(problemes.length ? 1 : 0)
