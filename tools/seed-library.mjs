// Ensemencement des bibliotheques pour les tests, avec de VRAIS identifiants
// Deezer. Module partage par tous les outils E2E.
//
// Pourquoi pas la copie de lignes existantes, qui etait la methode d'avant :
// l'index unique `audio_sources_provider_external_id_key` porte sur
// (provider, external_id) pour TOUTE la table, pas par utilisateur. Copier une
// ligne oblige donc a brouiller l'external_id, et le serveur ne peut alors plus
// rafraichir l'extrait quand l'URL en cache expire (signature `exp=`, 403 au
// bout de quelques jours). Au lancement, collectPlayableSources jette tous ces
// titres et l'API repond `insufficient_tracks available:0`, salon bloque en
// 'waiting'. C'est ce qui a fait pourrir soiree.mjs, party-4-joueurs.mjs et
// anticheat-e2e.mjs en silence debut septembre 2026.
//
// Ici on prend des titres neufs sur l'API Deezer (qui repond tres bien depuis le
// VPS, ce n'etait pas Akamai) et on garde leur vrai identifiant, donc
// l'hydratation peut rafraichir l'extrait aussi longtemps qu'on veut.
//
// Deux sources de titres, dans cet ordre :
//   1. les titres que la base ne connait pas encore (inseres, puis supprimes au
//      menage) ;
//   2. les titres ORPHELINS, deja en base mais sans proprietaire (user_id NULL,
//      parce que le compte a ete supprime alors que des manches y font encore
//      reference). On les REATTRIBUE au joueur de test, puis on les rend au
//      menage. C'est la regle produit "le prochain importeur reclame le titre",
//      et sans elle deux scripts lances de front epuisent la reserve (constate
//      le 28/09/2026 : "0 titre neuf pour 12 demandes").
//
// On ne fait toujours AUCUN import Deezer par l'interface : c'est le chemin qui
// declenchait les blocages Akamai.

import { execFileSync } from "child_process"

// Arguments separes, SANS shell : les titres viennent de Deezer (donnees
// tierces) et finissent dans une commande lancee en root contre la base de
// prod. Avec l'ancien execSync, une apostrophe inverse dans un titre etait
// executee par le shell (constate par la relecture du 30/09/2026).
const psql = sql => execFileSync(
  "docker", ["exec", "blindify-postgres", "psql", "-U", "blindify", "-d", "blindify", "-qAt", "-c", sql],
  { maxBuffer: 16 * 1024 * 1024 },
).toString().trim()

// Litteral SQL : apostrophes doublees (standard_conforming_strings actif).
const sq = v => "'" + String(v ?? "").replace(/'/g, "''") + "'"

const MOTS = [
  "rock", "pop francaise", "rap francais", "jazz", "electro", "chanson francaise",
  "soul", "reggae", "metal", "disco", "funk", "classique",
  "indie", "hip hop", "blues", "variete", "dance", "punk",
]
// Deezer pagine par 50 ; on descend dans les resultats si les premieres pages
// sont deja toutes prises.
const PAGES = [0, 50, 100]

let reserve = null
const seedes = new Set()    // utilisateurs ensemences pendant cette execution
const reclames = new Set()  // identifiants (audio_sources.id) d'orphelins reattribues

async function pageDeezer(q, index) {
  const r = await fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=50&index=${index}`)
    .then(r => r.json())
    .catch(() => null)
  return r?.data ?? []
}

/** Titres Deezer jouables, neufs ou orphelins, mis en cache par execution. */
async function remplirLaReserve(minimum) {
  if (reserve && reserve.length >= minimum) return reserve
  // etat de la base : external_id -> 'libre' (orphelin) ou 'pris'
  const etat = new Map()
  for (const l of psql(`SELECT external_id||'|'||CASE WHEN user_id IS NULL THEN 'libre' ELSE 'pris' END
                        FROM audio_sources WHERE provider='deezer'`).split("\n")) {
    const [id, e] = l.split("|"); if (id) etat.set(id, e)
  }
  const vus = new Set()
  const neufs = [], orphelins = []
  boucle: for (const index of PAGES) {
    for (const q of MOTS) {
      if (neufs.length + orphelins.length >= minimum * 3) break boucle
      for (const t of await pageDeezer(q, index)) {
        const id = String(t.id ?? "")
        if (!id || !t.preview || vus.has(id)) continue
        vus.add(id)
        const e = etat.get(id)
        if (e === "pris") continue
        ;(e === "libre" ? orphelins : neufs).push(t)
      }
    }
  }
  reserve = [...neufs, ...orphelins]
  if (reserve.length < minimum) {
    throw new Error(`pas assez de titres disponibles chez Deezer : ${reserve.length} (${neufs.length} neufs, ${orphelins.length} orphelins) pour ${minimum} demandes`)
  }
  return reserve
}

/**
 * Donne `n` morceaux jouables a l'utilisateur `userId`.
 * Chaque appel pioche des titres differents, pour que les joueurs d'une meme
 * partie aient des bibliotheques distinctes (le jeu demande "qui a mis quoi").
 * Un titre orphelin est reattribue (et rendu au menage) ; un titre inconnu est
 * insere (et supprime au menage). Un titre pris entre-temps par quelqu'un
 * d'autre est laisse tranquille, d'ou le WHERE de l'ON CONFLICT.
 */
export async function seedLibrary(userId, n = 12) {
  const pool = await remplirLaReserve(n)
  const lot = pool.splice(0, n)
  if (!lot.length) throw new Error("reserve de titres epuisee")
  const vals = lot.map(t =>
    `('deezer','${t.id}',${userId},${sq(t.title)},${sq(t.artist?.name ?? "?")},` +
    `${sq(t.album?.cover_medium ?? "")},${sq(t.preview)},${(t.duration ?? 30) * 1000},'{\"e2e\":true}'::jsonb)`
  ).join(",")
  const sortie = psql(
    `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata) ` +
    `VALUES ${vals} ON CONFLICT (provider, external_id) DO UPDATE SET ` +
    `  user_id = EXCLUDED.user_id, audio_url = EXCLUDED.audio_url, ` +
    `  metadata = coalesce(audio_sources.metadata,'{}'::jsonb) || '{\"e2e_reclame\":true}'::jsonb ` +
    `WHERE audio_sources.user_id IS NULL ` +
    `RETURNING id||'|'||CASE WHEN xmax = 0 THEN 'neuf' ELSE 'reclame' END`
  )
  let donnes = 0
  for (const l of sortie.split("\n")) {
    const [id, sorte] = l.split("|"); if (!id) continue
    donnes++
    if (sorte === "reclame") reclames.add(id)
  }
  seedes.add(userId)
  return donnes
}

/** Menage de fin : retire les morceaux donnes aux utilisateurs de test et rend
 *  les orphelins reattribues. Sans argument, il nettoie tous ceux ensemences
 *  pendant cette execution. Indispensable : les identifiants etant desormais de
 *  vrais identifiants Deezer, l'ancien filtre `external_id LIKE 'e2e-%'` ne
 *  matche plus rien. */
export function cleanupSeeded(userIds = [...seedes]) {
  const ids = userIds.filter(Boolean).join(",")
  // D'abord rendre les orphelins reattribues (ils portent des manches reelles :
  // on ne les supprime jamais), y compris ceux d'un run interrompu avant. Le
  // marqueur suffit a les retrouver ; attention, audio_sources.id est un UUID.
  psql(`UPDATE audio_sources SET user_id = NULL, metadata = metadata - 'e2e_reclame'
        WHERE metadata->>'e2e_reclame' = 'true'`)
  if (ids) psql(`DELETE FROM audio_sources WHERE user_id IN (${ids})`)
  // Ceinture et bretelles : les titres inseres portent un marqueur dans metadata,
  // donc un run interrompu (Ctrl-C, timeout, plantage) se rattrape au run
  // suivant. Sans ce marqueur ils seraient indiscernables des titres de vrais
  // joueurs, puisqu'ils ont desormais de VRAIS identifiants Deezer.
  psql(`DELETE FROM audio_sources a WHERE a.metadata->>'e2e' = 'true'
        AND NOT EXISTS (SELECT 1 FROM game_rounds gr WHERE gr.audio_source_id = a.id)`)
  seedes.clear(); reclames.clear()
}
