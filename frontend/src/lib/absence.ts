/**
 * Parties fantomes et joueurs absents (T22). Le serveur decide (3 manches sans
 * reponse : absent ; plus de joueur ou plus de reponse : veille, puis arret) ;
 * ici, seulement ce que l'ecran en dit. Textes a valider par Tym.
 */
import type { MultiplayerGameState } from "./types"

/** Le joueur a ete laisse de cote au lancement : absent a la partie d'avant. */
export function isAbsentee(state: Pick<MultiplayerGameState, "absentees"> | null | undefined, userId: number | null | undefined): boolean {
  if (!state || userId == null) return false
  return (state.absentees ?? []).some(a => a.userId === userId)
}

/** Le bandeau de l'absent de la partie d'avant, qui regarde celle-ci. */
export const ABSENTEE_BANNER = {
  title: "Tu étais absent à la dernière partie",
  body: "On a relancé sans toi. Touche « Je reviens » et tu joues dès la manche suivante.",
  action: "Je reviens",
}

/** Le bandeau du joueur note absent pendant la partie. */
export const ABSENT_NOTICE = {
  text: "Pas de réponse depuis 3 manches : tu es noté absent. Réponds à la manche ou touche « Je suis là ».",
  action: "Je suis là",
}

/** Le mot a cote du nom, dans la liste des joueurs et au classement de fin. */
export const ABSENT_LABEL = "Absent"

/**
 * Les minutes qui restent avant l'arret d'une partie en veille, arrondies au
 * dessus. La seconde de marge absorbe le petit retard de l'horloge serveur
 * estimee : sans elle, une veille toute neuve de 2 min s'affichait « 3 min ».
 */
function minutesLeft(stopAt: number, now: number): number {
  return Math.max(0, Math.ceil((stopAt - now - 1_000) / 60_000))
}

/**
 * Le texte de l'ecran de pause quand c'est le serveur qui a mis la partie en
 * veille. null : pause de l'hote, texte habituel.
 */
export function idlePauseText(idle: MultiplayerGameState["idle"], now: number): string | null {
  if (!idle) return null
  const left = minutesLeft(idle.stopAt, now)
  const why = idle.reason === "empty" ? "Plus aucun joueur n'est connecté." : "Personne n'a répondu depuis 3 manches."
  const when = left > 0 ? `La partie s'arrête dans ${left} min si personne ne revient.` : "La partie va s'arrêter."
  return `${why} ${when}`
}

/**
 * D'ou on regarde la pause : l'ecran de la table (hote qui presente), l'appareil
 * de l'hote qui joue aussi autour de la table, un telephone a la table, ou son
 * propre appareil (entre amis, Discord).
 */
export type PauseViewer = "screen" | "hostPlays" | "phone" | "own"

/** Le bouton des joueurs sur l'ecran de veille. */
export const IDLE_PRESENT_ACTION = "Je suis là"

const SILENT_HELP: Record<PauseViewer, string> = {
  screen: "Vous entendez la musique ? Chacun tape le titre ou l'artiste sur son téléphone, puis valide.",
  hostPlays: "Vous entendez la musique ? Chacun tape le titre ou l'artiste sur son téléphone, toi ici, puis valide.",
  phone: "Tu entends la musique du grand écran ? Le titre ou l'artiste, tu le tapes ici, sur ton téléphone.",
  own: "Tu entends la musique ? Monte le son, puis tape le titre ou l'artiste et valide.",
}

/**
 * Veille parce que personne n'a repondu : on dit quoi faire, pas seulement
 * pourquoi. Le 24/11, des nouveaux venus n'avaient pas compris ou repondre.
 * `action` : le bouton que cet ecran montre pour repartir (aucun : on n'en
 * parle pas). null pour les autres pauses.
 */
export function silentPauseText(
  idle: MultiplayerGameState["idle"],
  now: number,
  viewer: PauseViewer,
  action: string | null,
): { title: string; help: string; when: string } | null {
  if (idle?.reason !== "silent") return null
  const left = minutesLeft(idle.stopAt, now)
  return {
    title: "Personne n'a répondu.",
    help: action ? `${SILENT_HELP[viewer]} Touche « ${action} » pour repartir.` : SILENT_HELP[viewer],
    when: left > 0 ? `La partie s'arrête dans ${left} min si personne ne reprend.` : "La partie va s'arrêter.",
  }
}

/** Le gros bouton de l'hote sur cette pause. */
export const SILENT_RESUME_ACTION = "Reprendre la partie"

/** Ce qu'on dit en revenant dans la salle d'attente apres un arret automatique. */
export const IDLE_STOP_NOTICE = "Plus personne ne jouait, la partie s'est arrêtée. Vous êtes de retour dans la salle."
