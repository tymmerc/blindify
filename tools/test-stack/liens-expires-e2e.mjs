// T35 : des manches muettes en fin de partie (soiree a 8 du 12/11).
//
// Les extraits Deezer sont des liens signes (`hdnea=exp=...`) qui vivent ~15 min.
// Les 20 manches sont preparees au lancement : sans rafraichissement, les
// dernieres manches d'une partie de plus de 15 min partent sur un lien mort.
//
// Sur la pile de test (faux Deezer, aucun appel au vrai) :
//   - 20 titres chez l'hote, avec en base des liens signes comme ceux de Deezer :
//     le 1er expire 3 min apres le lancement (lien deja vieux, session 823), les
//     autres 15 min apres ;
//   - une partie de 20 manches de 45 s, qui depasse donc les 15 min ;
//   - pour chaque manche, le lien que les joueurs ont en main a son debut doit
//     etre valable toute la manche ;
//   - une demande de lien neuf (game:preview:refresh) recoit l'etat a jour.
//
//   campagne-ref.sh <branche> --script /abs/tools/test-stack/liens-expires-e2e.mjs
import { Bot, api } from "/opt/blindify/tools/test-stack/bot.mjs"
import { psql, PUBLIC_ORIGIN } from "/opt/blindify/tools/test-stack/testdb.mjs"
import { catalog } from "/opt/blindify/tools/test-stack/catalog.mjs"

const ROUNDS = 20
const ROUND_SECONDS = 45
const LINK_LIFE_MS = 15 * 60_000
const sleep = ms => new Promise(r => setTimeout(r, ms))
const q = v => `'${String(v).replace(/'/g, "''")}'`
const CAT = catalog()
const RUN = Date.now().toString(36)

const problems = []
const say = m => console.log(m)
const ok = m => say(`  [ok] ${m}`)
const bad = m => { problems.push(m); say(`  !! ${m}`) }

const signed = (file, expMs) => `${PUBLIC_ORIGIN}/test-audio/${file}?hdnea=exp=${Math.floor(expMs / 1000)}~acl=/test-audio/${file}*~hmac=test`
const expOf = url => { const m = String(url ?? "").match(/exp=(\d{8,})/); return m ? Number(m[1]) * 1000 : null }

/** 20 titres du catalogue chez `userId`, avec un lien signe en base comme apres une resolution Deezer. */
function seedSignedLibrary(userId) {
  const linkId = psql(`INSERT INTO imported_links (user_id, url, normalized_url, provider, kind, label)
    VALUES (${Number(userId)}, 'test://t35/${Number(userId)}', 't35:${RUN}:${Number(userId)}', 'deezer', 'playlist', 'T35 ${Number(userId)}') RETURNING id`).split("\n")[0]
  const now = Date.now()
  const values = CAT.slice(0, ROUNDS).map((t, i) => {
    // Le 1er titre : un lien deja vieux, qui meurt 3 min apres le lancement.
    const exp = i === 0 ? now + 3 * 60_000 : now + LINK_LIFE_MS
    return `('deezer', ${q(`t35-${RUN}-${t.k}`)}, ${Number(userId)}, ${q(t.title)}, ${q(t.artist)}, ${q(signed(t.file, exp))}, 30000, '{"test":true,"k":${t.k}}'::jsonb, ${linkId})`
  })
  psql(`INSERT INTO audio_sources (provider, external_id, user_id, title, artist, audio_url, duration_ms, metadata, link_id)
    VALUES ${values.join(",")}`)
}

try {
  say(`== 20 manches de ${ROUND_SECONDS} s (plus de 15 min), liens Deezer signes ==`)
  const [hote, ami] = await Promise.all(["Hote", "Ami"].map(name => new Bot({ name, plan: () => ({ action: "muet" }), random: Math.random }).enter()))
  seedSignedLibrary(hote.id)
  const created = await api("/api/rooms/create", { method: "POST", token: hote.token, body: { mode: "friends", questionCount: ROUNDS, nickname: "Hote" } })
  const room = created.data?.room?.room_code
  await api(`/api/rooms/${room}/config`, { method: "POST", token: hote.token, body: { questionCount: ROUNDS, roundSeconds: ROUND_SECONDS } })
  await hote.connect(); hote.socket.emit("room:join", { roomCode: room })
  await ami.join(room)
  await sleep(800)

  // Le lien que l'ami a en main pour chaque manche : le dernier etat recu en GUESSING.
  const links = new Map() // manche -> { url, startAt, revealAt }
  ami.socket.on("game:state", s => {
    if (s?.phase !== "GUESSING" || !s.currentRound) return
    links.set(s.currentRound, { url: s.currentTrack?.previewUrl ?? null, startAt: s.timing?.startAt, revealAt: s.timing?.revealAt })
  })

  const launchedAt = Date.now()
  const start = await api(`/api/rooms/${room}/start`, { method: "POST", token: hote.token, body: { source: "library" } })
  start.status === 200 ? ok(`salle ${room} : la partie part, ${start.data?.session?.totalRounds} manches`) : bad(`lancement : HTTP ${start.status} ${start.error?.code ?? ""}`)

  // Manche 3 : l'ami redemande un lien (comme le navigateur sur une erreur audio).
  let refreshAnswered = false
  const askAt = 3
  while (!ami.over && Date.now() - launchedAt < 30 * 60_000) {
    if (!refreshAnswered && links.has(askAt)) {
      const answered = new Promise(resolve => {
        const t = setTimeout(() => resolve(false), 8_000)
        ami.socket.once("game:state", s => { clearTimeout(t); resolve(s?.currentRound === askAt) })
      })
      ami.socket.emit("game:preview:refresh", { roomCode: room, round: askAt })
      refreshAnswered = await answered
      refreshAnswered ? ok("game:preview:refresh : l'etat a jour revient") : bad("game:preview:refresh : pas de reponse")
      refreshAnswered = true
    }
    await sleep(1_000)
  }
  const lasted = Date.now() - launchedAt
  ami.over ? ok(`partie finie en ${Math.round(lasted / 60_000)} min`) : bad("la partie ne s'est pas finie en 30 min")
  lasted > LINK_LIFE_MS ? ok("la partie a depasse les 15 min de vie d'un lien") : bad(`partie trop courte (${Math.round(lasted / 1000)} s) pour juger`)

  const muted = []
  for (let round = 1; round <= ROUNDS; round++) {
    const seen = links.get(round)
    if (!seen?.url) { muted.push(`${round} (aucun lien)`); continue }
    const exp = expOf(seen.url)
    // Un lien du faux Deezer n'est pas signe : il ne meurt pas.
    if (exp !== null && exp < (seen.revealAt ?? seen.startAt + ROUND_SECONDS * 1000)) muted.push(`${round} (lien mort a ${new Date(exp).toISOString()})`)
  }
  muted.length === 0 ? ok("aucune manche au lien expire") : bad(`manches au lien expire : ${muted.join(", ")}`)
  const refreshed = [...links.values()].filter(l => expOf(l.url) === null).length
  say(`  ${refreshed} liens rafraichis par le serveur en cours de partie`)
  refreshed > 0 ? ok("le serveur a bien rafraichi des liens") : bad("aucun lien rafraichi")
  const stored = psql(`SELECT count(*) FROM audio_sources WHERE external_id LIKE ${q(`t35-${RUN}-%`)} AND audio_url NOT LIKE '%exp=%'`)
  say(`  ${stored} liens neufs ecrits en base`)
  for (const b of [hote, ami]) b.close()
} catch (e) {
  bad(`arret : ${e.message}`)
}

say(`\n=== ${problems.length ? `${problems.length} PROBLEME(S)` : "AUCUN PROBLEME"} ===`)
problems.forEach(m => say(`  - ${m}`))
process.exit(problems.length ? 1 : 0)
