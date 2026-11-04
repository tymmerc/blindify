// Quand montrer le message de Tym aux joueurs (T24) : une seule fois par
// appareil, sur l'ecran de fin de la 2e partie. Les autres fins de partie
// gardent le « Ça s'est bien passé ? » habituel.
//
// Le compte vit dans localStorage. Si le stockage est indisponible (navigation
// privee stricte, iframe sans stockage, quota), on compte en memoire : le bloc
// sort alors a la 2e partie de la session, et une seule fois par session.

export const GAMES_KEY = "blindz.parties-finies"
export const PROMPT_SHOWN_KEY = "blindz.avis-demande"
/** Le bloc sort a la fin de cette partie-la. */
export const PROMPT_AT_GAME = 2

type Store = Pick<Storage, "getItem" | "setItem">

const memory = { games: 0, shown: false }

function browserStore(): Store | null {
  try {
    const store = window.localStorage
    // Safari en navigation privee (anciennes versions) expose localStorage mais
    // refuse l'ecriture : on essaie pour de vrai.
    const probe = "blindz.essai"
    store.setItem(probe, "1")
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

/**
 * A appeler une fois par ecran de fin de partie. Compte la partie et dit si
 * c'est le moment d'afficher le message de Tym (et le note comme affiche).
 */
export function recordGameEnd(store: Store | null = browserStore()): boolean {
  if (store) {
    try {
      const games = (Number.parseInt(store.getItem(GAMES_KEY) ?? "0", 10) || 0) + 1
      store.setItem(GAMES_KEY, String(Math.min(games, 9999)))
      if (store.getItem(PROMPT_SHOWN_KEY) || games < PROMPT_AT_GAME) return false
      store.setItem(PROMPT_SHOWN_KEY, new Date().toISOString().slice(0, 10))
      return true
    } catch {
      // Stockage qui lache en cours de route : on passe au compte en memoire.
    }
  }
  memory.games += 1
  if (memory.shown || memory.games < PROMPT_AT_GAME) return false
  memory.shown = true
  return true
}

// Un meme ecran de fin peut etre monte plusieurs fois pour UNE partie. Vu en
// solo sur la pile (04/11) : a la derniere manche, l'ecran de fin apparait
// 120 ms avant la fenetre du resultat, disparait, puis revient apres
// « Terminer ». Sans garde, la 1re partie comptait double et le message de
// Tym sortait des la 1re partie.
//
// On retient donc la derniere fin comptee et sa decision :
// - partie identifiee de facon unique (solo avec son identifiant) : meme
//   partie, meme decision, quel que soit le delai ;
// - sinon (code de salle reutilise d'une partie a l'autre, chrono, buzzer) :
//   meme cle a moins de SAME_GAME_WINDOW_MS du dernier affichage = meme partie.
//   La plus courte partie (chrono, 60 s, plus le lancement) dure davantage.
export const SAME_GAME_WINDOW_MS = 45_000

let lastEnd: { key: string; unique: boolean; at: number; show: boolean } | null = null

export interface GameEndIdentity {
  mode: string
  sessionId?: number | null
  gameCode?: string | null
}

/**
 * Comme recordGameEnd, mais un ecran remonte pour la meme partie ne compte
 * pas une 2e fois et garde la decision deja prise (le message reste affiche).
 */
export function claimGameEnd(game: GameEndIdentity, now = Date.now(), store?: Store | null): boolean {
  const unique = game.mode === "solo" && Boolean(game.sessionId)
  const key = `${game.mode}:${game.sessionId ?? ""}:${game.gameCode ?? ""}`
  if (lastEnd && lastEnd.key === key && (unique || now - lastEnd.at < SAME_GAME_WINDOW_MS)) {
    lastEnd = { ...lastEnd, at: now }
    return lastEnd.show
  }
  const show = store === undefined ? recordGameEnd() : recordGameEnd(store)
  lastEnd = { key, unique, at: now, show }
  return show
}

/** Pour les tests : remet le compte en memoire a zero. */
export function resetPromptMemory(): void {
  memory.games = 0
  memory.shown = false
  lastEnd = null
}
