// Partie plus courte que demandee (vu le 07/10/2026 : 16 manches sur 20, sans
// un mot). On le dit pendant la 1re manche, avec la vraie raison : les
// playlists n'avaient pas assez de titres avec un extrait, ou Deezer n'a pas
// repondu a temps. Rien sur les titres eux-memes : aucune information de
// morceau avant la revelation (anti-triche).

type RoundCountState = {
  totalRounds?: number | null
  requestedRounds?: number | null
  shortReason?: string | null
  currentRound?: number | null
  phase?: string | null
}

export type ShortGameNotice = {
  text: string
  /** Faux apres la 1re manche : le message s'efface mais garde sa place, la grille ne saute pas. */
  visible: boolean
}

const ENDED_PHASES = new Set(["FINISHED", "GAME_OVER"])

export function shortGameNotice(state: RoundCountState | null | undefined): ShortGameNotice | null {
  if (!state) return null
  const total = Number(state.totalRounds ?? 0)
  const requested = Number(state.requestedRounds ?? 0)
  if (!Number.isFinite(total) || !Number.isFinite(requested)) return null
  if (total <= 0 || requested <= total) return null
  if (ENDED_PHASES.has(state.phase ?? "")) return null
  const manches = total === 1 ? "1 manche" : `${total} manches`
  const why = state.shortReason === "lookup"
    ? "Deezer n'a pas répondu à temps pour certains titres"
    : "pas assez de titres jouables dans vos playlists"
  return { text: `${manches} au lieu de ${requested} : ${why}`, visible: (state.currentRound ?? 0) <= 1 }
}
