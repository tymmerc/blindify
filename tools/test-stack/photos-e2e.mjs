// Photo de profil (T39) sur la pile de test, jamais la prod.
//
// Un vrai navigateur fait le parcours du debut : pseudo, photo choisie dans le
// rond, « Continuer » (la photo part), musique passee, puis il rejoint une
// salle ou cinq robots attendent, trois avec une photo et deux sans. On
// verifie que la photo est bien enregistree, que la salle d'attente montre les
// photos (chargees par l'API) et les initiales des autres, que « Mon compte »
// la montre, et qu'un fichier qui n'est pas une image est refuse. Captures en
// clair et en sombre (telephone).
//
//   campagne-ref.sh <ref> --script /abs/tools/test-stack/photos-e2e.mjs <dossier>
// (STACK_DEPS=ci tant que les dependances du depot n'ont pas sharp)
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { Bot, api } from "./bot.mjs"
import { seedUser } from "./testdb.mjs"

const { chromium } = createRequire("/opt/blindify/tools/")("@playwright/test")
const APP = "http://blindz-test.localhost:3180/blindify"
const BACKEND = "http://127.0.0.1:3098"
const ORIGIN = "http://blindz-test.localhost:3180"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
const OUT = process.argv[2] || "/tmp/photos-e2e"
fs.mkdirSync(OUT, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const problems = []
const say = (...a) => console.log(a.join(" "))
const check = (cond, msg) => { if (cond) say("  [ok] " + msg); else { problems.push(msg); say("  !! " + msg) } }

// Des portraits dessines (silhouette sur fond uni), faits par le navigateur :
// aucune dependance d'image ici.
async function portraits(page, colors) {
  const urls = await page.evaluate(list => list.map(([bg, fg]) => {
    const c = document.createElement("canvas")
    c.width = 900; c.height = 700
    const g = c.getContext("2d")
    g.fillStyle = bg; g.fillRect(0, 0, 900, 700)
    g.fillStyle = fg
    g.beginPath(); g.arc(450, 290, 130, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(450, 700, 260, 230, 0, Math.PI, 0); g.fill()
    return c.toDataURL("image/png")
  }), colors)
  return urls.map(u => Buffer.from(u.split(",")[1], "base64"))
}

async function uploadAs(bot, image) {
  const res = await fetch(`${BACKEND}/api/photos`, {
    method: "POST",
    headers: { "Content-Type": "image/png", "X-E2E-Key": KEY, Origin: ORIGIN, Authorization: `Bearer ${bot.token}` },
    body: image,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
  say(`  capture ${name}.png`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
const page = await ctx.newPage()
page.on("pageerror", e => problems.push(`erreur JS : ${String(e).slice(0, 160)}`))

try {
  say("== la salle : cinq robots, trois avec une photo")
  await page.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 120000 })
  const [mine, ...others] = await portraits(page, [
    ["#c65133", "#f4ecdb"], ["#7d9471", "#2e2014"], ["#e0a32e", "#2e2014"], ["#a8b8c8", "#2e2014"],
  ])
  const names = ["Lila", "Noé", "Sam", "Inès", "Max"]
  const bots = names.map((name, i) => new Bot({ name, plan: () => ({ action: "juste" }), random: () => 0.5 + i / 100 }))
  await Promise.all(bots.map(b => b.enter()))
  bots.forEach((b, i) => seedUser(b.id, Array.from({ length: 6 }, (_, t) => i * 6 + t)))
  for (const [i, image] of others.entries()) {
    const up = await uploadAs(bots[i], image)
    check(up.status === 201 && /^\/api\/photos\/[0-9a-f-]{36}\.webp$/.test(up.body?.data?.avatar ?? ""), `${names[i]} : photo envoyee (${up.status})`)
  }
  const refused = await uploadAs(bots[4], Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))
  check(refused.status === 415, `un SVG est refuse (${refused.status})`)

  const host = bots[0]
  const created = await api("/api/rooms/create", { method: "POST", token: host.token, body: { mode: "friends", nickname: host.name } })
  const code = created.data?.room?.room_code
  if (!code) throw new Error(`creation refusee (${created.status} ${JSON.stringify(created.error)})`)
  host.code = code
  await host.connect()
  host.socket.emit("room:join", { roomCode: code })
  for (const b of bots.slice(1)) await b.join(code)
  await sleep(500)

  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(`${APP}/jouer/`, { waitUntil: "networkidle" })
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${APP}/jouer/`, { waitUntil: "networkidle" })
    await sleep(600)
    await shot(page, `debut-rond-vide-${scheme === "light" ? "clair" : "sombre"}`)
  }

  say("== le parcours du debut, avec une photo")
  await page.emulateMedia({ colorScheme: "light" })
  await page.getByPlaceholder("Ton nom").fill("Tym-test")
  await page.getByTestId("photo-input").setInputFiles({ name: "moi.png", mimeType: "image/png", buffer: mine })
  await page.waitForSelector("[data-testid=photo-picker] img", { timeout: 10000 })
  await sleep(400)
  await shot(page, "debut-avec-photo-clair")
  await page.emulateMedia({ colorScheme: "dark" })
  await sleep(400)
  await shot(page, "debut-avec-photo-sombre")
  await page.emulateMedia({ colorScheme: "light" })

  await page.getByRole("button", { name: /Continuer/ }).click()
  await page.waitForSelector("input[inputmode=url]", { timeout: 15000 })
  const me = await page.evaluate(async api => (await fetch(`${api}/api/auth/me`, { credentials: "include" })).json(), APP)
  const myAvatar = me?.data?.user?.avatar ?? ""
  check(/^\/api\/photos\/[0-9a-f-]{36}\.webp$/.test(myAvatar), "ma photo est enregistree des le « Continuer »")
  const served = await page.evaluate(async url => {
    const r = await fetch(url)
    return { status: r.status, type: r.headers.get("content-type"), robots: r.headers.get("x-robots-tag") }
  }, `${APP}${myAvatar}`)
  check(served.status === 200 && served.type === "image/webp" && /noindex/.test(served.robots ?? ""), `elle se sert en WebP, non indexee (${served.status} ${served.type})`)

  await page.getByRole("button", { name: /Continuer/ }).click()
  await page.getByRole("button", { name: /Rejoindre avec un code/ }).click()
  await page.getByPlaceholder("CODE").fill(code)
  await page.getByRole("button", { name: /^Rejoindre/ }).click()
  await page.waitForURL(/\/multiplayer/, { timeout: 30000 })
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=player-avatar]").length >= 6, null, { timeout: 30000 })
  await sleep(1500)

  say("== la salle d'attente")
  const avatars = await page.$$eval("[data-testid=player-avatar]", els => els.map(el => {
    const img = el.querySelector("img")
    return { photo: Boolean(img), loaded: img ? img.complete && img.naturalWidth > 0 : false, text: el.textContent }
  }))
  const photos = avatars.filter(a => a.photo)
  check(avatars.length === 6, `six joueurs dans la salle (${avatars.length})`)
  check(photos.length === 4, `quatre photos affichees : trois robots et moi (${photos.length})`)
  check(photos.every(a => a.loaded), "toutes les photos sont chargees")
  check(avatars.filter(a => !a.photo).every(a => /^[A-ZÉÈ]$/.test(a.text ?? "")), "les deux autres ont leur initiale")
  await shot(page, "salle-photos-clair")
  await page.emulateMedia({ colorScheme: "dark" })
  await sleep(500)
  await shot(page, "salle-photos-sombre")
  await page.emulateMedia({ colorScheme: "light" })

  say("== Mon compte")
  await page.goto(`${APP}/profile/`, { waitUntil: "networkidle" })
  await page.waitForSelector("[data-testid=photo-picker] img", { timeout: 15000 })
  check(true, "« Mon compte » montre la photo")
  await shot(page, "compte-photo-clair")

  for (const b of bots) b.socket?.disconnect()
} catch (err) {
  problems.push(`arret : ${err?.message ?? err}`)
  await shot(page, "arret").catch(() => {})
} finally {
  await browser.close()
}

say(problems.length ? `\nECHEC (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nOK : photo de profil")
process.exit(problems.length ? 1 : 0)
