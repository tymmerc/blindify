// Choisir comment jouer en partant de la situation (T7, soiree du 01/11) :
// un invite venu pour une fete sur une tele a ouvert une salle streamer, puis
// une « A distance », sans jamais lancer de partie. Le nom du mode reste, mais
// en petit : on lit d'abord ce qu'on veut faire.

export type SituationMode = "event" | "friends" | "streamer"

export type PlaySituation = {
  key: SituationMode | "solo"
  title: string
  subtitle: string
  /** Le nom du mode, affiche en etiquette (les scripts E2E cliquent dessus). */
  modeName: string
  accent: string
}

// Ordre : la fete d'abord, c'est le cas le plus courant (pages guides, soiree du 01/11).
export const PLAY_SITUATIONS: readonly PlaySituation[] = [
  {
    key: "event",
    title: "À une soirée, sur une télé ou une enceinte",
    subtitle: "Vous êtes dans la même pièce. Un écran passe la musique, chacun répond sur son téléphone.",
    modeName: "Autour d'une table",
    accent: "#e0a32e",
  },
  {
    key: "friends",
    title: "Chacun chez soi",
    subtitle: "Vous n'êtes pas au même endroit. Tu envoies un lien, chacun joue sur son écran avec le son chez lui.",
    modeName: "À distance",
    accent: "#c65133",
  },
  {
    key: "streamer",
    title: "En live sur Twitch",
    subtitle: "Ton public devine depuis son téléphone pendant ton live.",
    modeName: "Avec ta communauté",
    accent: "#7d9471",
  },
  {
    key: "solo",
    title: "Tout seul",
    subtitle: "Sur ta playlist, ou en défi contre un pote.",
    modeName: "Solo",
    accent: "#a8b8c8",
  },
]

const KNOWN: readonly SituationMode[] = ["event", "friends", "streamer"]

/** Le mode demande par une page guide (`/jouer/?mode=event`), ou null s'il est inconnu. */
export function parsePreferredMode(value: string | null | undefined): SituationMode | null {
  const v = (value ?? "").trim().toLowerCase()
  return (KNOWN as readonly string[]).includes(v) ? (v as SituationMode) : null
}

/** Ou mene « Creer une partie » : tout droit vers le mode deja choisi, sinon le choix. */
export function createRoute(preferred: SituationMode | null, nickname: string): string {
  if (!preferred) return "/modes"
  const nick = nickname.trim() ? `&nickname=${encodeURIComponent(nickname.trim())}` : ""
  return `/multiplayer?mode=${preferred}&intent=host${nick}`
}

export function situationFor(mode: SituationMode): PlaySituation {
  return PLAY_SITUATIONS.find(s => s.key === mode) as PlaySituation
}
