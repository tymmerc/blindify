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
  /** La reponse et ce que chacun a tape. */
  answerMs: 5_000,
  /** Le classement. */
  scoresMs: 5_000,
  /** Le 3-2-1 : la manche suivante part a la fin (musique et chrono). */
  countdownMs: 3_000,
} as const;

/** Les deux ecrans de la phase REVEAL. Le 3-2-1 est le debut de la manche suivante. */
export type RevealStep = "answer" | "scores";

export type RoundPacing = {
  step: RevealStep;
  /** Heure serveur (ms) de la fin de cet ecran. */
  endsAt: number;
};

/** Premier ecran apres la revelation d'une manche. */
export function answerStep(now: number): RoundPacing {
  return { step: "answer", endsAt: now + ROUND_PACING.answerMs };
}

/**
 * Ce qui suit l'ecran en cours : le classement apres la reponse, puis la
 * manche suivante (ou la fin de partie apres la derniere).
 */
export function stepAfter(current: RoundPacing | null | undefined, now: number): RoundPacing | "next" {
  if (current?.step === "answer") return { step: "scores", endsAt: now + ROUND_PACING.scoresMs };
  return "next";
}
