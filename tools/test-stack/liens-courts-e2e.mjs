// Liens courts du bouton Partager des applis (T14), sur la pile de test.
//
// La pile n'a pas Internet : le faux hebergeur de liens courts du serveur local
// (proxy.mjs, /short-link-stub) joue link.deezer.com et spotify.link, et ne
// repond que par des redirections. On verifie, de bout en bout :
//   1. API : un lien court Deezer s'importe (une seule requete au faux
//      hebergeur) et la carte garde l'adresse longue ; deux sauts passent ;
//      la partie rapide marche aussi.
//   2. API : redirection vers une adresse interne, boucle, lien perime : refus
//      net, et rien n'est appele au-dela de ce qu'il faut.
//   3. Ecran : sur /jouer/, coller le lien court d'un telephone importe la musique.
//
//   campagne-ref.sh <branche> --script /chemin/liens-courts-e2e.mjs /dossier/des/preuves
import { chromium, devices } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { api } from "./bot.mjs"
import { psql } from "./testdb.mjs"
import { APP, newPage, sleep } from "./probe.mjs"

const OUT = process.argv[2] || "/tmp/liens-courts-e2e"
fs.mkdirSync(OUT, { recursive: true })
const STUB_LOG = "/opt/blindify/.test-stack/logs/deezer-stub.log"
const problems = []
const say = m => console.log(m)
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }

/** Les appels au faux hebergeur faits pendant `fn` (lignes du journal). */
async function shortLinkCalls(fn) {
  const read = () => (fs.existsSync(STUB_LOG) ? fs.readFileSync(STUB_LOG, "utf8").split("\n").filter(l => l.includes(" short-link ")) : [])
  const before = read().length
  const result = await fn()
  await sleep(200) // le journal est ecrit sans attendre
  return { result, calls: read().slice(before).map(l => l.split(" short-link ")[1]) }
}

async function guest(name) {
  const g = await api("/api/auth/guest", { method: "POST", body: { nickname: name } })
  if (!g.data?.sessionToken) throw new Error(`invite ${name} : ${g.status} ${JSON.stringify(g.error)}`)
  return { token: g.data.sessionToken, id: g.data.user?.id }
}

const n = 4000 + Math.floor(Math.random() * 3000)

/* ---------- 1. Ce qui doit passer ---------- */
say(`\n== 1. Liens courts acceptes (playlist factice ${n}) ==`)
const ana = await guest("AnaCourt")
{
  const { result: r, calls } = await shortLinkCalls(() =>
    api("/api/import/playlists", { method: "POST", token: ana.token, body: { url: `https://link.deezer.com/s/pl${n}` } }))
  r.status === 200 && r.data?.provider === "deezer" && r.data?.playlists?.[0]?.id === String(n)
    ? ok(`import Deezer par link.deezer.com : playlist ${n} trouvee`)
    : bad(`import Deezer par lien court : ${r.status} ${JSON.stringify(r.error ?? r.data)}`)
  calls.length === 1 ? ok("une seule requete au faux hebergeur") : bad(`${calls.length} requetes au faux hebergeur : ${calls.join(" | ")}`)
  const stored = psql(`SELECT url FROM imported_links WHERE id = ${Number(r.data?.linkId) || 0}`)
  stored === `https://www.deezer.com/fr/playlist/${n}`
    ? ok("la carte garde l'adresse longue, sans les parametres de partage")
    : bad(`adresse gardee sur la carte : « ${stored} »`)
  if (r.data?.playlists?.length) {
    const s = await api("/api/import/sync-all", { method: "POST", token: ana.token, body: { provider: "deezer", playlistIds: [String(n)], maxTracksPerPlaylist: 10, linkId: r.data.linkId } })
    s.status === 200 && s.data?.synced > 0 ? ok(`${s.data.synced} titres importes`) : bad(`synchro : ${s.status} ${JSON.stringify(s.error ?? s.data)}`)
  }
}
{
  const { result: r, calls } = await shortLinkCalls(() =>
    api("/api/import/playlists", { method: "POST", token: ana.token, body: { url: `https://link.deezer.com/s/hop${n + 1}` } }))
  r.status === 200 && r.data?.playlists?.[0]?.id === String(n + 1) && calls.length === 2
    ? ok("redirection relative sur link.deezer.com puis deezer.com : deux sauts, import fait")
    : bad(`deux sauts : ${r.status} ${JSON.stringify(r.error ?? r.data)}, appels ${calls.join(" | ")}`)
}
{
  const { result: r, calls } = await shortLinkCalls(() =>
    api("/api/quick-play", { method: "POST", body: { url: `https://link.deezer.com/s/pl${n + 2}`, count: 5 } }))
  const tracks = r.data?.tracks ?? []
  r.status === 200 && tracks.length >= 5 && calls.length === 1
    ? ok(`partie rapide par lien court : ${tracks.length} morceaux`)
    : bad(`partie rapide : ${r.status} ${JSON.stringify(r.error ?? Object.keys(r.data ?? {}))}, appels ${calls.length}`)
}

{
  // /import, /play et /chrono envoient le texte colle tel quel.
  const { result: r, calls } = await shortLinkCalls(() =>
    api("/api/import/playlists", { method: "POST", token: ana.token, body: { url: `link.deezer.com/s/pl${n + 4}` } }))
  r.status === 200 && r.data?.playlists?.[0]?.id === String(n + 4) && calls.length === 1
    ? ok("lien court colle sans https:// : import fait")
    : bad(`lien court sans schema : ${r.status} ${JSON.stringify(r.error ?? r.data)}, appels ${calls.length}`)
  const q = await api("/api/quick-play", { method: "POST", body: { url: `http://link.deezer.com/s/pl${n + 5}`, count: 5 } })
  q.status === 200 && (q.data?.tracks ?? []).length >= 5
    ? ok("lien court en http (partie rapide) : passe en https, partie prete")
    : bad(`lien court en http : ${q.status} ${JSON.stringify(q.error)}`)
}

/* ---------- 2. Ce qui doit etre refuse ---------- */
say("\n== 2. Refus ==")
const refus = [
  { label: "redirection vers les metadonnees du nuage", url: "https://spotify.link/ailleurs", hops: 1 },
  { label: "boucle de redirections (5 sauts au plus)", url: "https://link.deezer.com/s/boucle", hops: 5 },
  { label: "lien perime (page 404 de Deezer)", url: "https://link.deezer.com/s/perime", hops: 1 },
  { label: "adresse locale collee directement", url: "https://127.0.0.1:3098/api/health", hops: 0 },
  { label: "lien court sur un port exotique", url: "https://link.deezer.com:8443/s/pl1", hops: 0 },
]
for (const c of refus) {
  const { result: r, calls } = await shortLinkCalls(() =>
    api("/api/import/playlists", { method: "POST", token: ana.token, body: { url: c.url } }))
  r.status >= 400 && r.status < 500 && calls.length === c.hops
    ? ok(`${c.label} : refuse (${r.error?.code}), ${calls.length} appel(s)`)
    : bad(`${c.label} : ${r.status} ${r.error?.code}, ${calls.length} appel(s) au lieu de ${c.hops}`)
}
{
  // Sans la cle E2E : la limite propre aux liens courts (10 par minute et par IP).
  const raw = () => fetch("http://127.0.0.1:3098/api/quick-play", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://blindz-test.localhost:3180" },
    body: JSON.stringify({ url: `https://link.deezer.com/s/pl${n + 2}`, count: 5 }),
  }).then(r => r.status)
  const statuses = []
  for (let i = 0; i < 11; i++) statuses.push(await raw())
  statuses.slice(0, 10).every(st => st === 200) && statuses[10] === 429
    ? ok("limite des liens courts : 10 par minute passent, le 11e recoit 429")
    : bad(`limite des liens courts : statuts ${statuses.join(",")}`)
}
const egress = fs.existsSync("/opt/blindify/.test-stack/logs/egress.log") ? fs.readFileSync("/opt/blindify/.test-stack/logs/egress.log", "utf8").trim() : ""
egress === "" ? ok("aucune sortie refusee par no-egress") : bad(`sorties refusees : ${egress.split("\n").length}`)

/* ---------- 3. A l'ecran ---------- */
say("\n== 3. /jouer/ sur un telephone, lien court colle ==")
const browser = await chromium.launch()
try {
  const phone = await newPage(browser, { ...devices["iPhone 13"] }, "tel", problems)
  const p = phone.page
  await p.goto(`${APP}/jouer/`, { waitUntil: "networkidle", timeout: 90000 })
  await p.locator("input").first().fill("Lea")
  await p.getByRole("button", { name: /continuer/i }).click()
  await p.locator('input[placeholder^="https://"]').fill(`https://link.deezer.com/s/pl${n + 3}`)
  await p.getByRole("button", { name: /importer ma musique/i }).click()
  const shown = await p.getByText(/\d+ titres? importés?/).first().textContent({ timeout: 90000 }).catch(() => null)
  await p.screenshot({ path: path.join(OUT, "jouer-lien-court.png") })
  shown ? ok(`l'ecran dit « ${shown.trim()} »`) : bad("aucun titre importe a l'ecran")
} finally {
  await browser.close()
}

say(problems.length ? `\nPROBLEME : ${problems.length}\n${problems.map(x => `  - ${x}`).join("\n")}` : "\nTout est vert.")
process.exit(problems.length ? 1 : 0)
