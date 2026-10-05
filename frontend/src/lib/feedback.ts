// Retours de fin de partie (« Ça s'est bien passé ? »), envoyes a POST
// /api/feedback et lus par Tym dans l'onglet Retours du tableau de bord.
// Miroir des valeurs acceptees par backend/src/utils/feedbackValidation.ts.

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

export function buildAnswerPayload(context: FeedbackContext, answer: FeedbackAnswer): FeedbackPayload {
  return { kind: "avis", answer, ...contextFields(context) }
}

export function buildBugPayload(context: FeedbackContext, message: string): FeedbackPayload {
  const text = message.trim().slice(0, FEEDBACK_MESSAGE_MAX)
  return { kind: "bug", ...(text ? { message: text } : {}), ...contextFields(context) }
}
