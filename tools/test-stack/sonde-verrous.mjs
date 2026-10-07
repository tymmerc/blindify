// Sonde des verrous pendant une mise en prod essayee sur la pile (jamais la
// prod) : mesure ce qu'un joueur subirait pendant la migration.
//
//   SONDE_PAS_MS=20 node sonde-verrous.mjs FICHIER_RESUME
//
// Toutes les SONDE_PAS_MS millisecondes (200 par defaut), en parallele,
// chacune sur sa connexion (lock_timeout 5 s) :
//   - un morceau importe (INSERT audio_sources avec un premier importeur : le
//     declencheur de la 005 s'en saisit des qu'il existe) ;
//   - une mise a jour de joueur (users) ;
//   - une ecriture de manche (game_rounds, dont la 005 change la structure) ;
//   - une lecture (count sur audio_sources).
// S'arrete sur SIGTERM et ecrit le resume : pire temps par operation, nombre
// d'operations au-dela de 100 ms et de 1 s, erreurs, et la liste des lentes.
import { createRequire } from "node:module"
import fs from "node:fs"

const { Client } = createRequire("/opt/blindify/backend/package.json")("pg")
const URL = "postgres://blindify:test@127.0.0.1:5436/blindify_test"
const OUT = process.argv[2]
if (!OUT) { console.error("usage : node sonde-verrous.mjs FICHIER_RESUME"); process.exit(2) }
if (!URL.includes(":5436/blindify_test")) throw new Error("la sonde ne vise que la base de la pile")

const PAS_MS = Number(process.env.SONDE_PAS_MS) || 200
const sleep = ms => new Promise(r => setTimeout(r, ms))
const connect = async () => { const c = new Client({ connectionString: URL }); await c.connect(); await c.query("SET lock_timeout = '5s'"); return c }
const [cIns, cUsr, cRnd, cLec] = await Promise.all([1, 2, 3, 4].map(connect))
const q1 = async (c, sql) => (await c.query(sql)).rows[0]
const joueur = (await q1(cLec, "SELECT min(user_id) AS id FROM audio_sources WHERE user_id IS NOT NULL")).id
const manche = (await q1(cLec, "SELECT min(id) AS id FROM game_rounds")).id

const ops = {
  morceau: n => cIns.query("INSERT INTO audio_sources (provider, external_id, title, artist, user_id) VALUES ('deezer', $1, 'Sonde', 'Sonde', $2)", [`sonde-verrou-${process.pid}-${n}`, joueur]),
  joueur: () => cUsr.query("UPDATE users SET username = username WHERE id = $1", [joueur]),
  manche: () => cRnd.query("UPDATE game_rounds SET completed_at = completed_at WHERE id = $1", [manche]),
  lecture: () => cLec.query("SELECT count(*) FROM audio_sources"),
}
const stats = Object.fromEntries(Object.keys(ops).map(k => [k, { n: 0, max: 0, plus100: 0, plus1000: 0, erreurs: [] }]))
const lentes = []
let stop = false
process.on("SIGTERM", () => { stop = true })
process.on("SIGINT", () => { stop = true })

const mesure = async (nom, n) => {
  const t = performance.now()
  const s = stats[nom]
  try {
    await ops[nom](n)
  } catch (e) {
    s.erreurs.push(`${new Date().toISOString()} ${e.code ?? ""} ${e.message}`)
  }
  const ms = Math.round(performance.now() - t)
  s.n++
  s.max = Math.max(s.max, ms)
  if (ms > 100) { s.plus100++; lentes.push(`${new Date().toISOString()} ${nom} ${ms} ms`) }
  if (ms > 1000) s.plus1000++
}

const debut = new Date().toISOString()
for (let n = 1; !stop; n++) {
  await Promise.all(Object.keys(ops).map(nom => mesure(nom, n)))
  await sleep(PAS_MS)
}
const resume = [
  `sonde des verrous, ${debut} -> ${new Date().toISOString()}, une passe toutes les ${PAS_MS} ms`,
  ...Object.entries(stats).map(([k, s]) => `${k.padEnd(8)} ${s.n} operations, pire ${s.max} ms, ${s.plus100} au-dela de 100 ms, ${s.plus1000} au-dela de 1 s, ${s.erreurs.length} erreur(s)`),
  ...Object.values(stats).flatMap(s => s.erreurs.map(e => `  erreur ${e}`)),
  "operations lentes (plus de 100 ms) :",
  ...(lentes.length ? lentes.map(l => `  ${l}`) : ["  aucune"]),
].join("\n")
fs.writeFileSync(OUT, `${resume}\n`)
console.log(resume)
await Promise.all([cIns, cUsr, cRnd, cLec].map(c => c.end()))
