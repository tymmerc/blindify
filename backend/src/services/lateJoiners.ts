/**
 * Arrivee en cours de partie (T19, decision de Tym du 29/10/2026).
 *
 * Un joueur qui entre dans la salle pendant une partie n'est plus refuse : il
 * attend, puis il joue a partir de la manche suivante, avec 0 point.
 *
 * Tant qu'il attend, il n'est PAS dans `players` : c'est ce qui le tient hors
 * de tout ce qui compte (reponses, revelation anticipee, joueurs prets,
 * scores, persistance). Il recoit les memes trames que tout le monde, deja
 * caviardees. Au debut de la manche suivante (pas au reveal), il passe dans
 * `players`. S'il est coupe a ce moment-la, il attend la manche d'apres :
 * promu absent, il retiendrait la manche sans pouvoir y repondre.
 *
 * Fonctions pures : l'etat de la partie vit dans realtimeGame.ts.
 */
import type { PlayerState } from "./realtimeGame";

export type WaitingPlayer = {
  userId: number;
  username: string | null;
  avatar?: string | null;
  /** Coupe du reseau pendant l'attente : pas promu tant qu'il n'est pas revenu. */
  disconnected?: boolean;
};

/** Ce qui part sur le fil : qui attend, rien d'autre. */
export type PublicWaitingPlayer = { userId: number; username: string | null };

/**
 * Ajoute (ou rafraichit) un retardataire. Un rechargement de page pendant
 * l'attente ne cree pas de doublon : l'entree garde sa place et redevient
 * connectee. `added` dit si c'est une vraie arrivee (a annoncer aux autres).
 */
export function withWaiting(
  waiting: readonly WaitingPlayer[],
  entry: Readonly<Omit<WaitingPlayer, "disconnected">>,
): { waiting: WaitingPlayer[]; added: boolean } {
  const known = waiting.some(w => w.userId === entry.userId);
  if (!known) return { waiting: [...waiting, { ...entry, disconnected: false }], added: true };
  return {
    waiting: waiting.map(w => (w.userId === entry.userId ? { ...w, ...entry, disconnected: false } : w)),
    added: false,
  };
}

export function withoutWaiting(waiting: readonly WaitingPlayer[], userId: number): WaitingPlayer[] {
  return waiting.filter(w => w.userId !== userId);
}

export function withWaitingConnection(
  waiting: readonly WaitingPlayer[],
  userId: number,
  connected: boolean,
): WaitingPlayer[] {
  return waiting.map(w => (w.userId === userId ? { ...w, disconnected: !connected } : w));
}

export function isWaiting(waiting: readonly WaitingPlayer[] | undefined, userId: number): boolean {
  return (waiting ?? []).some(w => w.userId === userId);
}

/**
 * Les retardataires connectes deviennent joueurs : 0 point, aucune manche
 * jouee. Pour le departage d'egalite (temps de reponse cumule), chaque manche
 * manquee compte comme une manche sans reponse, temps plein : arriver tard ne
 * donne pas d'avance au departage.
 */
export function promoteWaiting(
  waiting: readonly WaitingPlayer[],
  missedRounds: number,
  roundDurationMs: number,
): { promoted: PlayerState[]; stillWaiting: WaitingPlayer[] } {
  const ready = waiting.filter(w => !w.disconnected);
  const promoted = ready.map(w => newPlayer(w, Math.max(0, missedRounds) * roundDurationMs));
  return { promoted, stillWaiting: waiting.filter(w => w.disconnected) };
}

function newPlayer(w: WaitingPlayer, missedMs: number): PlayerState {
  return {
    userId: w.userId,
    username: w.username,
    avatar: w.avatar ?? null,
    score: 0,
    accuracy: 0,
    rounds: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    hasAnswered: false,
    isReady: false,
    totalReactionMs: missedMs,
  };
}

export function publicWaiting(waiting: readonly WaitingPlayer[]): PublicWaitingPlayer[] {
  return waiting.map(w => ({ userId: w.userId, username: w.username }));
}
