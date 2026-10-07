// Parcours qui touchent la bibliotheque, joues par le backend en place sur la
// pile (ancien ou nouveau), pour l'essai de go-prod-2026-10-08-importeur.sh.
// Sert surtout a prouver que l'ANCIEN backend marche sur une base migree (005).
//
//   node essai-parcours-base.mjs ETIQUETTE
//
// Deux invites importent des playlists (dont une en commun) par l'API, lancent
// une salle depuis leurs bibliotheques, l'un retire une carte, puis un solo par
// lien. Si la table de la 005 existe, ses liens doivent suivre : aucun morceau
// avec un premier importeur sans son lien, et la carte retiree ne laisse aucun
// lien derriere elle. Le nombre de titres du second importeur est affiche sans
// etre juge (0 avec l'ancien code, 12 avec le nouveau : c'est le correctif).
import { Bot, api } from "./bot.mjs"
import { psql } from "./testdb.mjs"

const ETIQUETTE = process.argv[2] || "parcours"
const problemes = []
const dire = m => console.log(m)
const ok = m => dire(`  [ok] ${m}`)
const ko = m => { problemes.push(m); dire(`  !! ${m}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const table005 = () => psql("SELECT to_regclass('public.user_audio_sources') IS NOT NULL") === "t"
const orphelins = () => Number(psql(`SELECT count(*) FROM audio_sources a WHERE a.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_audio_sources ua WHERE ua.user_id = a.user_id AND ua.audio_source_id = a.id)`))

async function importer(bot, playlist) {
  const liste = await api("/api/import/playlists", { method: "POST", token: bot.token, body: { url: `https://www.deezer.com/fr/playlist/${playlist}` } })
  const sync = await api("/api/import/sync-all", { method: "POST", token: bot.token, body: { provider: "deezer", playlistIds: [String(playlist)], maxTracksPerPlaylist: 50, linkId: liste.data?.linkId } })
  sync.status === 200 ? ok(`${bot.name} importe la playlist ${playlist} (HTTP 200)`) : ko(`${bot.name} : import ${playlist} en HTTP ${sync.status} ${sync.error?.code ?? ""}`)
  return liste.data?.linkId
}

dire(`== ${ETIQUETTE} : table de la 005 ${table005() ? "presente" : "absente"} ==`)
try {
  const commune = 3000 + Math.floor(Math.random() * 3000)
  const [dora, eli] = await Promise.all(["Dora", "Eli"].map(name => new Bot({ name, plan: () => ({ action: "muet" }), random: Math.random }).enter()))
  const carteDora = await importer(dora, commune)
  await importer(eli, commune + 24) // a lui seul : sa salle peut partir avec l'ancien code
  await importer(eli, commune)      // la playlist deja chez Dora
  const cartes = (await api("/api/links", { token: eli.token })).data?.links ?? []
  dire(`  Eli : cartes a ${cartes.map(c => c.track_count).join(" et ")} titres (l'ancien code laisse la playlist commune a Dora)`)
  if (table005()) {
    const n = orphelins()
    n === 0 ? ok("aucun morceau sans le lien de son premier importeur") : ko(`${n} morceau(x) sans le lien de son premier importeur`)
  }

  const cree = await api("/api/rooms/create", { method: "POST", token: dora.token, body: { mode: "friends", questionCount: 10, nickname: "Dora" } })
  const salle = cree.data?.room?.room_code
  if (!salle) throw new Error(`creation de salle : HTTP ${cree.status} ${cree.error?.code ?? ""}`)
  await api(`/api/rooms/${salle}/config`, { method: "POST", token: dora.token, body: { questionCount: 10, roundSeconds: 10 } })
  await dora.connect(); dora.socket.emit("room:join", { roomCode: salle })
  await eli.join(salle)
  await sleep(800)
  const depart = await api(`/api/rooms/${salle}/start`, { method: "POST", token: dora.token, body: { source: "library" } })
  depart.status === 200
    ? ok(`salle ${salle} lancee depuis les bibliotheques (HTTP 200, ${depart.data?.tracks?.length ?? "?"} manches)`)
    : ko(`salle ${salle} : lancement en HTTP ${depart.status} ${depart.error?.code ?? ""}`)
  for (const b of [dora, eli]) b.socket?.close()

  const retrait = await api(`/api/links/${carteDora}`, { method: "DELETE", token: dora.token })
  retrait.status === 200 ? ok("Dora retire sa carte (HTTP 200)") : ko(`retrait de la carte de Dora : HTTP ${retrait.status} ${retrait.error?.code ?? ""}`)
  if (table005()) {
    const restants = Number(psql(`SELECT count(*) FROM user_audio_sources WHERE user_id = ${Number(dora.id)}`))
    restants === 0 ? ok("plus aucun lien pour Dora apres le retrait") : ko(`${restants} lien(s) restent a Dora apres le retrait de sa carte`)
    const n = orphelins()
    n === 0 ? ok("toujours aucun orphelin") : ko(`${n} orphelin(s) apres le retrait`)
  }

  const solo = await api("/api/quick-play", { method: "POST", body: { url: `https://www.deezer.com/fr/playlist/${commune}`, count: 10 } })
  const titres = (solo.data?.tracks ?? []).filter(t => t.audio_url).length
  solo.status === 200 && titres >= 5 ? ok(`solo par lien : ${titres} titres jouables`) : ko(`solo par lien : HTTP ${solo.status} ${solo.error?.code ?? ""}, ${titres} titres`)
} catch (e) {
  ko(`arret : ${e.message}`)
}
dire(`== ${ETIQUETTE} : ${problemes.length ? `${problemes.length} PROBLEME(S)` : "AUCUN PROBLEME"} ==`)
process.exit(problemes.length ? 1 : 0)
