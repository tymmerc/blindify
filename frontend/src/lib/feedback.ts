// Retours de fin de partie (« Ça s'est bien passé ? »), envoyes a POST
// /api/feedback et lus par Tym dans l'onglet Retours du tableau de bord.
// Miroir des valeurs acceptees par backend/src/utils/feedbackValidation.ts.

import { ApiError, clientApi } from "./apiClient"

/** Ecrans de resultats ou le joueur est devant son propre ecran. */
export type FeedbackMode = "solo" | "defi" | "chrono" | "buzzer" | "friends" | "event"
export type FeedbackAnswer = "oui" | "pas_trop"

export const FEEDBACK_MESSAGE_MAX = 1000

export interface FeedbackContext {
  mode: FeedbackMode
  /** Identifiant de la partie quand le client le connait (solo). */
  sessionId?: number | null
  /** Code de la salle (multijoueur) ou du defi. */
  gameCode?: string | null
}

export interface FeedbackPayload extends FeedbackContext {
  kind: "avis" | "bug"
  answer?: FeedbackAnswer
  message?: string
  appVersion?: string
}

// Commit du build (next.config.js) : dit si un bug signale vient d'une version
// deja corrigee. Absent hors d'un depot git, on n'envoie alors rien.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || undefined

const contextFields = ({ mode, sessionId, gameCode }: FeedbackContext) => ({
  mode,
  ...(sessionId ? { sessionId } : {}),
  ...(gameCode ? { gameCode } : {}),
  ...(APP_VERSION ? { appVersion: APP_VERSION } : {}),
})

/**
 * Contexte du retour sur l'ecran de resultats multijoueur, ou null quand le
 * bloc ne doit pas s'afficher : ecran central d'une partie autour d'une table
 * (l'hote presente sans jouer), mode streamer (masque) ou mode inconnu.
 */
export function multiplayerFeedbackContext(options: {
  mode: string
  roomCode?: string | null
  isHost: boolean
  hostPlays: boolean
}): FeedbackContext | null {
  const { roomCode, isHost, hostPlays } = options
  const mode: FeedbackMode | null = options.mode === "friends" || options.mode === "event" ? options.mode : null
  if (!mode) return null
  if (mode === "event" && isHost && !hostPlays) return null
  return { mode, gameCode: roomCode ?? null }
}

export function buildAnswerPayload(context: FeedbackContext, answer: FeedbackAnswer): FeedbackPayload {
  return { kind: "avis", answer, ...contextFields(context) }
}

export function buildBugPayload(context: FeedbackContext, message: string): FeedbackPayload {
  const text = message.trim().slice(0, FEEDBACK_MESSAGE_MAX)
  return { kind: "bug", ...(text ? { message: text } : {}), ...contextFields(context) }
}

// Au-dela, on abandonne l'envoi : sur un reseau qui ne repond plus, le bouton
// ne doit pas tourner indefiniment.
export const FEEDBACK_TIMEOUT_MS = 10_000

/** Pourquoi un envoi a echoue : trop d'envois (429) ou tout le reste. */
export type FeedbackFailure = "rate_limited" | "failed"

export function feedbackFailure(err: unknown): FeedbackFailure {
  return err instanceof ApiError && err.status === 429 ? "rate_limited" : "failed"
}

/** Envoie un retour, abandonne s'il n'a pas de reponse dans le delai. */
export async function sendFeedback(payload: FeedbackPayload, timeoutMs = FEEDBACK_TIMEOUT_MS): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await clientApi.sendFeedback(payload, controller.signal)
  } finally {
    clearTimeout(timer)
  }
}
