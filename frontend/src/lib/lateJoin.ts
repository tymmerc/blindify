/**
 * Arrivee en cours de partie (T19) : un joueur qui entre pendant une manche
 * regarde la partie, puis joue a partir de la manche suivante, a 0 point.
 *
 * Le serveur le garde hors de `players` tant qu'il attend : c'est cette
 * absence qui decide de l'ecran, pas un drapeau a part. Le passage en jeu se
 * fait donc tout seul, au premier etat de la manche suivante (sans
 * rechargement, ce qui compte dans Discord).
 */
import type { MultiplayerGameState } from "./types"

/** Le joueur regarde-t-il la partie en attendant la manche suivante ? */
export function isLateJoiner(state: MultiplayerGameState | null | undefined, userId: number | null | undefined): boolean {
  if (!state || userId == null) return false
  if (state.phase !== "GUESSING" && state.phase !== "REVEAL") return false
  if (state.players?.[userId]) return false
  // Autour d'une table, l'hote qui presente seulement n'est jamais dans les joueurs.
  const presenterOnly = state.mode === "event" && state.hostUserId === userId && !state.hostPlays
  return !presenterOnly
}

/** Derniere manche en cours (ou revelee) : plus de manche suivante dans cette partie. */
export function isLastRound(state: Pick<MultiplayerGameState, "currentRound" | "totalRounds">): boolean {
  return state.totalRounds > 0 && state.currentRound >= state.totalRounds
}

/** Le bandeau de la vue d'attente. */
export function lateJoinBanner(state: Pick<MultiplayerGameState, "currentRound" | "totalRounds">): { title: string; body: string } {
  if (isLastRound(state)) {
    return {
      title: "Dernière manche en cours : tu joues la prochaine partie",
      body: "Tu suis la fin en direct. Ta musique sera dans la prochaine partie.",
    }
  }
  return {
    title: "Partie en cours : tu joues dès la prochaine manche",
    body: "Tu pars de 0 point. Ta musique n'est pas dans cette partie, elle comptera pour la suivante.",
  }
}

/** Le mot que voient les autres quand quelqu'un arrive. */
export function arrivalNotice(username: string | null | undefined, state: Pick<MultiplayerGameState, "currentRound" | "totalRounds"> | null): string {
  const name = username?.trim() || "Quelqu'un"
  return state && isLastRound(state)
    ? `${name} arrive et jouera la prochaine partie.`
    : `${name} arrive et joue dès la prochaine manche.`
}
