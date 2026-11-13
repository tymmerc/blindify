// T30 : captures clair / sombre de tous les ecrans + controle de contraste AA.
//
//   heavy node tools/t30-captures.mjs <base> <dossier> [clair|sombre|les-deux]
//   base : https://dev.tymmerc.eu/blindify-t30 (apercu) ou https://dev.tymmerc.eu/blindify (avant)
//
// Pages statiques, puis une vraie partie "A distance" (hote ordi, invite tel)
// sur le backend de dev, bibliotheques ensemencees en SQL, tout est supprime a
// la fin. Pour chaque capture, liste des textes sous le seuil AA (4,5:1, ou
// 3:1 pour un grand texte) dans <dossier>/contraste.json.
import { chromium, devices } from "@playwright/test"
import fs from "fs"
import { seedLibrary, cleanupSeeded, psql, entier, codeSalle } from "./seed-library.mjs"

const B = process.argv[2]
const OUT = process.argv[3]
const QUOI = process.argv[4] || "les-deux"
if (!B || !OUT) { console.log("usage : t30-captures.mjs <base> <dossier> [clair|sombre|les-deux]"); process.exit(2) }
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const THEMES = QUOI === "les-deux" ? ["clair", "sombre"] : [QUOI]
const PAGES = ["/", "/faq/", "/jouer/", "/profile/", "/avis/", "/conditions/", "/comment-faire-un-blind-test-sur-spotify/", "/blind-test-soiree/", "/buzzer/", "/solo/", "/spectateur/"]
const TEL = { ...devices["iPhone 13"] }
const ORDI = { viewport: { width: 1366, height: 860 } }
const rapport = {}
const users = new Set(), codes = new Set(), ctxs = []
const problems = []
const bad = m => { problems.push(m); console.log("  !! " + m) }

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const ctx = async (opts, theme) => {
  const c = await b.newContext({ ...opts, colorScheme: theme === "sombre" ? "dark" : "light", reducedMotion: "reduce" })
  ctxs.push(c)
  await c.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
  return c
}
const page = async (c, tag) => {
  const p = await c.newPage()
  p.on("pageerror", e => bad(`${tag} crash JS : ${String(e).slice(0, 140)}`))
  p.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      let id
      try { id = (await r.json())?.data?.user?.id } catch { /* pas ce call */ }
      if (id) { try { users.add(entier(id)); p.__uid = id } catch (e) { bad(`${tag} : ${e.message}`) } }
    }
  })
  return p
}
const shot = async (p, nom) => {
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {})
  await sleep(900)
  await p.screenshot({ path: `${OUT}/${nom}.png`, fullPage: true })
  rapport[nom] = await p.evaluate(audit)
  const n = rapport[nom].sousLeSeuil.length
  console.log(`  ${nom} : ${n ? n + " texte(s) sous AA" : "AA ok"}`)
}

try {
  for (const theme of THEMES) {
    for (const [tag, opts] of [["tel", TEL], ["ordi", ORDI]]) {
      const c = await ctx(opts, theme)
      const p = await page(c, `${tag}-${theme}`)
      for (const path of PAGES) {
        await p.goto(B + path, { waitUntil: "networkidle", timeout: 90000 }).catch(e => bad(`${path} : ${e.message.split("\n")[0]}`))
        await sleep(1500)
        await shot(p, `${theme}-${tag}${path.replace(/\//g, "_").replace(/_$/, "") || "_accueil"}`)
      }
    }
    // Une vraie partie "A distance"
    const ch = await ctx(ORDI, theme), cg = await ctx(TEL, theme)
    const h = await page(ch, "hote"), g = await page(cg, "invite")
    const wizard = async (p, nom, join) => {
      await p.goto(`${B}/jouer/${join ? `?join=${join}` : ""}`, { waitUntil: "networkidle", timeout: 90000 })
      await p.locator("input").first().fill(nom)
      await p.getByRole("button", { name: /continuer/i }).click()
      if (join) await p.getByRole("button", { name: /rejoindre la partie/i }).click({ timeout: 20000 })
      else await p.getByRole("button", { name: /^continuer$/i }).click({ timeout: 20000 })
      for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
    }
    await wizard(h, "Tymeo")
    await seedLibrary(h.__uid, 20)
    await h.getByText("Créer une partie").click()
    await h.waitForURL(/\/modes/, { timeout: 40000 })
    await shot(h, `${theme}-ordi_modes`)
    await h.getByText("À distance").first().click()
    await h.locator("[data-code]").waitFor({ timeout: 40000 })
    const code = codeSalle(await h.locator("[data-code]").first().getAttribute("data-code")); codes.add(code)
    await wizard(g, "Megane", code)
    await g.locator("[data-code]").waitFor({ timeout: 60000 })
    await seedLibrary(g.__uid, 12)
    await sleep(2000)
    await shot(h, `${theme}-ordi_salle`)
    await shot(g, `${theme}-tel_salle`)
    await h.getByRole("button", { name: /^Lancer/ }).first().click({ timeout: 20000 })
    await g.getByPlaceholder(/titre/i).first().waitFor({ timeout: 60000 }).catch(() => bad("pas de champ de reponse cote invite"))
    await sleep(2500)
    await shot(g, `${theme}-tel_manche`)
    await shot(h, `${theme}-ordi_manche`)
    // Reponse et revelation
    await g.getByPlaceholder(/titre/i).first().fill("Un essai").catch(() => {})
    await g.getByRole("button", { name: /je sais pas/i }).first().click().catch(() => {})
    await h.getByRole("button", { name: /je sais pas/i }).first().click().catch(() => {})
    await sleep(4500)
    await shot(g, `${theme}-tel_revelation`)
    await shot(h, `${theme}-ordi_revelation`)
    await ch.close(); await cg.close()
  }
} catch (e) {
  bad(`arret : ${e.message.split("\n")[0]}`)
} finally {
  fs.writeFileSync(`${OUT}/contraste.json`, JSON.stringify(rapport, null, 1))
  for (const c of ctxs) await c.close().catch(() => {})
  await b.close()
  const ids = [...users].join(",")
  try {
    if (codes.size) psql(`UPDATE multiplayer_rooms SET status='finished' WHERE room_code IN (${[...codes].map(c => `'${c}'`).join(",")})`)
    cleanupSeeded([...users])
    if (ids) {
      psql(`DELETE FROM game_sessions WHERE host_user_id IN (${ids})`)
      psql(`DELETE FROM users WHERE id IN (${ids})`)
    }
    console.log(`menage : ${users.size} comptes, ${codes.size} salons`)
  } catch (e) { bad(`menage : ${e.message.split("\n")[0]}`) }
}
process.exit(problems.length ? 1 : 0)

// Execute dans la page : textes visibles sous le seuil AA.
function audit() {
  const parse = c => {
    const m = c && c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
  }
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]))
  const hex = c => "#" + c.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, "0")).join("")
  const fond = el => {
    const couches = []
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.backgroundImage && cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("url(\"data:image/svg")) return null
      const c = parse(cs.backgroundColor)
      if (c && c[3] > 0) { couches.push(c); if (c[3] >= 1) break }
    }
    let base = [255, 255, 255]
    for (const c of couches.reverse()) base = over(c, base)
    return base
  }
  const vus = new Map()
  let inconnus = 0
  const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = marche.nextNode(); n; n = marche.nextNode()) {
    if (!/\S/.test(n.nodeValue)) continue
    const el = n.parentElement
    if (!el || el.closest("svg,script,style,nextjs-portal")) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none") continue
    let opa = 1
    for (let e = el; e; e = e.parentElement) opa *= Number(getComputedStyle(e).opacity)
    if (opa < 0.99) continue // desactive ou decor anime : hors AA
    const fg = parse(cs.color), bg = fond(el)
    if (!fg) continue
    if (!bg) { inconnus++; continue }
    const f = over(fg, bg)
    const L1 = lum(f), L2 = lum(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const taille = parseFloat(cs.fontSize), gras = Number(cs.fontWeight) >= 700
    const grand = taille >= 24 || (taille >= 18.66 && gras)
    const seuil = grand ? 3 : 4.5
    if (ratio + 0.005 < seuil) {
      const cle = hex(f) + hex(bg) + n.nodeValue.trim().slice(0, 30)
      if (!vus.has(cle)) vus.set(cle, { texte: n.nodeValue.trim().slice(0, 50), texteCouleur: hex(f), fond: hex(bg), ratio: Math.round(ratio * 100) / 100, taille, classe: (el.className && el.className.baseVal === undefined ? el.className : "").slice(0, 120) })
    }
  }
  return { sousLeSeuil: [...vus.values()], fondsInconnus: inconnus }
}
