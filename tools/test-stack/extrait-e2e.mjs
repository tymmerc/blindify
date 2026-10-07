// Bout en bout du choix des extraits (fix/extrait-bonne-version), sur la pile
// de test (faux Deezer, aucun appel au vrai) :
//  1. solo par lien Deezer : l'extrait vient de /track/<id>, sans recherche ;
//  2. import d'une playlist Deezer : pre-resolution en tache de fond, pareil ;
//  3. morceau Spotify avec un ISRC que Deezer ne connait pas : /track/isrc:...
//     repond "no data", la recherche prend le relais et trouve le bon titre ;
//     le meme titre marque "(Live)" n'a PAS d'extrait (le faux Deezer n'a que
//     la version studio) : jamais une autre version.
//   campagne-ref.sh <branche> --script /abs/tools/test-stack/extrait-e2e.mjs
import fs from "node:fs"
import { api } from "/opt/blindify/tools/test-stack/bot.mjs"
import { psql } from "/opt/blindify/tools/test-stack/testdb.mjs"
import { catalog } from "/opt/blindify/tools/test-stack/catalog.mjs"

const STUB = "/opt/blindify/.test-stack/logs/deezer-stub.log"
const sleep = ms => new Promise(r => setTimeout(r, ms))
const stubLines = () => (fs.existsSync(STUB) ? fs.readFileSync(STUB, "utf8").split("\n").filter(Boolean) : [])
const q = v => `'${String(v).replace(/'/g, "''")}'`

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? "OK  " : "ECHEC"} ${name}${detail ? ` : ${detail}` : ""}`)
}

/** Appels au faux Deezer faits pendant `fn`. */
async function stubCallsDuring(fn, settleMs = 0) {
  const before = stubLines().length
  const out = await fn()
  if (settleMs) await sleep(settleMs)
  return { out, calls: stubLines().slice(before).map(l => l.split(" ")[1] ?? "") }
}

async function quickPlayDeezer() {
  const { out: r, calls } = await stubCallsDuring(() =>
    api("/api/quick-play", { method: "POST", body: { url: "https://www.deezer.com/playlist/7", count: 5 } }))
  const tracks = r.data?.tracks ?? []
  check("solo par lien Deezer : 5 manches au moins", r.status === 200 && tracks.length >= 5, `statut ${r.status}, ${tracks.length} titres`)
  check("solo par lien Deezer : extraits du faux Deezer", tracks.every(t => t.audio_url?.includes("/test-audio/")))
  const byId = calls.filter(c => /^\/track\/\d+$/.test(c)).length
  const searches = calls.filter(c => c.startsWith("/search?")).length
  check("solo par lien Deezer : extrait par identifiant, aucune recherche", byId >= 5 && searches === 0, `${byId} /track/<id>, ${searches} /search`)
}

async function guest(name) {
  const g = await api("/api/auth/guest", { method: "POST", body: { nickname: name } })
  if (!g.data?.sessionToken) throw new Error(`invite refuse (${g.status})`)
  return { token: g.data.sessionToken, id: Number(g.data.user.id) }
}

async function importDeezer() {
  const me = await guest("ImportExtrait")
  const { out: r, calls } = await stubCallsDuring(async () => {
    const res = await api("/api/import/sync", { method: "POST", token: me.token, body: { provider: "deezer", playlistId: "19" } })
    // La pre-resolution tourne apres la reponse : on attend qu'elle ait fini.
    for (let i = 0; i < 40; i++) {
      const missing = Number(psql(`SELECT count(*) FROM audio_sources WHERE user_id = ${me.id} AND audio_url IS NULL`))
      if (missing === 0) break
      await sleep(250)
    }
    return res
  })
  const [total, withUrl] = psql(`SELECT count(*), count(audio_url) FILTER (WHERE audio_url LIKE '%/test-audio/%') FROM audio_sources WHERE user_id = ${me.id} AND provider = 'deezer'`).split("|").map(Number)
  check("import Deezer : titres stockes", r.status === 200 && total === 12, `statut ${r.status}, ${total} titres`)
  check("import Deezer : chaque titre a son extrait", withUrl === total, `${withUrl}/${total}`)
  const searches = calls.filter(c => c.startsWith("/search?")).length
  const byId = calls.filter(c => /^\/track\/\d+$/.test(c)).length
  check("import Deezer : extrait par identifiant, aucune recherche", byId >= 12 && searches === 0, `${byId} /track/<id>, ${searches} /search`)
}

async function spotifyVersions() {
  const me = await guest("SpotifyExtrait")
  const t = catalog()[5]
  const rows = [
    { ext: "e2eSpotifyStudio01", title: t.title, isrc: "FRZZZ2600001" },
    { ext: "e2eSpotifyLive0001", title: `${t.title} (Live)`, isrc: "FRZZZ2600002" },
  ]
  psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, audio_url, duration_ms, metadata)
    VALUES ${rows.map(r => `('spotify', ${q(r.ext)}, ${me.id}, ${q(r.title)}, ${q(t.artist)}, NULL, 30000, ${q(JSON.stringify({ isrc: r.isrc }))}::jsonb)`).join(",")}`)
  const { out: r, calls } = await stubCallsDuring(() =>
    api("/api/games/solo", { method: "POST", token: me.token, body: { count: 5 } }))
  const state = Object.fromEntries(psql(`SELECT external_id, coalesce(audio_url, '') FROM audio_sources WHERE external_id IN (${rows.map(x => q(x.ext)).join(",")})`)
    .split("\n").filter(Boolean).map(l => l.split("|")))
  check("Spotify : ISRC demande a Deezer d'abord", calls.some(c => c === `/track/isrc:${rows[0].isrc}`), calls.filter(c => c.startsWith("/track/isrc:")).join(", "))
  check("Spotify : ISRC inconnu, la recherche trouve la bonne version", state[rows[0].ext]?.includes(`/test-audio/${t.file}`), state[rows[0].ext] || "aucun extrait")
  check("Spotify : la version (Live) absente de Deezer reste sans extrait", state[rows[1].ext] === "", state[rows[1].ext] || "aucun extrait")
  console.log(`(solo : statut ${r.status}${r.error ? `, ${r.error.code}` : ""})`)
}

async function main() {
  for (const step of [quickPlayDeezer, importDeezer, spotifyVersions]) {
    try { await step() } catch (e) { check(step.name, false, e.message) }
  }
  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} verifications OK`)
  process.exit(failed.length ? 1 : 0)
}

main()
