import { pool } from "../config/db";
import { logger } from "../utils/logger";
import type { GameState } from "./realtimeGame";
import { roundOwnerIds } from "./roundOwners";

/**
 * Multiplayer game persistence.
 *
 * The realtime game state lives in memory (realtimeGame.ts). These helpers
 * mirror the meaningful results into Postgres so that history, stats and
 * leaderboards reflect multiplayer games (previously they never did — rooms
 * stayed `in_progress` with score 0 forever).
 *
 * Every function here is fire-and-forget from the game loop's perspective:
 * callers MUST NOT await them in a way that blocks gameplay, and these
 * functions never throw — failures are logged, never surfaced to players.
 */

/**
 * Sort une room de l'etat 'in_progress' en base au game over. Le multi
 * classique le fait dans persistGameResults ; le mode streamer n'a pas de
 * persistance de scores mais doit quand meme finaliser la room, sinon elle
 * reste zombie 'in_progress' (comme les 440 d'avant le fix) et un game:sync
 * tardif afficherait un faux "partie interrompue". Fire-and-forget.
 */
export async function markMultiplayerRoomFinished(roomCode: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE multiplayer_rooms
       SET status='finished', completed_at=COALESCE(completed_at, NOW())
       WHERE room_code=$1 AND status='in_progress'`,
      [roomCode],
    );
  } catch (err) {
    logger.error("mark_room_finished_failed", { roomCode, error: err });
  }
}

/**
 * Colonnes ajoutees le 28/09/2026 a round_responses, idempotent au boot comme
 * ensureLinksSchema. Avant, le serveur SAVAIT a la revelation le verdict fin
 * (correct / proche / faux) et si le joueur avait devine qui a mis le morceau,
 * mais n'ecrivait qu'un booleen "juste". Le "proche" et toute la mecanique
 * "qui a mis quoi", pourtant la signature du jeu, n'etaient mesures nulle part.
 */
export async function ensureResponseSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE round_responses
      ADD COLUMN IF NOT EXISTS verdict TEXT,
      ADD COLUMN IF NOT EXISTS source_guess INTEGER,
      ADD COLUMN IF NOT EXISTS source_owner INTEGER,
      ADD COLUMN IF NOT EXISTS source_correct BOOLEAN
  `);
}

function reactionMs(answerAt: number | null | undefined, startAt: number | null): number | null {
  if (!answerAt || !startAt) return null;
  return Math.max(0, answerAt - startAt);
}

type ResponseRow = {
  userId: number;
  guessTitle: string | null;
  guessArtist: string | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  scoreDelta: number;
  verdict: string | null;
  sourceGuess: number | null;
  sourceOwner: number | null;
  sourceCorrect: boolean | null;
};

/**
 * Copie, au moment de la revelation, de tout ce qu'il faut ecrire. `state` est
 * l'etat VIVANT de la partie : si les joueurs enchainent pendant qu'on attend
 * la base, la manche suivante remet hasAnswered, les reponses, la piste et
 * startAt a zero dans ce meme objet. Lire apres un await, c'etait perdre des
 * reponses, voire ecrire celles de la manche suivante sur cette ligne
 * (trouve par la CI le 01/10/2026). Tout est donc lu ici, sans attendre.
 */
function snapshotResponses(state: GameState): { round: number; rows: ResponseRow[] } {
  const startAt = state.timing.startAt;
  // Le proprietaire du morceau tel que le serveur l'a juge a la revelation.
  // On le fige ici plutot que de le rejoindre plus tard via audio_sources :
  // cette propriete se detache quand le compte disparait, et 181 manches
  // reelles avaient deja perdu la leur.
  // Morceau partage : source_owner garde le contributeur de la manche, et
  // deviner un autre joueur qui l'avait importe compte juste (roundOwners.ts).
  const owners = roundOwnerIds(state.currentTrack?.metadata);
  const sourceOwner = owners[0] ?? null;
  const rows = Object.values(state.players)
    .filter(player => player.hasAnswered)
    .map(player => {
      const sourceGuess = player.lastSourceGuess ?? null;
      return {
        userId: player.userId,
        guessTitle: player.lastGuessTitle ?? null,
        guessArtist: player.lastGuessArtist ?? null,
        isCorrect: player.lastVerdict === "correct",
        responseTimeMs: reactionMs(player.answerAt, startAt),
        scoreDelta: player.lastGained ?? 0,
        verdict: player.lastVerdict ?? null,
        sourceGuess,
        sourceOwner,
        // Meme regle que computeScore : un point si la devinette vise l'un des proprietaires.
        sourceCorrect: sourceOwner != null && sourceGuess != null ? owners.includes(sourceGuess) : null,
      };
    });
  return { round: state.currentRound, rows };
}

/**
 * Persist every answer for the round that was just revealed.
 * No-ops when the game has no backing DB session (e.g. tests).
 */
export async function persistRoundResponses(state: GameState, sessionId: number | undefined): Promise<void> {
  if (!sessionId) return;
  const roomCode = state.roomCode;
  let round = 0;
  try {
    // Copie synchrone, AVANT le premier await (voir snapshotResponses).
    const snapshot = snapshotResponses(state);
    round = snapshot.round;
    const responses = snapshot.rows;
    if (!round) return;
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM game_rounds WHERE session_id = $1 AND round_index = $2 LIMIT 1`,
      [sessionId, round],
    );
    const roundId = rows[0]?.id;
    if (!roundId) return;

    for (const r of responses) {
      await pool.query(
        `INSERT INTO round_responses (round_id, user_id, guess_title, guess_artist, is_correct, response_time_ms, score_delta,
                                      verdict, source_guess, source_owner, source_correct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (round_id, user_id) DO UPDATE SET
           guess_title = EXCLUDED.guess_title,
           guess_artist = EXCLUDED.guess_artist,
           is_correct = EXCLUDED.is_correct,
           response_time_ms = EXCLUDED.response_time_ms,
           score_delta = EXCLUDED.score_delta,
           verdict = EXCLUDED.verdict,
           source_guess = EXCLUDED.source_guess,
           source_owner = EXCLUDED.source_owner,
           source_correct = EXCLUDED.source_correct`,
        [
          roundId,
          r.userId,
          r.guessTitle,
          r.guessArtist,
          r.isCorrect,
          r.responseTimeMs,
          r.scoreDelta,
          r.verdict,
          r.sourceGuess,
          r.sourceOwner,
          r.sourceCorrect,
        ],
      );
    }
  } catch (err) {
    logger.error("persist_round_responses_failed", { roomCode, round, error: err });
  }
}

/**
 * Persist final scores when a game finishes: per-player participant rows,
 * aggregate user_stats, and flip the session to `finished`.
 * No-ops when the game has no backing DB session.
 */
export async function persistGameResults(state: GameState, sessionId: number | undefined): Promise<void> {
  if (!sessionId) return;
  // Meme precaution que persistRoundResponses : broadcastGameOver passe l'objet
  // vivant (gameStateSnapshot ne copie qu'en phase GUESSING). On copie avant le
  // premier await, pour ne jamais dependre de ce qui arrive ensuite a la partie.
  const roomCode = state.roomCode;
  const totalRounds = state.totalRounds;
  const players = Object.values(state.players).map(p => ({
    userId: p.userId,
    score: p.score,
    accuracy: p.accuracy,
    bestStreak: p.bestStreak,
    correct: p.correct,
    rounds: p.rounds,
    totalReactionMs: p.totalReactionMs,
  }));
  try {
    for (const player of players) {
      await pool.query(
        `UPDATE game_participants
         SET score = $3, accuracy = $4, best_streak = $5
         WHERE session_id = $1 AND user_id = $2`,
        [sessionId, player.userId, player.score, player.accuracy, player.bestStreak],
      );
      // XP gratifiant : avec le scoring 1pt, le score brut (0-N) ferait stagner
      // les niveaux. On recompense les bonnes reponses + la meilleure serie.
      const xpGain = player.correct * 10 + player.bestStreak * 5;
      // Aggregate lifetime stats (mirrors the solo persistSoloResult pattern).
      // total_reaction_ms alimente la carte "Temps de reaction" (sinon = 0 a vie).
      await pool.query(
        `INSERT INTO user_stats (user_id, total_games, total_correct, total_guesses, total_xp, total_reaction_ms, best_streak, last_played_at, updated_at)
         VALUES ($1, 1, $2, $3, $4, $6, $5, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           total_games = user_stats.total_games + 1,
           total_correct = user_stats.total_correct + $2,
           total_guesses = user_stats.total_guesses + $3,
           total_xp = user_stats.total_xp + $4,
           total_reaction_ms = user_stats.total_reaction_ms + $6,
           best_streak = GREATEST(user_stats.best_streak, $5),
           last_played_at = NOW(),
           updated_at = NOW()`,
        [player.userId, player.correct, player.rounds, xpGain, player.bestStreak, Math.round(player.totalReactionMs ?? 0)],
      );
    }
    await pool.query(
      `UPDATE game_sessions
       SET state = 'finished', ended_at = COALESCE(ended_at, NOW()), current_round = $2
       WHERE id = $1 AND state <> 'finished'`,
      [sessionId, totalRounds],
    );
    // La room sort de "in_progress" en base : sans ca, elle servait le corrige
    // via /state pour toujours et s'accumulait en zombie (440 en prod avant ce
    // fix). Le "rejouer" la repasse en waiting puis in_progress normalement.
    await pool.query(
      `UPDATE multiplayer_rooms
       SET status = 'finished', completed_at = COALESCE(completed_at, NOW())
       WHERE room_code = $1 AND status = 'in_progress'`,
      [roomCode],
    );
    logger.info("multiplayer_game_persisted", { roomCode, sessionId, players: players.length });
  } catch (err) {
    logger.error("persist_game_results_failed", { roomCode, sessionId, error: err });
  }
}
