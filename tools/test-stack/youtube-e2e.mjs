// Import d'une playlist YouTube sur la pile de test (T33), contre la fausse
// API YouTube et le faux Deezer de proxy.mjs.
//   1. Lea colle le lien partage d'une playlist YouTube sur /jouer (telephone) :
//      l'ecran dit « 12 morceaux sur 14 retrouvés », ses 12 morceaux Deezer
//      sont en base, rien de YouTube (ni titre de video, ni nom de playlist).
//   2. Elle cree une salle « À distance », Tom entre, la partie part (200).
//   3. Liens refuses avant l'envoi : une video seule, un mix.
//   4. Playlist privee : le message de YouTube s'affiche, rien n'est importe.
//   5. Le meme lien par la partie solo rapide (sans compte) donne des manches.
//
//   campagne-ref.sh <branche> --script /chemin/youtube-e2e.mjs /dossier/des/preuves
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, api } from "./bot.mjs"
import { psql } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/youtube-e2e"
fs.mkdirSync(OUT, { recursive: true })
const STUB = "http://127.0.0.1:3180/deezer-stub"
const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); shots.push(f) }

// Une playlist differente a chaque passage : PLpile<N> = 12 morceaux du faux
// Deezer a partir de N, plus 2 inconnus et une video supprimee.
const n = 3000 + Math.floor(Math.random() * 3000)
const LIST = `PLpile${n}`
const ids = (await (await fetch(`${STUB}/playlist/${n}/tracks`)).json()).data.map(t => String(t.id))
const sqlList = list => list.map(i => `'${i}'`).join(",")

async function onPhone(browser, name, tag) {
  const phone = await newPage(browser, { ...devices["iPhone 13"] }, tag, problems)
  const p = phone.page
  await p.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(name)
  await p.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
  return phone
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
try {
  say(`playlist YouTube factice ${LIST}`)

  /* ---------- 1. Import par l'ecran ---------- */
  say("\n== 1. Lea importe une playlist YouTube sur /jouer ==")
  const lea = await onPhone(browser, "Lea", "yt1")
  const p = lea.page
  const field = p.locator('input[placeholder^="https://"]')
  await field.fill(`https://youtu.be/dQw4w9WgXcQ?list=${LIST}&si=partage`)
  const importResp = p.waitForResponse(r => r.url().includes("/api/import/sync-all"), { timeout: 60000 }).catch(() => null)
  await p.getByRole("button", { name: /importer ma musique/i }).click()
  const syncBody = await (await importResp)?.json().catch(() => null)
  const shown = await p.getByText(/morceaux? sur \d+ retrouvés?/).first().textContent({ timeout: 30000 }).catch(() => null)
  await shot(p, "yt1-1-import")
  say(`  l'ecran dit « ${shown ?? "rien"} », compte rendu ${JSON.stringify(syncBody?.data?.youtube ?? null)}`)
  if (/12 morceaux sur 14 retrouvés/.test(shown ?? "")) ok("« 12 morceaux sur 14 retrouvés » (2 inconnus de Deezer, la video supprimee ignoree)")
  else bad(`texte inattendu : ${shown}`)
  const linked = Number(psql(`SELECT count(*) FROM user_audio_sources ua JOIN audio_sources a ON a.id = ua.audio_source_id
    WHERE ua.user_id = ${Number(p.__uid)} AND a.provider = 'deezer' AND a.external_id IN (${sqlList(ids)})`))
  linked === 12 ? ok("12 morceaux Deezer relies a Lea") : bad(`${linked} morceaux relies au lieu de 12`)
  const source = psql(`SELECT DISTINCT a.metadata->>'import_source' FROM user_audio_sources ua JOIN audio_sources a ON a.id = ua.audio_source_id WHERE ua.user_id = ${Number(p.__uid)}`)
  source === "youtube" ? ok("metadata.import_source = youtube") : bad(`import_source : ${source}`)
  const card = psql(`SELECT url || '|' || normalized_url || '|' || coalesce(label, '') || '|' || coalesce(image_url, '') FROM imported_links WHERE user_id = ${Number(p.__uid)} AND provider = 'youtube'`)
  card === `https://www.youtube.com/playlist?list=${LIST}|youtube.com/playlist?list=${LIST}|Playlist YouTube|`
    ? ok("carte « Playlist YouTube », adresse de la liste seule, sans nom ni image de YouTube")
    : bad(`carte : ${card}`)
  const leaked = Number(psql(`SELECT count(*) FROM audio_sources WHERE title ILIKE '%Clip officiel%' OR title ILIKE '%Official Video%' OR title ILIKE '%Morceau absent%'`))
  leaked === 0 ? ok("aucun titre de video YouTube en base") : bad(`${leaked} titre(s) de video en base`)

  /* ---------- 2. Une partie avec cette musique ---------- */
  say("\n== 2. Une partie avec la musique venue de YouTube ==")
  await sleep(3000) // /jouer avance tout seul apres l'import
  await p.getByText("Créer une partie").click()
  await p.waitForURL(/\/modes/, { timeout: 40000 })
  await p.getByText("À distance").first().click()
  await p.getByText(/CODE|copie le code|invite/i).first().waitFor({ timeout: 40000 }).catch(() => {})
  await sleep(2500)
  const code = (p.url().match(/code=([A-Z0-9]{6})/) || [])[1]
  if (!code) throw new Error("pas de code de salle cote Lea")
  const tom = await new Bot({ name: "Tom", plan: () => ({ action: "muet" }), random: Math.random }).enter()
  const joined = await tom.join(code)
  if (!joined.ok) bad(`Tom ne peut pas entrer (${joined.status})`)
  await sleep(3500)
  const lobby = await api(`/api/rooms/${code}`, { token: tom.token })
  const leaCount = lobby.data?.participants?.find(x => x.user_id === p.__uid)?.track_count
  leaCount === 12 ? ok(`lobby ${code} : Lea a 12 titres`) : bad(`lobby ${code} : Lea a ${leaCount} titre(s)`)
  const startResp = p.waitForResponse(r => r.url().includes(`/api/rooms/${code}/start`), { timeout: 30000 }).catch(() => null)
  await p.getByRole("button", { name: /lancer/i }).first().click()
  const started = await startResp
  started?.status() === 200 ? ok("lancement : HTTP 200") : bad(`lancement : HTTP ${started?.status() ?? "aucune reponse"}`)
  await sleep(5000)
  await shot(p, "yt1-2-partie")
  tom.socket?.close()
  // Ferme la salle, sinon attendre-parties.sh la croirait en cours (voir #99).
  psql(`UPDATE multiplayer_rooms SET status = 'finished' WHERE room_code = '${code}'`)
  await lea.ctx.close()

  /* ---------- 3. Liens refuses avant l'envoi ---------- */
  say("\n== 3. Video seule et mix : refuses avant l'envoi ==")
  const mia = await onPhone(browser, "Mia", "yt2")
  const q = mia.page
  const calls = []
  q.on("request", r => { if (r.url().includes("/api/import/")) calls.push(r.url()) })
  const f2 = q.locator('input[placeholder^="https://"]')
  await f2.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  const videoMsg = await q.getByText(/lien d'une vidéo/i).first().textContent({ timeout: 5000 }).catch(() => null)
  await shot(q, "yt2-1-video")
  videoMsg ? ok(`video seule : « ${videoMsg.trim()} »`) : bad("video seule : pas de message")
  const disabled = await q.getByRole("button", { name: /importer ma musique|continuer/i }).first().isDisabled().catch(() => false)
  disabled ? ok("bouton desactive") : bad("bouton actif sur une video seule")
  await f2.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ")
  const mixMsg = await q.getByText(/mix youtube/i).first().textContent({ timeout: 5000 }).catch(() => null)
  mixMsg ? ok("mix : message clair") : bad("mix : pas de message")
  calls.length === 0 ? ok("aucun appel d'import envoye") : bad(`${calls.length} appel(s) d'import pour des liens refuses`)

  /* ---------- 4. Playlist privee ---------- */
  say("\n== 4. Playlist privee ==")
  await f2.fill("https://www.youtube.com/playlist?list=PLpilePrive")
  await q.getByRole("button", { name: /importer ma musique/i }).click()
  const priv = await q.getByText(/playlist youtube/i).filter({ hasText: /vérifie le lien|privée/i }).first().textContent({ timeout: 20000 }).catch(() => null)
  await shot(q, "yt2-2-privee")
  priv ? ok(`message : « ${priv.trim()} »`) : bad("playlist privee : pas de message")
  const miaTracks = Number(psql(`SELECT count(*) FROM user_audio_sources WHERE user_id = ${Number(q.__uid)}`))
  miaTracks === 0 ? ok("rien d'importe pour Mia") : bad(`${miaTracks} morceaux importes pour Mia`)
  await mia.ctx.close()

  /* ---------- 5. Partie solo rapide, sans compte ---------- */
  say("\n== 5. Partie solo rapide sur le lien YouTube ==")
  const quick = await api("/api/quick-play", { method: "POST", body: { url: `https://music.youtube.com/playlist?list=${LIST}`, count: 5 } })
  const rounds = quick.data?.tracks?.length ?? 0
  quick.status === 200 && rounds >= 5 ? ok(`solo rapide : ${rounds} manches, extraits du faux Deezer`) : bad(`solo rapide : HTTP ${quick.status} ${quick.error?.code ?? ""}, ${rounds} manches`)
  const notYoutube = (quick.data?.tracks ?? []).every(t => String(t.audio_url).includes("/test-audio/"))
  notYoutube ? ok("tous les extraits viennent du faux Deezer") : bad("un extrait ne vient pas du faux Deezer")
} catch (e) {
  bad(`arret : ${e.message}`)
} finally {
  await browser.close()
}

say(`\n=== ${problems.length ? `${problems.length} PROBLEME(S)` : "AUCUN PROBLEME"} ===`)
problems.forEach(m => say(`  - ${m}`))
say(`captures : ${shots.map(f => path.basename(f)).join(", ")}`)
fs.writeFileSync(path.join(OUT, "resume.txt"), `${new Date().toISOString()}\n${lines.join("\n")}\n`)
process.exit(problems.length ? 1 : 0)
