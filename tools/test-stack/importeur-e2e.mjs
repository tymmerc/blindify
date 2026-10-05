// Le meme morceau importe par plusieurs joueurs, sur la pile de test.
//
// Avant le correctif, un morceau restait au PREMIER importeur pour toute la
// plateforme. Ce script rejoue les deux cas vus en vrai :
//   1. Lea importe sa musique, revient en invite sur un autre telephone et la
//      reimporte (par l'ecran, contre le faux Deezer). Sa salle doit partir.
//   2. Deux amis collent la meme playlist publique (par l'API). Les deux
//      doivent avoir leurs 12 titres, la partie doit leur donner une part
//      egale, et « qui a mis quoi » doit compter les deux.
// Rouge sur main (0 titre pour le second, 400 need_more_music), vert avec la
// migration 005.
//
//   campagne-ref.sh <branche> --script /chemin/importeur-e2e.mjs /dossier/des/preuves
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { Bot, api } from "./bot.mjs"
import { psql } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/importeur-e2e"
fs.mkdirSync(OUT, { recursive: true })
const STUB = "http://127.0.0.1:3180/deezer-stub"
const problems = []
const lines = []
const say = m => { console.log(m); lines.push(m) }
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }
const shots = []
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); shots.push(f) }

// Deux profils factices differents a chaque passage (le faux Deezer en sert
// 48 morceaux ; un profil N donne la playlist N, soit 12 morceaux).
const profil = 3000 + Math.floor(Math.random() * 3000)
const playlist = profil + 24 // 24 morceaux plus loin dans le catalogue : aucun en commun
const idsOf = async n => (await (await fetch(`${STUB}/playlist/${n}/tracks`)).json()).data.map(t => String(t.id))
const sqlList = ids => ids.map(i => `'${i}'`).join(",")
const hasUserTracks = () => psql(`SELECT to_regclass('public.user_audio_sources') IS NOT NULL`) === "t"

/** Les morceaux relies a un joueur : table de la migration 005 si elle existe, sinon l'ancienne colonne. */
function linkedCount(userId, ids) {
  return Number(hasUserTracks()
    ? psql(`SELECT count(*) FROM user_audio_sources ua JOIN audio_sources a ON a.id = ua.audio_source_id
            WHERE ua.user_id = ${Number(userId)} AND a.provider = 'deezer' AND a.external_id IN (${sqlList(ids)})`)
    : psql(`SELECT count(*) FROM audio_sources WHERE user_id = ${Number(userId)} AND provider = 'deezer' AND external_id IN (${sqlList(ids)})`))
}

/** Le parcours d'import de l'ecran d'accueil, sur un telephone neuf (nouvel invite). */
async function importOnNewPhone(browser, name, tag) {
  const phone = await newPage(browser, { ...devices["iPhone 13"] }, tag, problems)
  const p = phone.page
  await p.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill(name)
  await p.getByRole("button", { name: /continuer/i }).click()
  for (let i = 0; i < 40 && !p.__uid; i++) await sleep(250)
  await p.locator('input[placeholder^="https://"]').fill(`https://www.deezer.com/profile/${profil}`)
  await p.getByRole("button", { name: /importer ma musique/i }).click()
  const shown = await p.getByText(/\d+ titres? importés?/).first().textContent({ timeout: 90000 }).catch(() => null)
  await sleep(800)
  await shot(p, `${tag}-1-import`)
  say(`  ${name} (${tag}, invite ${p.__uid}) : l'ecran dit « ${shown ?? "rien"} »`)
  return phone
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
try {
  say(`profil factice ${profil}, playlist publique ${playlist}`)
  say(`table user_audio_sources : ${hasUserTracks() ? "presente (migration 005)" : "absente"}`)
  const leaIds = await idsOf(profil)

  /* ---------- 1. Lea, deux telephones, le meme profil ---------- */
  say("\n== 1. Lea reimporte son profil sur un autre telephone ==")
  const first = await importOnNewPhone(browser, "Lea", "tel1")
  const second = await importOnNewPhone(browser, "Lea", "tel2")
  const p = second.page
  const rows = Number(psql(`SELECT count(*) FROM audio_sources WHERE provider = 'deezer' AND external_id IN (${sqlList(leaIds)})`))
  rows === 12 ? ok("12 lignes audio_sources pour ses 12 morceaux, aucun doublon") : bad(`${rows} lignes audio_sources pour 12 morceaux`)
  const n1 = linkedCount(first.page.__uid, leaIds), n2 = linkedCount(p.__uid, leaIds)
  n1 === 12 ? ok("premier telephone : 12 morceaux relies") : bad(`premier telephone : ${n1} morceaux relies sur 12`)
  n2 === 12 ? ok("second telephone : 12 morceaux relies") : bad(`second telephone : ${n2} morceaux relies sur 12`)

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
  await sleep(3500) // le lobby relit la salle toutes les quelques secondes
  await shot(p, "tel2-2-lobby")
  const lobby = await api(`/api/rooms/${code}`, { token: tom.token })
  const leaCount = lobby.data?.participants?.find(x => x.user_id === p.__uid)?.track_count
  leaCount === 12 ? ok(`lobby ${code} : Lea a 12 titres`) : bad(`lobby ${code} : Lea a ${leaCount} titre(s)`)

  const startResp = p.waitForResponse(r => r.url().includes(`/api/rooms/${code}/start`), { timeout: 30000 }).catch(() => null)
  await p.getByRole("button", { name: /lancer/i }).first().click()
  const started = await startResp
  const status = started?.status()
  const body = started ? await started.json().catch(() => null) : null
  status === 200
    ? ok(`lancement : HTTP 200, ${body?.data?.tracks?.length} manches`)
    : bad(`lancement : HTTP ${status ?? "aucune reponse"} ${body?.error?.code ?? ""} ${JSON.stringify(body?.error?.details ?? "")}`)
  await sleep(6000)
  await shot(p, "tel2-3-apres-lancer")
  await first.ctx.close(); await second.ctx.close()
  tom.socket?.close()

  /* ---------- 2. Deux amis, la meme playlist publique ---------- */
  say("\n== 2. Deux amis collent la meme playlist ==")
  const friendIds = await idsOf(playlist)
  const [dora, eli] = await Promise.all(["Dora", "Eli"].map(name => new Bot({ name, plan: () => ({ action: "muet" }), random: Math.random }).enter()))
  for (const b of [dora, eli]) {
    const listed = await api("/api/import/playlists", { method: "POST", token: b.token, body: { url: `https://www.deezer.com/fr/playlist/${playlist}` } })
    const synced = await api("/api/import/sync-all", { method: "POST", token: b.token, body: { provider: "deezer", playlistIds: [String(playlist)], linkId: listed.data?.linkId } })
    const card = (await api("/api/links", { token: b.token })).data?.links?.[0]
    say(`  ${b.name} (invite ${b.id}) : import ${synced.status}, ${synced.data?.synced} titres annonces, carte a ${card?.track_count} titre(s)`)
    Number(card?.track_count) === 12 ? ok(`carte de ${b.name} : 12 titres`) : bad(`carte de ${b.name} : ${card?.track_count} titre(s) au lieu de 12`)
  }
  const created = await api("/api/rooms/create", { method: "POST", token: eli.token, body: { mode: "friends", questionCount: 10, nickname: "Eli" } })
  const room = created.data?.room?.room_code
  await api(`/api/rooms/${room}/config`, { method: "POST", token: eli.token, body: { questionCount: 10, roundSeconds: 10 } })
  await eli.connect(); eli.socket.emit("room:join", { roomCode: room })
  await dora.join(room)
  await sleep(800)
  const start = await api(`/api/rooms/${room}/start`, { method: "POST", token: eli.token, body: { source: "library" } })
  if (start.status !== 200) bad(`lancement de ${room} : HTTP ${start.status} ${start.error?.code ?? ""}`)
  const tracks = start.data?.tracks ?? []
  const part = id => tracks.filter(t => t.metadata?.owner_user_id === id).length
  const [d, e] = [part(dora.id), part(eli.id)]
  say(`  partie ${room} : ${tracks.length} manches, ${d} de Dora, ${e} d'Eli`)
  Math.abs(d - e) <= 1 && d > 0 && e > 0 ? ok("tourniquet equitable entre les deux") : bad(`tourniquet desequilibre : ${d} / ${e}`)
  const both = tracks.filter(t => [dora.id, eli.id].every(id => t.metadata?.owner_user_ids?.includes(id))).length
  both === tracks.length && tracks.length > 0
    ? ok("qui a mis quoi : chaque manche compte Dora ET Eli")
    : bad(`qui a mis quoi : ${both}/${tracks.length} manches comptent les deux importeurs`)
  const rowsFriends = Number(psql(`SELECT count(*) FROM audio_sources WHERE provider = 'deezer' AND external_id IN (${sqlList(friendIds)})`))
  rowsFriends === 12 ? ok("12 lignes audio_sources pour la playlist, aucun doublon") : bad(`${rowsFriends} lignes pour 12 morceaux`)
  for (const b of [dora, eli]) b.socket?.close()
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
