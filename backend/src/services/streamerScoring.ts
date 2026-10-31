/**
 * Bareme des viewers du mode streamer (T5). Fonctions pures.
 *
 * - Justesse comme les autres modes : le titre et l'artiste se comparent avec
 *   evaluateGuessDetail (variantes, fautes de frappe, champs croises).
 * - 10 points pour le titre, 10 pour l'artiste.
 * - Bonus de rapidite, jusqu'a 10 points, seulement si quelque chose est juste :
 *   proportionnel au temps qui restait quand la reponse est arrivee.
 *
 * Pourquoi une echelle de 10 et pas 1 comme entre amis : avec des centaines de
 * viewers, il faut des ecarts pour departager, et le chat Twitch (T5b) recoit
 * une fraction de ces points. Avec 1 point, la moitie ne voudrait rien dire.
 */
import { evaluateGuessDetail } from "./guessMatching";
import type { Verdict } from "./realtimeGame";

export const POINTS_TITLE = 10;
export const POINTS_ARTIST = 10;
export const POINTS_SPEED_MAX = 10;

export interface ViewerAnswer {
  title: string;
  artist: string;
  /** Heure serveur de reception. */
  at: number;
}

export interface AnswerWindow {
  startAt: number;
  endAt: number;
}

export interface ViewerRoundScore {
  verdict: Verdict;
  matchedTitle: boolean;
  matchedArtist: boolean;
  points: number;
  /** Temps de reponse, pour departager les egalites au classement. */
  reactionMs: number;
}

/** Part du temps de reponse qui restait (1 = tout de suite, 0 = au gong). */
export function remainingRatio(at: number, window: AnswerWindow): number {
  const total = window.endAt - window.startAt;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (window.endAt - at) / total));
}

/**
 * Points d'une reponse. `factor` reduit le tout (chat Twitch, T5b) : 1 sur la
 * page viewer. Le resultat est toujours un entier.
 */
export function scoreViewerAnswer(
  answer: ViewerAnswer,
  track: { title: string; artist: string },
  window: AnswerWindow,
  factor = 1,
): ViewerRoundScore {
  const detail = evaluateGuessDetail("", track, answer.title, answer.artist);
  const base = (detail.matchedTitle ? POINTS_TITLE : 0) + (detail.matchedArtist ? POINTS_ARTIST : 0);
  const speed = base > 0 ? POINTS_SPEED_MAX * remainingRatio(answer.at, window) : 0;
  const safeFactor = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 0;
  return {
    verdict: detail.verdict,
    matchedTitle: detail.matchedTitle,
    matchedArtist: detail.matchedArtist,
    points: Math.round((base + speed) * safeFactor),
    reactionMs: Math.max(0, answer.at - window.startAt),
  };
}

/**
 * Chat Twitch (T5b) : moitie du bareme, et anti-spoiler. Une bonne reponse
 * dans le chat est visible par tous : apres la premiere, les points du chat
 * fondent en quelques secondes (jusqu'a un plancher), pour que recopier ne
 * rapporte presque rien. La page viewer garde son bareme plein.
 */
export const CHAT_FACTOR = 0.5;
export const CHAT_SPOILER_DECAY_MS = 4_000;
const CHAT_SPOILER_FLOOR = 0.1;

export function chatFactor(at: number, firstHitAt: number | null): number {
  if (firstHitAt === null || at <= firstHitAt) return CHAT_FACTOR;
  const left = 1 - (at - firstHitAt) / CHAT_SPOILER_DECAY_MS;
  return CHAT_FACTOR * Math.max(CHAT_SPOILER_FLOOR, left);
}
