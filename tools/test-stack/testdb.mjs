// Acces a la base de TEST (conteneur blindz-test-postgres) : ensemencement des
// bibliotheques et oracle des manches. Refuse de parler a autre chose.
//
// execFileSync avec des arguments separes : pas de shell, donc pas de piege
// "$$ remplace par le numero de processus" ni d'echappement de guillemets.
import { execFileSync } from "node:child_process"
import { catalog } from "./catalog.mjs"

export const CONTAINER = "blindz-test-postgres"
export const PUBLIC_ORIGIN = "http://blindz-test.localhost:3180"

export function psql(sql) {
  return execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "blindify", "-d", "blindify_test", "-qAt", "-F", "|", "-c", sql], {
    maxBuffer: 16 * 1024 * 1024,
  }).toString().trim()
}
const q = v => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`)
const rows = sql => psql(sql).split("\n").filter(Boolean).map(l => l.split("|"))

const CAT = catalog()

/**
 * Donne a `userId` une carte de bibliotheque active avec les morceaux `ks` du
 * catalogue. Dans une salle, chaque joueur recoit des `ks` differents : la
 * sonde audio reconnait le morceau a sa frequence, et "qui a mis quoi" a un
 * sens.
 */
export function seedUser(userId, ks) {
  const linkId = psql(`INSERT INTO imported_links (user_id, url, normalized_url, provider, kind, label)
    VALUES (${Number(userId)}, 'test://bibli/${Number(userId)}', 'test:${Number(userId)}', 'deezer', 'playlist', 'Bibli de test ${Number(userId)}') RETURNING id`).split("\n")[0]
  const values = ks.map(k => {
    const t = CAT[k % CAT.length]
    return `('deezer', ${q(`test-${t.k}-${userId}`)}, ${userId}, ${q(t.title)}, ${q(t.artist)}, ${q(`${PUBLIC_ORIGIN}/test-audio/${t.file}`)}, 30000, '{"test":true,"k":${t.k}}'::jsonb, ${linkId})`
  })
  psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, audio_url, duration_ms, metadata, link_id)
    VALUES ${values.join(",")}`)
  return ks.length
}

/** La verite d'une manche, telle que le serveur l'a tiree au lancement.
 *  Memorisee : 30 bots x 5 manches feraient sinon 150 docker exec synchrones,
 *  qui bloquent la boucle commune aux 5 salles. */
const ORACLE = new Map()
export function oracle(roomCode, round) {
  const key = `${roomCode}:${round}`
  if (ORACLE.has(key)) return ORACLE.get(key)
  const v = oracleFromDb(roomCode, round)
  if (v) ORACLE.set(key, v)
  return v
}
function oracleFromDb(roomCode, round) {
  const r = rows(`SELECT gr.correct_title, gr.correct_artist, coalesce(a.user_id::text,''), coalesce(a.metadata->>'k','')
    FROM multiplayer_rooms m JOIN game_rounds gr ON gr.session_id = m.session_id
    LEFT JOIN audio_sources a ON a.id = gr.audio_source_id
    WHERE m.room_code = ${q(roomCode)} AND gr.round_index = ${Number(round)}`)[0]
  if (!r) return null
  return { title: r[0], artist: r[1], ownerId: r[2] ? Number(r[2]) : null, k: r[3] === "" ? null : Number(r[3]) }
}

/** Tout ce que la base retient d'une partie, pour le verdict de fin. */
export function sessionFacts(roomCode) {
  const s = rows(`SELECT m.session_id, coalesce(g.state,''), coalesce(g.total_rounds,0), m.status
    FROM multiplayer_rooms m LEFT JOIN game_sessions g ON g.id = m.session_id WHERE m.room_code = ${q(roomCode)}`)[0]
  if (!s || !s[0]) return null
  const sid = Number(s[0])
  const reponses = rows(`SELECT gr.round_index, r.user_id, coalesce(r.verdict,''), coalesce(r.source_guess::text,''),
      coalesce(r.source_owner::text,''), coalesce(r.source_correct::text,''), r.score_delta, r.is_correct::text,
      (r.guess_title IS NOT NULL OR r.guess_artist IS NOT NULL)::text
    FROM round_responses r JOIN game_rounds gr ON gr.id = r.round_id WHERE gr.session_id = ${sid}
    ORDER BY gr.round_index, r.user_id`).map(r => ({
    round: Number(r[0]), userId: Number(r[1]), verdict: r[2] || null,
    sourceGuess: r[3] ? Number(r[3]) : null, sourceOwner: r[4] ? Number(r[4]) : null,
    // ::text sur un booleen donne "true"/"false" (et non t/f comme l'affichage psql)
    sourceCorrect: r[5] === "" ? null : r[5] === "true", delta: Number(r[6]), correct: r[7] === "true",
    answered: r[8] === "true",
  }))
  const participants = rows(`SELECT user_id, score FROM game_participants WHERE session_id = ${sid}`)
    .map(r => ({ userId: Number(r[0]), score: Number(r[1]) }))
  const manches = Number(psql(`SELECT count(*) FROM game_rounds WHERE session_id = ${sid}`))
  return { sessionId: sid, state: s[1], totalRounds: Number(s[2]), roomStatus: s[3], manches, reponses, participants }
}
