import type { Request, Response } from "express";
import type { MusicProvider } from "../types/user";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import type { AudioSourceRow } from "../types/audio";
import { syncSpotifyLibrary } from "../services/providers/spotifySync";
import axios from "axios";
import previewFinder from "spotify-preview-finder";

async function fetchAudioSources(
  userId: number,
  provider: MusicProvider,
  count: number,
  opts: { likedOnly?: boolean } = {}
): Promise<AudioSourceRow[]> {
  if (opts.likedOnly) {
    const { rows } = await pool.query<AudioSourceRow>(
      `SELECT s.id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata
       FROM audio_sources s
       INNER JOIN likes l ON l.audio_source_id = s.id
       WHERE l.user_id = $1 AND s.provider = $2
       ORDER BY RANDOM()
       LIMIT $3`,
      [userId, provider, count]
    );
    return rows;
  }

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

async function hydratePreviewUrl(
  source: AudioSourceRow,
  opts: { accessToken?: string; allowScrape?: boolean } = {}
): Promise<string | null> {
  if (source.provider !== "spotify") return source.audio_url ?? null;
  const title = source.title?.trim();
  const artist = source.artist?.trim();
  if (!title) return null;

  try {
    const searchUrl = "https://api.spotify.com/v1/search";
    const queries = [
      [`track:${title}`, artist ? `artist:${artist}` : ""].filter(Boolean).join(" "),
      title,
    ];

    let preview: string | null = null;
    // First: official search if we have a token
    if (opts.accessToken) {
      for (const q of queries) {
        if (preview) break;
        if (!q) continue;
        const { data } = await axios.get(searchUrl, {
          params: { q, type: "track", limit: 1, market: "from_token" },
          headers: { Authorization: `Bearer ${opts.accessToken}` },
        });
        preview = data?.tracks?.items?.[0]?.preview_url ?? null;
      }
    }

    // Second: fallback using spotify-preview-finder (scrapes preview URLs)
    if (!preview && opts.allowScrape) {
      try {
        const finderResult = await previewFinder(title, artist ?? undefined, 1);
        if (finderResult?.success && finderResult.results?.length) {
          const candidate = finderResult.results[0];
          const scraped = candidate.previewUrls?.[0] ?? null;
          preview = scraped ?? null;
        }
      } catch (finderErr) {
        console.error("preview_scrape_failed", { id: source.id, err: finderErr });
      }
    }

    if (preview) {
      await pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [preview, source.id]);
      return preview;
    }
    return null;
  } catch (err) {
    console.error("preview_lookup_failed", { id: source.id, err });
    return null;
  }
}

async function collectPlayableSources(
  userId: number,
  provider: MusicProvider,
  desiredCount: number,
  opts: { likedOnly?: boolean; accessToken?: string; allowScrape?: boolean }
): Promise<AudioSourceRow[]> {
  // Fetch a larger candidate pool to filter out tracks without preview
  const candidateLimit = Math.min(desiredCount * 5, 200);
  let candidates = await fetchAudioSources(userId, provider, candidateLimit, { likedOnly: opts.likedOnly });

  if (provider === "spotify" && opts.accessToken) {
    await Promise.all(
      candidates.map(async source => {
        if (!source.audio_url) {
          const preview = await hydratePreviewUrl(source, {
            accessToken: opts.accessToken!,
            allowScrape: opts.allowScrape !== false,
          });
          if (preview) {
            source.audio_url = preview;
            console.log("preview_found", { sourceId: source.id, title: source.title });
          } else {
            console.log("no_preview_found", { sourceId: source.id, title: source.title });
          }
        }
      })
    );
  } else if (provider === "spotify" && opts.allowScrape !== false) {
    // Even without a token, try scrape fallback
    await Promise.all(
      candidates.map(async source => {
        if (!source.audio_url) {
          const preview = await hydratePreviewUrl(source, { allowScrape: true });
          if (preview) {
            source.audio_url = preview;
            console.log("preview_found_scrape_only", { sourceId: source.id, title: source.title });
          } else {
            console.log("no_preview_found_scrape_only", { sourceId: source.id, title: source.title });
          }
        }
      })
    );
  }

  return candidates.filter(source => Boolean(source.audio_url)).slice(0, desiredCount);
}

export const gamesController = {
  async startSoloGame(req: Request, res: Response): Promise<void> {
    const preferredProvider = (req.body?.provider as MusicProvider | undefined) ?? undefined;
    const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "normal";
    const count = Number.isFinite(Number(req.body?.count)) ? Math.min(Math.max(Number(req.body.count), 5), 25) : 10;
    const likedOnly = req.body?.source === "liked";

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

    // Pull a larger candidate set so we can filter out tracks without preview_url
    let sources = await collectPlayableSources(context.user.id, provider, count, {
      likedOnly,
      accessToken: context.connection?.access_token ?? undefined,
    });

    // Try to resync library if we are short on tracks
    if (sources.length < count && provider === "spotify" && context.connection) {
      const { connection } = await syncSpotifyLibrary(
        context.user.id,
        context.connection,
        count
      );
      if (connection) {
        context.connection = connection;
      }
      sources = await collectPlayableSources(context.user.id, provider, count, {
        likedOnly,
        accessToken: connection?.access_token ?? undefined,
      });
    }

    // If liked-only is too small, backfill with full library to avoid hard failure
    if (likedOnly && sources.length < count) {
      const remaining = count - sources.length;
      const fallback = await collectPlayableSources(context.user.id, provider, remaining, {
        likedOnly: false,
        accessToken: context.connection?.access_token ?? undefined,
      });
      sources = [...sources, ...fallback];
    }

    const totalRounds = sources.length;

    if (totalRounds < 5) {
      fail(res, "insufficient_tracks", "Pas assez de titres avec extrait audio pour lancer la partie", 400, {
        needed: count,
        available: totalRounds,
      });
      return;
    }

    const { rows: sessions } = await pool.query(
      `INSERT INTO game_sessions (host_user_id, mode, difficulty, source_provider, total_rounds, state)
       VALUES ($1,'solo',$2,$3,$4,'in_progress')
       RETURNING id, mode, difficulty, source_provider, total_rounds, started_at`,
      [context.user.id, difficulty, provider, totalRounds]
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
