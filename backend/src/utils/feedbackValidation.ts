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

// Caracteres retires du texte libre, par plages de points de code :
// - controles C0 sauf tabulation et saut de ligne (le caractere nul fait
//   echouer l'INSERT d'un TEXT dans PostgreSQL), DEL et controles C1 ;
// - marques et forcages du sens d'ecriture : un U+202E retourne l'affichage du
//   texte qui le suit et ferait lire autre chose que ce qui a ete ecrit ;
// - caracteres invisibles sans chasse (espace sans chasse, gluon, BOM).
// On garde U+200C et U+200D (antiliant et liant sans chasse) : le second
// compose les emojis (famille, metiers), le premier sert a certaines langues.
const REMOVED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x1f], [0x7f, 0x9f],
  [0x061c, 0x061c], [0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069],
  [0x200b, 0x200b], [0x2060, 0x2064], [0xfeff, 0xfeff],
];

const isRemoved = (codePoint: number): boolean =>
  REMOVED_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);

// Fins de ligne de toutes origines (Windows, ancien Mac, separateurs Unicode
// U+2028 et U+2029) ramenees au saut de ligne simple.
const LINE_BREAKS = /\r\n?|[\u2028\u2029]/g;

/**
 * Texte lisible tel quel dans le tableau de bord : fins de ligne unifiees,
 * caracteres invisibles retires, espaces de fin de ligne enleves et pas plus
 * d'une ligne vide d'affilee.
 */
function cleanFreeText(text: string): string {
  const visible = Array.from(text.replace(LINE_BREAKS, "\n"))
    .filter(ch => !isRemoved(ch.codePointAt(0) ?? 0))
    .join("");
  return visible
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Texte libre nettoye ; null si vide, "invalid" si ce n'est pas du texte ou s'il est trop long. */
function cleanMessage(value: unknown): string | null | "invalid" {
  if (isAbsent(value)) return null;
  if (typeof value !== "string") return "invalid";
  const cleaned = cleanFreeText(value);
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

/**
 * Version du front : une simple aide au tri. Hors format, on la laisse tomber
 * (null) au lieu de refuser le retour : un build avec une version inattendue
 * ne doit pas faire echouer tous les envois.
 */
function cleanVersion(value: unknown): string | null {
  return typeof value === "string" && VERSION_PATTERN.test(value) ? value : null;
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

  return { ok: true, value: { kind, answer, message, mode, sessionId, gameCode, appVersion } };
}
