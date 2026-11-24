/**
 * T38 : le rythme entre deux manches, facon Kahoot, decide par le serveur.
 *
 * Apres chaque manche, trois temps pour toute la salle en meme temps :
 * 1. la reponse (pochette, de qui vient le morceau, qui a repondu quoi) ;
 * 2. le classement ;
 * 3. le 3-2-1 avant la manche suivante (aussi avant la toute premiere).
 * Le navigateur ne decide plus quand on avance : sinon les joueurs se
 * decalaient. L'hote peut passer plus vite (bouton « Suivant », game:next).
 *
 * C'est le SEUL endroit ou regler ces durees.
 */
export const ROUND_PACING = {
  /** La reponse et ce que chacun a tape (les lignes arrivent une par une : 5 s etait trop court pour lire). */
  answerMs: 8_000,
  /** Le classement. */
  scoresMs: 5_000,
  /** Le 3-2-1 : la manche suivante part a la fin (musique et chrono). */
  countdownMs: 3_000,
  /**
   * Autour d'une table, avant la 1re manche : l'explication (la musique sort
   * de l'ecran, on repond sur son telephone), puis le 3-2-1. Le 24/11, trois
   * nouveaux venus n'avaient rien tape en quatre manches.
   */
  tableIntroMs: 7_000,
} as const;

/**
 * Attente avant la 1re manche (musique et chrono partent a la fin) : le 3-2-1,
 * precede de l'explication en mode event. Le chrono de la manche reste entier.
 */
export function firstRoundPrerollMs(mode: string): number {
  return ROUND_PACING.countdownMs + (mode === "event" ? ROUND_PACING.tableIntroMs : 0);
}

/** Les deux ecrans de la phase REVEAL. Le 3-2-1 est le debut de la manche suivante. */
export type RevealStep = "answer" | "scores";

export type RoundPacing = {
  step: RevealStep;
  /** Heure serveur (ms) de la fin de cet ecran. */
  endsAt: number;
  /** Duree de l'ecran (ms) : les clients en tirent la barre qui se vide. */
  ms: number;
};

/** Premier ecran apres la revelation d'une manche. */
export function answerStep(now: number): RoundPacing {
  return { step: "answer", endsAt: now + ROUND_PACING.answerMs, ms: ROUND_PACING.answerMs };
}

/**
 * Ce qui suit l'ecran en cours : le classement apres la reponse, puis la
 * manche suivante. Apres la derniere manche, pas de classement (il gacherait
 * le podium) : la reponse mene directement a la fin de partie.
 */
export function stepAfter(current: RoundPacing | null | undefined, now: number, lastRound: boolean): RoundPacing | "next" {
  if (current?.step === "answer" && !lastRound) return { step: "scores", endsAt: now + ROUND_PACING.scoresMs, ms: ROUND_PACING.scoresMs };
  return "next";
}
