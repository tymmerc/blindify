/**
 * Garde-fous des recherches d'extraits au lancement d'une salle.
 *
 * Le lancement cherche chez Deezer l'extrait des titres qui n'en ont pas (ou
 * plus). Sans borne, une grosse bibliotheque injouable ou un Deezer lent
 * tenaient la requete bien au-dela des 60 s de nginx : l'hote voyait une
 * erreur pendant que le serveur finissait par lancer la partie dans le vide.
 *
 * Trois bornes, pour tout le lancement :
 * - un budget de recherches (LOOKUPS_PER_ROUND par manche demandee, ou par
 *   joueur s'ils sont plus nombreux) ;
 * - une echeance : passe deadlineMs, on ne lance plus de recherche, et celles
 *   en cours sont abandonnees ;
 * - un disjoncteur : breakerFailures recherches de suite sans reponse (delai
 *   depasse ou erreur) et on arrete de chercher.
 */

/** Recherches d'extrait permises pour tout un lancement, par manche demandee. */
export const LOOKUPS_PER_ROUND = 6;

/** Reglable pour les tests d'integration ; la prod garde ces valeurs. */
export const START_LIMITS = {
  deadlineMs: 20_000,
  lookupTimeoutMs: 4_000,
  breakerFailures: 6,
};

export type LookupStop = "budget" | "deadline" | "breaker";

export class LookupGuard {
  private left: number;
  private readonly deadline: number;
  private consecutiveFailures = 0;
  /** Pourquoi on a cesse de chercher (null : jamais). */
  stoppedBy: LookupStop | null = null;
  /** Recherches lancees. */
  lookups = 0;
  /** Recherches sans reponse (delai depasse ou erreur). */
  failures = 0;

  constructor(maxLookups: number, now: number = Date.now()) {
    this.left = Math.max(0, maxLookups);
    this.deadline = now + START_LIMITS.deadlineMs;
  }

  remainingMs(): number {
    return this.deadline - Date.now();
  }

  /** Delai accorde a une recherche : le delai unitaire, ou le temps qui reste s'il est plus court. */
  timeoutMs(): number {
    return Math.max(0, Math.min(START_LIMITS.lookupTimeoutMs, this.remainingMs()));
  }

  /** Reserve une recherche ; faux si l'echeance, le disjoncteur ou le budget l'interdit. */
  take(): boolean {
    if (this.stoppedBy === "deadline" || this.stoppedBy === "breaker") return false;
    if (this.remainingMs() <= 0) {
      this.stoppedBy = "deadline";
      return false;
    }
    if (this.left <= 0) {
      this.stoppedBy = "budget";
      return false;
    }
    this.left -= 1;
    this.lookups += 1;
    return true;
  }

  succeeded(): void {
    this.consecutiveFailures = 0;
  }

  failed(): void {
    this.failures += 1;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= START_LIMITS.breakerFailures) this.stoppedBy = "breaker";
  }

  /** Vrai si des titres n'ont pas pu etre verifies : c'est Deezer ou nos bornes, pas les playlists. */
  get limited(): boolean {
    return this.stoppedBy !== null || this.failures > 0;
  }
}
