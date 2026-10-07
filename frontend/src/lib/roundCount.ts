// Partie plus courte que demandee : les playlists des joueurs n'avaient pas
// assez de titres avec un extrait Deezer (vu le 07/10/2026 : 16 manches sur 20,
// sans un mot). On le dit au debut de la partie. Rien sur les titres eux-memes :
// aucune information de morceau avant la revelation (anti-triche).

type RoundCountState = {
  totalRounds?: number | null
  requestedRounds?: number | null
  currentRound?: number | null
  phase?: string | null
}

const ENDED_PHASES = new Set(["FINISHED", "GAME_OVER"])

/** Le message a afficher pendant la 1re manche, ou null si la partie a sa longueur. */
export function shortGameNotice(state: RoundCountState | null | undefined): string | null {
  if (!state) return null
  const total = Number(state.totalRounds ?? 0)
  const requested = Number(state.requestedRounds ?? 0)
  if (!Number.isFinite(total) || !Number.isFinite(requested)) return null
  if (total <= 0 || requested <= total) return null
  if ((state.currentRound ?? 0) > 1 || ENDED_PHASES.has(state.phase ?? "")) return null
  const manches = total === 1 ? "1 manche" : `${total} manches`
  return `${manches} au lieu de ${requested} : pas assez de titres jouables dans vos playlists`
}
