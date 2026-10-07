// Les liens de playlist que la sonde lance, et leur validation quand on les
// remplace en option (--deezer, --spotify, --only).

export const DEFAULT_TARGETS = Object.freeze([
  // Celle de la verification de go-prod-2026-10-02-deezer.sh : 100 titres tenus par Deezer.
  { id: "deezer", provider: "deezer", label: "Deezer, playlist Top France", url: "https://www.deezer.com/fr/playlist/1109890291" },
  // Playlist publique de Tym (14 titres connus), lue par l'API Spotify de l'app.
  { id: "spotify", provider: "spotify", label: "Spotify, playlist « C'est quoi ta musique préférée ? »", url: "https://open.spotify.com/playlist/6QfyfBMAoQy8YxbbPL0hkZ" },
])

const HOSTS = Object.freeze({ deezer: "deezer.com", spotify: "open.spotify.com" })

/** Lien de playlist passe en option : https et le bon site, sinon null. */
export function parseTargetUrl(provider, raw) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.hostname.replace(/^www\./, "") !== HOSTS[provider]) return null
  return url.toString()
}

/** Les liens a verifier d'apres les options. Leve une erreur lisible si une option est fausse. */
export function buildTargets(options = {}) {
  const targets = DEFAULT_TARGETS.map(t => {
    if (options[t.id] === undefined) return t
    const url = parseTargetUrl(t.provider, options[t.id])
    if (!url) throw new Error(`--${t.id} : lien ${HOSTS[t.provider]} en https attendu`)
    return { ...t, label: `${t.label.split(",")[0]}, ${url}`, url }
  })
  if (options.only === undefined) return targets
  const only = targets.filter(t => t.id === options.only)
  if (only.length === 0) throw new Error("--only : deezer ou spotify")
  return only
}
