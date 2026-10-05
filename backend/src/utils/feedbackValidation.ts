/**
 * Validation des retours de fin de partie (POST /api/feedback).
 *
 * Meme approche que socketValidation.ts : pas de bibliotheque de schema, des
 * fonctions pures qui bornent chaque champ. Le corps vient d'un client non
 * fiable : tout ce qui n'est pas prevu est refuse avec un message clair, rien
 * n'est devine.
 */
import { validRoomCode } from "./socketValidation";

export const FEEDBACK_KINDS = ["avis", "bug"] as const;
export const FEEDBACK_ANSWERS = ["oui", "pas_trop"] as const;
// Les ecrans de resultats ou un joueur est devant son propre ecran. Pas
// d'ecran central (presentateur d'une partie autour d'une table), pas de
// streamer tant que le mode reste masque.
export const FEEDBACK_MODES = ["solo", "defi", "chrono", "buzzer", "friends", "event"] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackAnswer = (typeof FEEDBACK_ANSWERS)[number];
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];

export const MAX_FEEDBACK_MESSAGE = 1000;
const MAX_SESSION_ID = 2_147_483_647; // INTEGER de PostgreSQL
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

export interface FeedbackInput {
  kind: FeedbackKind;
  answer: FeedbackAnswer | null;
  message: string | null;
  mode: FeedbackMode;
  sessionId: number | null;
  gameCode: string | null;
  appVersion: string | null;
}

export type FeedbackParseResult =
  | { ok: true; value: FeedbackInput }
  | { ok: false; code: string; message: string };

const isAbsent = (value: unknown): boolean => value === undefined || value === null || value === "";

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Retire les caracteres de controle, sauf la tabulation et le saut de ligne.
 * Le caractere nul en particulier fait echouer l'INSERT d'un TEXT dans PostgreSQL.
 */
function stripControlChars(text: string): string {
  return Array.from(text)
    .filter(ch => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || (code >= 32 && code !== 127);
    })
    .join("");
}

/** Texte libre nettoye ; null si vide, "invalid" si ce n'est pas du texte ou s'il est trop long. */
function cleanMessage(value: unknown): string | null | "invalid" {
  if (isAbsent(value)) return null;
  if (typeof value !== "string") return "invalid";
  const cleaned = stripControlChars(value.replace(/\r\n?/g, "\n")).trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_FEEDBACK_MESSAGE ? "invalid" : cleaned;
}

function cleanSessionId(value: unknown): number | null | "invalid" {
  if (isAbsent(value)) return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_SESSION_ID
    ? value
    : "invalid";
}

function cleanGameCode(value: unknown): string | null | "invalid" {
  if (isAbsent(value)) return null;
  return validRoomCode(value)?.toUpperCase() ?? "invalid";
}

function cleanVersion(value: unknown): string | null | "invalid" {
  if (isAbsent(value)) return null;
  return typeof value === "string" && VERSION_PATTERN.test(value) ? value : "invalid";
}

const refuse = (code: string, message: string): FeedbackParseResult => ({ ok: false, code, message });

export function parseFeedback(body: unknown): FeedbackParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return refuse("invalid_body", "Retour illisible.");
  }
  const raw = body as Record<string, unknown>;

  const kind = oneOf(FEEDBACK_KINDS, raw.kind);
  if (!kind) return refuse("invalid_kind", "Type de retour inconnu.");
  const mode = oneOf(FEEDBACK_MODES, raw.mode);
  if (!mode) return refuse("invalid_mode", "Mode de jeu inconnu.");

  // Un avis porte toujours une reponse, un bug jamais (contrainte reprise en base).
  const answer = oneOf(FEEDBACK_ANSWERS, raw.answer);
  if (kind === "avis" && !answer) return refuse("invalid_answer", "Choisis une réponse.");
  if (kind === "bug" && !isAbsent(raw.answer)) return refuse("invalid_answer", "Un signalement n'a pas de réponse rapide.");

  const message = cleanMessage(raw.message);
  if (message === "invalid") return refuse("invalid_message", `Ton message doit faire ${MAX_FEEDBACK_MESSAGE} caractères au plus.`);
  const sessionId = cleanSessionId(raw.sessionId);
  if (sessionId === "invalid") return refuse("invalid_session", "Partie inconnue.");
  const gameCode = cleanGameCode(raw.gameCode);
  if (gameCode === "invalid") return refuse("invalid_code", "Code de partie invalide.");
  const appVersion = cleanVersion(raw.appVersion);
  if (appVersion === "invalid") return refuse("invalid_version", "Version invalide.");

  return { ok: true, value: { kind, answer, message, mode, sessionId, gameCode, appVersion } };
}
