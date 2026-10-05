// Reglages du solo et du defi : chemins de partie, onglet du lobby, pseudo,
// codes de defi. Logique pure, testee dans soloSetup.test.ts.

export type SoloTab = "classic" | "chrono" | "challenge"

/** Ordre des onglets du lobby, pour les fleches du clavier. */
export const SOLO_TABS: readonly SoloTab[] = ["classic", "chrono", "challenge"]

/** Memes cles que l'ecran d'entree (/jouer) : le joueur n'a rien a resaisir. */
export const NICKNAME_KEY = "blindify_nickname"
export const PROFILE_URL_KEY = "blindify_profile_url"

const NAME_MAX = 24
/** Nom mis sur un defi quand le joueur n'en donne aucun. */
export const DEFAULT_PLAYER_NAME = "Joueur"
const CODE_PATTERN = /^[A-Z0-9]{4,12}$/

export interface SoloGameOptions {
  url: string
  count: number
  progressive?: boolean
  /** Partie lancee depuis l'onglet defi : la fin de partie met le defi en avant. */
  challenge?: boolean
}

/** Adresse de la partie solo, ou null si aucun lien n'est saisi. */
export function buildSoloGamePath({ url, count, progressive = false, challenge = false }: SoloGameOptions): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const progressiveParam = progressive ? "&progressive=true" : ""
  const challengeParam = challenge ? "&challenge=1" : ""
  return `/solo?source=quickplay&quickUrl=${encodeURIComponent(trimmed)}&count=${count}${progressiveParam}${challengeParam}`
}

/** Onglet a ouvrir d'apres ?tab= (lien "Defier a mon tour" par exemple). */
export function parseSoloTab(value: string | null): SoloTab {
  return value === "chrono" || value === "challenge" ? value : "classic"
}

/** Onglet vise par une touche (fleches, Debut, Fin), en boucle ; null pour les autres touches. */
export function tabForKey(current: SoloTab, key: string): SoloTab | null {
  const index = SOLO_TABS.indexOf(current)
  const last = SOLO_TABS.length - 1
  switch (key) {
    case "ArrowRight": return SOLO_TABS[index === last ? 0 : index + 1]
    case "ArrowLeft": return SOLO_TABS[index === 0 ? last : index - 1]
    case "Home": return SOLO_TABS[0]
    case "End": return SOLO_TABS[last]
    default: return null
  }
}

/**
 * Parametres de l'adresse avec l'onglet ouvert, pour que retour arriere et
 * rechargement retombent sur le meme. Le classique (par defaut) n'y figure pas.
 */
export function searchWithTab(search: string, tab: SoloTab): string {
  const params = new URLSearchParams(search)
  if (tab === "classic") params.delete("tab")
  else params.set("tab", tab)
  const query = params.toString()
  return query ? `?${query}` : ""
}

/** Pseudo affiche sur un defi : espaces reduits, 24 caracteres au plus (comme /jouer). */
export function cleanPlayerName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, NAME_MAX)
}

export function normalizeChallengeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * Code d'un defi a partir de ce que le joueur colle : le code seul, ou le
 * lien entier recu dans une conversation (".../challenge/?code=K7Q2M9XA").
 * Avant, le lien colle donnait "HTTPSBLINDZA", un faux code.
 */
export function extractChallengeCode(raw: string): string {
  const fromLink = raw.match(/[?&]code=([^&#\s]*)/i)
  return normalizeChallengeCode(fromLink ? fromLink[1] : raw)
}

/** Meme borne que le serveur (4 a 12 caracteres). */
export function isChallengeCode(code: string): boolean {
  return CODE_PATTERN.test(code)
}

/** Texte joint au lien quand on envoie le defi depuis le menu de partage du telephone. */
export function buildChallengeShareText({ name, points, tracks }: { name: string; points: number; tracks: number }): string {
  const morceaux = tracks > 1 ? "morceaux" : "morceau"
  const pts = points > 1 ? "pts" : "pt"
  return `${name} te défie sur Blindz : ${tracks} ${morceaux}, ${points} ${pts} à battre.`
}

/** Lecture du stockage local sans jamais planter (navigation privee, quota...). */
export function readStored(key: string): string {
  try {
    return (localStorage.getItem(key) ?? "").trim()
  } catch {
    return ""
  }
}

export function writeStored(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
  } catch {
    // Stockage indisponible : on garde la valeur pour cette page seulement.
  }
}

/**
 * Retient le nom donne sur un defi comme pseudo, seulement s'il n'y en avait
 * aucun : un nom tape pour un seul defi ("Equipe du jeudi") ne doit pas
 * remplacer le pseudo choisi sur /jouer.
 */
export function rememberNicknameIfNone(name: string): void {
  if (!name || name === DEFAULT_PLAYER_NAME || readStored(NICKNAME_KEY)) return
  writeStored(NICKNAME_KEY, name)
}
