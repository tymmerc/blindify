import { pool } from "../config/db";
import { logger } from "../utils/logger";
import type { GameState } from "./realtimeGame";

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

function reactionMs(answerAt: number | null | undefined, startAt: number | null): number | null {
  if (!answerAt || !startAt) return null;
  return Math.max(0, answerAt - startAt);
}

/**
 * Persist every answer for the round that was just revealed.
 * No-ops when the game has no backing DB session (e.g. tests).
 */
export async function persistRoundResponses(state: GameState, sessionId: number | undefined): Promise<void> {
  if (!sessionId) return;
  const round = state.currentRound;
  if (!round) return;
  try {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM game_rounds WHERE session_id = $1 AND round_index = $2 LIMIT 1`,
      [sessionId, round],
    );
    const roundId = rows[0]?.id;
    if (!roundId) return;

    const startAt = state.timing.startAt;
    for (const player of Object.values(state.players)) {
      if (!player.hasAnswered) continue;
      await pool.query(
        `INSERT INTO round_responses (round_id, user_id, guess_title, guess_artist, is_correct, response_time_ms, score_delta)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (round_id, user_id) DO UPDATE SET
           guess_title = EXCLUDED.guess_title,
           guess_artist = EXCLUDED.guess_artist,
           is_correct = EXCLUDED.is_correct,
           response_time_ms = EXCLUDED.response_time_ms,
           score_delta = EXCLUDED.score_delta`,
        [
          roundId,
          player.userId,
          player.lastGuessTitle ?? null,
          player.lastGuessArtist ?? null,
          player.lastVerdict === "correct",
          reactionMs(player.answerAt, startAt),
          player.lastGained ?? 0,
        ],
      );
    }
  } catch (err) {
    logger.error("persist_round_responses_failed", { roomCode: state.roomCode, round, error: err });
  }
}

/**
 * Persist final scores when a game finishes: per-player participant rows,
 * aggregate user_stats, and flip the session to `finished`.
 * No-ops when the game has no backing DB session.
 */
export async function persistGameResults(state: GameState, sessionId: number | undefined): Promise<void> {
  if (!sessionId) return;
  try {
    for (const player of Object.values(state.players)) {
      await pool.query(
        `UPDATE game_participants
         SET score = $3, accuracy = $4, best_streak = $5
         WHERE session_id = $1 AND user_id = $2`,
        [sessionId, player.userId, player.score, player.accuracy, player.bestStreak],
      );
      // Aggregate lifetime stats (mirrors the solo persistSoloResult pattern).
      await pool.query(
        `INSERT INTO user_stats (user_id, total_games, total_correct, total_guesses, total_xp, best_streak, last_played_at, updated_at)
         VALUES ($1, 1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           total_games = user_stats.total_games + 1,
           total_correct = user_stats.total_correct + $2,
           total_guesses = user_stats.total_guesses + $3,
           total_xp = user_stats.total_xp + $4,
           best_streak = GREATEST(user_stats.best_streak, $5),
           last_played_at = NOW(),
           updated_at = NOW()`,
        [player.userId, player.correct, player.rounds, player.score, player.bestStreak],
      );
    }
    await pool.query(
      `UPDATE game_sessions
       SET state = 'finished', ended_at = COALESCE(ended_at, NOW()), current_round = $2
       WHERE id = $1 AND state <> 'finished'`,
      [sessionId, state.totalRounds],
    );
    logger.info("multiplayer_game_persisted", { roomCode: state.roomCode, sessionId, players: Object.keys(state.players).length });
  } catch (err) {
    logger.error("persist_game_results_failed", { roomCode: state.roomCode, sessionId, error: err });
  }
}
