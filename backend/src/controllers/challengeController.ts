import type { Request, Response } from "express";
import { pool } from "../config/db";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";
import crypto from "crypto";

function generateCode(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export const challengeController = {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { tracks, creatorName, score, correct, total, bestStreak } = req.body ?? {};

      if (!Array.isArray(tracks) || tracks.length === 0) {
        fail(res, "invalid_tracks", "La liste de pistes est requise", 400);
        return;
      }

      const safeName = typeof creatorName === "string" ? creatorName.trim().slice(0, 120) : "Joueur";
      const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Number(score)) : 0;
      const safeCorrect = Number.isFinite(Number(correct)) ? Math.max(0, Number(correct)) : 0;
      const safeTotal = Number.isFinite(Number(total)) ? Math.max(0, Number(total)) : tracks.length;
      const safeBestStreak = Number.isFinite(Number(bestStreak)) ? Math.max(0, Number(bestStreak)) : 0;

      // Sanitize track data: only keep expected fields
      const sanitizedTracks = tracks.map((t: Record<string, unknown>) => ({
        title: typeof t.title === "string" ? t.title : "",
        artist: typeof t.artist === "string" ? t.artist : "",
        album_cover: typeof t.album_cover === "string" ? t.album_cover : null,
        audio_url: typeof t.audio_url === "string" ? t.audio_url : null,
        audioSourceId: t.audioSourceId ?? null,
        track_id: t.track_id ?? null,
        type: typeof t.type === "string" ? t.type : "guest",
      }));

      // Generate a unique code with retry
      let code = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCode(8);
        const { rowCount } = await pool.query(
          "SELECT 1 FROM challenges WHERE code = $1",
          [candidate]
        );
        if (rowCount === 0) {
          code = candidate;
          break;
        }
      }

      if (!code) {
        fail(res, "code_generation_failed", "Impossible de generer un code unique", 500);
        return;
      }

      await pool.query(
        `INSERT INTO challenges (code, creator_name, track_data, creator_score, creator_correct, creator_total, creator_best_streak)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [code, safeName, JSON.stringify(sanitizedTracks), safeScore, safeCorrect, safeTotal, safeBestStreak]
      );

      ok(res, { code });
    } catch (err) {
      logger.error("challenge_create_failed", { error: err });
      fail(res, "challenge_create_error", "Impossible de creer le defi", 500);
    }
  },

  async get(req: Request, res: Response): Promise<void> {
    try {
      const code = typeof req.params.code === "string" ? req.params.code.toUpperCase().trim() : "";

      if (!code || code.length < 4 || code.length > 12) {
        fail(res, "invalid_code", "Code de defi invalide", 400);
        return;
      }

      const { rows } = await pool.query(
        `SELECT id, code, creator_name, track_data, creator_score, creator_correct, creator_total, creator_best_streak, created_at
         FROM challenges
         WHERE code = $1
         LIMIT 1`,
        [code]
      );

      if (rows.length === 0) {
        fail(res, "challenge_not_found", "Defi introuvable", 404);
        return;
      }

      const challenge = rows[0];
      const trackData = typeof challenge.track_data === "string"
        ? JSON.parse(challenge.track_data)
        : challenge.track_data;

      // Fetch existing attempts for leaderboard
      const { rows: attempts } = await pool.query(
        `SELECT player_name, score, correct, total, best_streak, completed_at
         FROM challenge_attempts
         WHERE challenge_id = $1
         ORDER BY score DESC, completed_at ASC`,
        [challenge.id]
      );

      ok(res, {
        code: challenge.code,
        creatorName: challenge.creator_name,
        creatorScore: challenge.creator_score,
        creatorCorrect: challenge.creator_correct,
        creatorTotal: challenge.creator_total,
        creatorBestStreak: challenge.creator_best_streak,
        trackCount: Array.isArray(trackData) ? trackData.length : 0,
        tracks: trackData,
        createdAt: challenge.created_at,
        attempts: attempts.map((a: Record<string, unknown>) => ({
          playerName: a.player_name,
          score: a.score,
          correct: a.correct,
          total: a.total,
          bestStreak: a.best_streak,
          completedAt: a.completed_at,
        })),
      });
    } catch (err) {
      logger.error("challenge_get_failed", { error: err });
      fail(res, "challenge_get_error", "Impossible de charger le defi", 500);
    }
  },

  async complete(req: Request, res: Response): Promise<void> {
    try {
      const code = typeof req.params.code === "string" ? req.params.code.toUpperCase().trim() : "";

      if (!code || code.length < 4 || code.length > 12) {
        fail(res, "invalid_code", "Code de defi invalide", 400);
        return;
      }

      const { playerName, score, correct, total, bestStreak } = req.body ?? {};

      const safeName = typeof playerName === "string" ? playerName.trim().slice(0, 120) : "Joueur";
      const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Number(score)) : 0;
      const safeCorrect = Number.isFinite(Number(correct)) ? Math.max(0, Number(correct)) : 0;
      const safeTotal = Number.isFinite(Number(total)) ? Math.max(0, Number(total)) : 0;
      const safeBestStreak = Number.isFinite(Number(bestStreak)) ? Math.max(0, Number(bestStreak)) : 0;

      // Lookup challenge
      const { rows: challengeRows } = await pool.query(
        "SELECT id FROM challenges WHERE code = $1 LIMIT 1",
        [code]
      );

      if (challengeRows.length === 0) {
        fail(res, "challenge_not_found", "Defi introuvable", 404);
        return;
      }

      const challengeId = challengeRows[0].id;

      // Insert attempt
      await pool.query(
        `INSERT INTO challenge_attempts (challenge_id, player_name, score, correct, total, best_streak)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [challengeId, safeName, safeScore, safeCorrect, safeTotal, safeBestStreak]
      );

      // Return full leaderboard
      const { rows: attempts } = await pool.query(
        `SELECT player_name, score, correct, total, best_streak, completed_at
         FROM challenge_attempts
         WHERE challenge_id = $1
         ORDER BY score DESC, completed_at ASC`,
        [challengeId]
      );

      ok(res, {
        leaderboard: attempts.map((a: Record<string, unknown>) => ({
          playerName: a.player_name,
          score: a.score,
          correct: a.correct,
          total: a.total,
          bestStreak: a.best_streak,
          completedAt: a.completed_at,
        })),
      });
    } catch (err) {
      logger.error("challenge_complete_failed", { error: err });
      fail(res, "challenge_complete_error", "Impossible d'enregistrer le resultat", 500);
    }
  },
};
