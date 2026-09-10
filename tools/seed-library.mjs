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
// On ne fait toujours AUCUN import Deezer par l'interface : c'est le chemin qui
// declenchait les blocages Akamai, et la regle "premier importeur garde le
// titre" rendait un re-import vide.

import { execSync } from "child_process"

const psql = sql => execSync(
  `docker exec blindify-postgres psql -U blindify -d blindify -qAt -c "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`
).toString().trim()

// Guillemets simples doubles. Surtout PAS la notation $$ de Postgres : la
// commande passe par un shell, qui remplacerait $$ par son numero de processus.
const sq = v => "'" + String(v ?? "").replace(/'/g, "''").replace(/\$/g, "") + "'"

const MOTS = [
  "rock", "pop francaise", "rap francais", "jazz", "electro", "chanson francaise",
  "soul", "reggae", "metal", "disco", "funk", "classique",
]

let reserve = null
const seedes = new Set()   // utilisateurs ensemences pendant cette execution

/** Titres Deezer jouables et encore absents de la base, mis en cache par execution. */
async function remplirLaReserve(minimum) {
  if (reserve && reserve.length >= minimum) return reserve
  const vus = new Set()
  const candidats = []
  for (const q of MOTS) {
    if (candidats.length >= minimum * 3) break
    const r = await fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=50`)
      .then(r => r.json())
      .catch(() => null)
    for (const t of r?.data ?? []) {
      if (!t.id || !t.preview || vus.has(String(t.id))) continue
      vus.add(String(t.id))
      candidats.push(t)
    }
  }
  const deja = new Set(psql(`SELECT external_id FROM audio_sources WHERE provider='deezer'`).split("\n"))
  reserve = candidats.filter(t => !deja.has(String(t.id)))
  if (reserve.length < minimum) {
    throw new Error(`pas assez de titres neufs chez Deezer : ${reserve.length} pour ${minimum} demandes`)
  }
  return reserve
}

/**
 * Donne `n` morceaux jouables a l'utilisateur `userId`.
 * Chaque appel pioche des titres differents, pour que les joueurs d'une meme
 * partie aient des bibliotheques distinctes (le jeu demande "qui a mis quoi").
 */
export async function seedLibrary(userId, n = 12) {
  const pool = await remplirLaReserve(n)
  const lot = pool.splice(0, n)
  if (!lot.length) throw new Error("reserve de titres epuisee")
  const vals = lot.map(t =>
    `('deezer','${t.id}',${userId},${sq(t.title)},${sq(t.artist?.name ?? "?")},` +
    `${sq(t.album?.cover_medium ?? "")},${sq(t.preview)},${(t.duration ?? 30) * 1000},'{\"e2e\":true}'::jsonb)`
  ).join(",")
  psql(
    `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata) ` +
    `VALUES ${vals} ON CONFLICT (provider, external_id) DO NOTHING`
  )
  seedes.add(userId)
  return lot.length
}

/** Menage de fin : retire les morceaux donnes aux utilisateurs de test.
 *  Sans argument, il nettoie tous ceux ensemences pendant cette execution.
 *  Indispensable : les identifiants etant desormais de vrais identifiants
 *  Deezer, l'ancien filtre `external_id LIKE 'e2e-%'` ne matche plus rien. */
export function cleanupSeeded(userIds = [...seedes]) {
  const ids = userIds.filter(Boolean).join(",")
  if (ids) psql(`DELETE FROM audio_sources WHERE user_id IN (${ids})`)
  // Ceinture et bretelles : les titres portent un marqueur dans metadata, donc
  // un run interrompu (Ctrl-C, timeout, plantage) se rattrape au run suivant.
  // Sans ce marqueur ils seraient indiscernables des titres de vrais joueurs,
  // puisqu'ils ont desormais de VRAIS identifiants Deezer.
  psql(`DELETE FROM audio_sources a WHERE a.metadata->>'e2e' = 'true'
        AND NOT EXISTS (SELECT 1 FROM game_rounds gr WHERE gr.audio_source_id = a.id)`)
  seedes.clear()
}
