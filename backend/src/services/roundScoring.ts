/**
 * Bareme des modes multijoueur (T43), calque sur Kahoot. Demande de Tym le
 * 16/11 : « des points comme Kahoot : series, rapidite, points en centaines ».
 *
 * - Titre et artiste justes : de 1000 points (reponse immediate) a 500 (au
 *   dernier moment), round(1000 x (1 - (t / T) / 2)). t est mesure par le
 *   serveur, du debut de la manche a la reception de la reponse ; T est la
 *   duree de la manche.
 * - Un seul des deux (« Presque ») : la moitie. C'etait deja la regle avec
 *   1 point par element juste.
 * - « Qui a ajoute le morceau » juste : +200 fixe, sans lien avec la vitesse.
 * - Serie : une manche avec au moins le titre ou l'artiste la prolonge, toute
 *   autre la remet a zero (« Je sais pas » et pas de reponse compris). +100 a
 *   la 2e manche d'affilee, +200 a la 3e, jusqu'a +500.
 * - Jamais de points negatifs. L'hote qui presente ne marque rien.
 *
 * Le solo, le chrono, le buzzer, les defis et le mode streamer gardent leur
 * propre bareme : rien ici n'est importe par eux.
 */
export const SCORING = {
  maxPoints: 1000,
  minPoints: 500,
  ownerBonus: 200,
  streakStep: 100,
  streakCap: 500,
} as const;

/** Detail des points d'une manche, montre au joueur a la revelation. */
export type RoundPoints = {
  /** Titre et/ou artiste, selon la rapidite (0 si rien de juste). */
  answer: number;
  /** Bonus de serie. */
  streak: number;
  /** Bonus « qui a ajoute ». */
  owner: number;
  /** Temps de reponse mesure par le serveur (ms) ; null sans reponse. */
  ms: number | null;
};

/**
 * Points d'une reponse juste selon sa rapidite : 1000 a t = 0, 500 a t = T.
 * Un temps hors de [0, T] est ramene dans l'intervalle (reponse envoyee
 * pendant le 3-2-1, horloge decalee) ; sans duree connue, le minimum.
 */
export function speedPoints(reactionMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return SCORING.minPoints;
  const t = Math.min(Math.max(reactionMs, 0), durationMs);
  return Math.round(SCORING.maxPoints * (1 - t / durationMs / 2));
}

/** Bonus de la serie qui vient d'atteindre `streak` manches : +100 par manche apres la 1re, +500 au plus. */
export function streakBonus(streak: number): number {
  if (streak < 2) return 0;
  return Math.min((streak - 1) * SCORING.streakStep, SCORING.streakCap);
}

export function roundPoints(params: {
  titleOk: boolean;
  artistOk: boolean;
  ownerOk: boolean;
  /** Temps de reponse mesure par le serveur (ms) ; null sans reponse. */
  reactionMs: number | null;
  durationMs: number;
  /** Serie avant cette manche. */
  previousStreak: number;
  /** L'hote qui presente seulement : jamais de points, serie intacte. */
  presenter?: boolean;
}): { points: RoundPoints; gained: number; streak: number } {
  const { titleOk, artistOk, ownerOk, reactionMs, durationMs, previousStreak, presenter } = params;
  if (presenter) {
    return { points: { answer: 0, streak: 0, owner: 0, ms: null }, gained: 0, streak: previousStreak };
  }
  const found = titleOk || artistOk;
  // Sans heure de depart connue, une reponse juste vaut le minimum.
  const full = found ? speedPoints(reactionMs ?? durationMs, durationMs) : 0;
  const answer = titleOk && artistOk ? full : found ? Math.round(full / 2) : 0;
  const streak = found ? previousStreak + 1 : 0;
  const points: RoundPoints = {
    answer,
    streak: streakBonus(streak),
    owner: ownerOk ? SCORING.ownerBonus : 0,
    ms: reactionMs,
  };
  return { points, gained: points.answer + points.streak + points.owner, streak };
}
