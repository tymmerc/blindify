import type { Request, Response } from "express";
import type { MusicProvider } from "../types/user";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import type { AudioSourceRow } from "../types/audio";
import { syncSpotifyLibrary } from "../services/providers/spotifySync";

async function fetchAudioSources(
  userId: number,
  provider: MusicProvider,
  count: number
): Promise<AudioSourceRow[]> {
  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata
     FROM audio_sources
     WHERE provider=$1 AND (user_id=$2 OR user_id IS NULL)
     ORDER BY RANDOM()
     LIMIT $3`,
    [provider, userId, count]
  );
  return rows;
}

export const gamesController = {
  async startSoloGame(req: Request, res: Response): Promise<void> {
    const preferredProvider = (req.body?.provider as MusicProvider | undefined) ?? undefined;
    const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "normal";
    const count = Number.isFinite(Number(req.body?.count)) ? Math.min(Math.max(Number(req.body.count), 5), 25) : 10;

    const context = await getSessionContext(req, res, {
      provider: preferredProvider,
      requireConnection: preferredProvider !== "guest",
    });
    if (!context) return;

    const provider: MusicProvider =
      preferredProvider ?? context.connection?.provider ?? context.user.provider ?? "guest";

    if (provider !== "guest" && !context.connection) {
      fail(res, "provider_connection_missing", "Aucune connexion active pour ce mode", 400);
      return;
    }

    let sources = await fetchAudioSources(context.user.id, provider, count);

    if (sources.length < count && provider === "spotify" && context.connection) {
      const { connection } = await syncSpotifyLibrary(
        context.user.id,
        context.connection,
        count
      );
      if (connection) {
        context.connection = connection;
      }
      sources = await fetchAudioSources(context.user.id, provider, count);
    }

    if (sources.length < count) {
      fail(res, "insufficient_tracks", "Pas assez de titres pour lancer la partie", 400, {
        needed: count,
        available: sources.length,
      });
      return;
    }

    const { rows: sessions } = await pool.query(
      `INSERT INTO game_sessions (host_user_id, mode, difficulty, source_provider, total_rounds, state)
       VALUES ($1,'solo',$2,$3,$4,'in_progress')
       RETURNING id, mode, difficulty, source_provider, total_rounds, started_at`,
      [context.user.id, difficulty, provider, count]
    );
    const session = sessions[0];

    await pool.query(
      `INSERT INTO game_participants (session_id, user_id, score, accuracy, avg_response_ms, best_streak)
       VALUES ($1,$2,0,null,null,null)
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [session.id, context.user.id]
    );

    const normalizedTracks = sources.map((source, index) => {
      return {
        round: index + 1,
        audioSourceId: source.id,
        type: source.provider,
        track_id: source.external_id ?? source.id,
        title: source.title,
        artist: source.artist,
        album_cover: source.album_cover,
        audio_url: source.audio_url,
        metadata: source.metadata ?? {},
      };
    });

    for (const track of normalizedTracks) {
      await pool.query(
        `INSERT INTO game_rounds (session_id, round_index, audio_source_id, correct_title, correct_artist)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (session_id, round_index) DO NOTHING`,
        [session.id, track.round, track.audioSourceId, track.title, track.artist]
      );
    }

    ok(res, {
      session: {
        id: session.id,
        mode: session.mode,
        difficulty: session.difficulty,
        provider: session.source_provider,
        totalRounds: session.total_rounds,
        startedAt: session.started_at,
      },
      tracks: normalizedTracks,
    });
  },

  async history(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { rows } = await pool.query(
      `SELECT id, mode, difficulty, source_provider, total_rounds, started_at, ended_at, state
       FROM game_sessions
       WHERE host_user_id=$1
       ORDER BY started_at DESC
       LIMIT 50`,
      [context.user.id]
    );

    ok(res, { sessions: rows });
  },

  async detailedStats(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { rows } = await pool.query(
      `SELECT
         total_games,
         total_correct,
         total_guesses,
         total_reaction_ms,
         best_streak,
         total_xp,
         last_played_at
       FROM user_stats
       WHERE user_id=$1
       LIMIT 1`,
      [context.user.id]
    );

    const stats = rows[0];
    ok(res, {
      stats: {
        totalGames: stats?.total_games ?? 0,
        accuracyRate:
          stats && stats.total_guesses > 0
            ? Number(((stats.total_correct / stats.total_guesses) * 100).toFixed(2))
            : 0,
        averageReactionTime:
          stats && stats.total_guesses > 0
            ? Math.round(stats.total_reaction_ms / stats.total_guesses)
            : 0,
        bestStreak: stats?.best_streak ?? 0,
        totalXp: stats?.total_xp ?? 0,
        lastPlayedAt: stats?.last_played_at ?? null,
      },
    });
  },
};
