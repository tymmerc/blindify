import fs from "fs";
import path from "path";
import { pool } from "../config/db";
import type { FeedbackInput, FeedbackMode } from "../utils/feedbackValidation";

/**
 * Retours de fin de partie : table game_feedback.
 *
 * La definition de reference est backend/migrations/004_game_feedback.sql,
 * appliquee en prod avec le deploiement, puis 007_feedback_contact.sql (T24).
 * Celle-ci recopie la 004 (sans le GRANT du tableau de bord) pour les bases
 * qui ne l'ont pas encore : pile de test et CI partent du schema de la prod.
 * La 007 est jouee telle quelle depuis son fichier (FEEDBACK_007_SQL).
 * tests/integration/feedback.spec.ts verifie que les deux chemins creent
 * exactement la meme table.
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
  await pool.query(feedback007Sql());
}

// La 007 est lue dans le depot (copiee dans l'image avec backend/migrations) :
// une seule ecriture des requetes, pas de copie qui pourrait diverger.
let cached007: string | null = null;
function feedback007Sql(): string {
  if (!cached007) {
    cached007 = fs.readFileSync(path.join(__dirname, "../../migrations/007_feedback_contact.sql"), "utf8");
  }
  return cached007;
}

export const MAX_USER_AGENT = 300;

// Duree de conservation des retours, promise sur la page de confidentialite.
// Le janitor du backend (index.ts, toutes les 6 heures) passe cette requete.
export const FEEDBACK_RETENTION_MONTHS = 12;
export const FEEDBACK_PURGE_SQL =
  `DELETE FROM game_feedback WHERE created_at < NOW() - INTERVAL '${FEEDBACK_RETENTION_MONTHS} months'`;

// Contact laisse avec un message (T24) : 12 mois, promis sur /confidentialite.
// Aujourd'hui la ligne entiere part au meme age ; cette etape garde la promesse
// meme si la duree des retours change un jour.
export const CONTACT_RETENTION_MONTHS = 12;
export const CONTACT_PURGE_SQL =
  `UPDATE game_feedback SET contact = NULL
   WHERE contact IS NOT NULL AND created_at < NOW() - INTERVAL '${CONTACT_RETENTION_MONTHS} months'`;

// Comment un retour retrouve sa partie :
// - en solo, le client envoie l'identifiant de sa partie (il le connait) ;
// - en multijoueur, il ne connait que le code de la salle : on retrouve la
//   partie cote serveur (room_code est unique). Un identifiant envoye en plus
//   par le client est ignore, il ne doit pas pouvoir rattacher le retour a une
//   autre partie que celle de la salle ;
// - pour un defi, le code est celui du defi, sans rapport avec une salle ; ni
//   le defi ni le chrono ni le buzzer n'ont d'identifiant a envoyer.
const CLIENT_SESSION_MODES: ReadonlySet<FeedbackMode> = new Set<FeedbackMode>(["solo"]);
const ROOM_MODES: ReadonlySet<FeedbackMode> = new Set<FeedbackMode>(["friends", "event"]);

// Table absente, ou colonne contact absente (backend neuf sur une base que la
// 007 n'a pas encore touchee) : dans les deux cas, on met le schema a jour.
const SCHEMA_ERRORS: ReadonlySet<string> = new Set(["42P01", "42703"]);

const isUndefinedTable = (err: unknown): boolean =>
  typeof err === "object" && err !== null && SCHEMA_ERRORS.has(String((err as { code?: unknown }).code));

async function insertFeedback(input: FeedbackInput, userAgent: string | null): Promise<number> {
  const sessionId = CLIENT_SESSION_MODES.has(input.mode) ? input.sessionId : null;
  const roomCode = ROOM_MODES.has(input.mode) ? input.gameCode : null;
  // Au plus un des deux est renseigne, selon le mode. Un identifiant de partie
  // qui n'existe pas devient NULL au lieu de faire echouer l'insertion sur la
  // cle etrangere : le retour compte plus que le lien.
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO game_feedback (kind, answer, message, mode, session_id, game_code, user_agent, app_version, contact)
     VALUES ($1, $2, $3, $4,
       COALESCE(
         (SELECT id FROM game_sessions WHERE id = $5),
         (SELECT session_id FROM multiplayer_rooms WHERE room_code = $9)),
       $6, $7, $8, $10)
     RETURNING id`,
    [
      input.kind,
      input.answer,
      input.message,
      input.mode,
      sessionId,
      input.gameCode,
      userAgent,
      input.appVersion,
      roomCode,
      input.contact,
    ]
  );
  return rows[0].id;
}

/**
 * Enregistre un retour. Si la table ou la colonne contact manque (creation au
 * demarrage ratee, base pas encore migree), on la cree et on reessaie une fois.
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
