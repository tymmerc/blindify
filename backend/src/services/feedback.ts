import { pool } from "../config/db";
import type { FeedbackInput, FeedbackMode } from "../utils/feedbackValidation";

/**
 * Retours de fin de partie : table game_feedback.
 *
 * La definition de reference est backend/migrations/004_game_feedback.sql,
 * appliquee en prod avec le deploiement. Celle-ci la recopie (sans le GRANT du
 * tableau de bord) pour les bases qui ne l'ont pas encore : pile de test et CI
 * partent du schema de la prod. tests/integration/feedback.spec.ts verifie que
 * les deux creent exactement la meme table.
 */
export async function ensureFeedbackSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_feedback (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('avis', 'bug')),
      answer TEXT CHECK (answer IN ('oui', 'pas_trop')),
      message TEXT CHECK (char_length(message) <= 1000),
      mode TEXT NOT NULL CHECK (mode IN ('solo', 'defi', 'chrono', 'buzzer', 'friends', 'event')),
      session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
      game_code TEXT CHECK (char_length(game_code) <= 16),
      user_agent TEXT CHECK (char_length(user_agent) <= 300),
      app_version TEXT CHECK (char_length(app_version) <= 40),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT game_feedback_answer_kind CHECK ((kind = 'avis') = (answer IS NOT NULL))
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_feedback_created ON game_feedback (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_feedback_session ON game_feedback (session_id)`);
}

export const MAX_USER_AGENT = 300;

// En multijoueur, le client connait le code de la salle, pas l'identifiant de
// la partie : on le retrouve cote serveur (room_code est unique). Pour un defi,
// le code est celui du defi, sans rapport avec une salle.
const ROOM_MODES: ReadonlySet<FeedbackMode> = new Set<FeedbackMode>(["friends", "event"]);

const UNDEFINED_TABLE = "42P01";

const isUndefinedTable = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === UNDEFINED_TABLE;

async function insertFeedback(input: FeedbackInput, userAgent: string | null): Promise<number> {
  const roomCode = ROOM_MODES.has(input.mode) ? input.gameCode : null;
  // Un identifiant de partie qui n'existe pas devient NULL au lieu de faire
  // echouer l'insertion sur la cle etrangere : le retour compte plus que le lien.
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO game_feedback (kind, answer, message, mode, session_id, game_code, user_agent, app_version)
     VALUES ($1, $2, $3, $4,
       COALESCE(
         (SELECT id FROM game_sessions WHERE id = $5),
         (SELECT session_id FROM multiplayer_rooms WHERE room_code = $9)),
       $6, $7, $8)
     RETURNING id`,
    [
      input.kind,
      input.answer,
      input.message,
      input.mode,
      input.sessionId,
      input.gameCode,
      userAgent,
      input.appVersion,
      roomCode,
    ]
  );
  return rows[0].id;
}

/**
 * Enregistre un retour. Si la table manque (creation au demarrage ratee, base
 * pas encore migree), on la cree et on reessaie une fois.
 */
export async function saveFeedback(input: FeedbackInput, userAgent: string | null): Promise<number> {
  const agent = userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null;
  try {
    return await insertFeedback(input, agent);
  } catch (err) {
    if (!isUndefinedTable(err)) throw err;
    await ensureFeedbackSchema();
    return insertFeedback(input, agent);
  }
}
