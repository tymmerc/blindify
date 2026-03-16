import type { Request, Response } from "express";
import type { MusicProvider } from "../types/user";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import type { AudioSourceRow } from "../types/audio";
import axios from "axios";
import { hydratePreviewUrl } from "../services/trackResolution";

async function importItunesTopTracks(limit: number): Promise<AudioSourceRow[]> {
  try {
    const capped = Math.max(5, Math.min(limit, 50));
    const { data } = await axios.get(`https://itunes.apple.com/us/rss/topsongs/limit=${capped}/json`, {
      timeout: 8000,
    });
    const entries: any[] = data?.feed?.entry ?? [];
    const results: AudioSourceRow[] = [];

    for (const entry of entries.slice(0, capped)) {
      const externalId =
        entry?.id?.attributes?.["im:id"] ??
        entry?.id?.label ??
        entry?.id ??
        null;
      const title = entry?.["im:name"]?.label ?? entry?.title?.label ?? null;
      const artist = entry?.["im:artist"]?.label ?? entry?.artist?.label ?? "Artiste inconnu";
      const cover =
        Array.isArray(entry?.["im:image"]) && entry["im:image"].length
          ? entry["im:image"][entry["im:image"].length - 1]?.label ?? null
          : null;
      const previewUrl =
        Array.isArray(entry?.link)
          ? entry.link.find((link: any) => link?.rel === "enclosure")?.attributes?.href ?? null
          : entry?.link?.attributes?.href ?? null;

      if (!title || !previewUrl) continue;

      const metadata = { source: "itunes_top", feed: "us", fetched_at: new Date().toISOString() };
      const { rows } = await pool.query<AudioSourceRow>(
        `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, audio_url, duration_ms, metadata)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (provider, external_id)
         DO UPDATE SET
           title=EXCLUDED.title,
           artist=EXCLUDED.artist,
           album_cover=EXCLUDED.album_cover,
           audio_url=EXCLUDED.audio_url,
           metadata=EXCLUDED.metadata
         RETURNING id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata`,
        ["apple", externalId, title, artist, cover, previewUrl, null, metadata]
      );
      if (rows[0]) results.push(rows[0]);
    }

    return results;
  } catch (err) {
    console.error("itunes_top_import_failed", err);
    return [];
  }
}

async function ensureUsedTracksTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS used_tracks (
      id SERIAL PRIMARY KEY,
      audio_source_id UUID NOT NULL REFERENCES audio_sources(id) ON DELETE CASCADE,
      used_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (audio_source_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_used_tracks_used_at ON used_tracks (used_at)`);
  await pool.query(`DELETE FROM used_tracks WHERE used_at < NOW() - INTERVAL '12 hours'`);
}

async function markTracksAsUsed(audioSourceIds: (string | undefined | null)[]): Promise<void> {
  const ids = audioSourceIds.filter((id): id is string => Boolean(id));
  if (!ids.length) return;
  await ensureUsedTracksTable();
  const values = ids.map((_, idx) => `($${idx + 1}, NOW())`).join(",");
  await pool.query(
    `INSERT INTO used_tracks (audio_source_id, used_at)
     VALUES ${values}
     ON CONFLICT (audio_source_id) DO UPDATE SET used_at = EXCLUDED.used_at`,
    ids
  );
  await pool.query(`DELETE FROM used_tracks WHERE used_at < NOW() - INTERVAL '12 hours'`);
}

async function fetchGlobalRandomSources(count: number): Promise<AudioSourceRow[]> {
  if (count <= 0) return [];
  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT s.id,
            s.user_id AS user_id,
            s.provider,
            s.external_id,
            s.title,
            s.artist,
            s.album_cover,
            s.audio_url,
            s.duration_ms,
            s.metadata
     FROM audio_sources s
     ORDER BY RANDOM()
     LIMIT $1`,
    [Math.max(1, count * 2)]
  );
  return rows;
}

async function fetchAudioSources(
  userId: number,
  provider: MusicProvider,
  count: number,
  opts: {
    likedOnly?: boolean;
    playlistId?: string;
    timeRange?: string;
    excludeIds?: string[];
    excludeExternalIds?: string[];
  } = {}
): Promise<AudioSourceRow[]> {
  await ensureUsedTracksTable();

  const extraConds: string[] = [];
  const extraParams: unknown[] = [];
  // For liked query, base params are (userId, provider); for general: (provider, userId)
  const baseOffset = opts.likedOnly ? 2 : 2;
  const usedFilter = `NOT EXISTS (
    SELECT 1 FROM used_tracks ut
    WHERE ut.audio_source_id = s.id
      AND ut.used_at >= NOW() - INTERVAL '12 hours'
  )`;

  if (opts.playlistId) {
    extraParams.push(opts.playlistId);
    extraConds.push(`metadata->>'playlist_id' = $${baseOffset + extraParams.length}`);
  }
  if (opts.timeRange) {
    extraParams.push(opts.timeRange);
    extraConds.push(`metadata->>'time_range' = $${baseOffset + extraParams.length}`);
  }
  if (opts.excludeIds?.length) {
    extraParams.push(opts.excludeIds);
    extraConds.push(`s.id <> ALL($${baseOffset + extraParams.length}::uuid[])`);
  }
  if (opts.excludeExternalIds?.length) {
    extraParams.push(opts.excludeExternalIds);
    extraConds.push(`(s.external_id IS NULL OR s.external_id <> ALL($${baseOffset + extraParams.length}::text[]))`);
  }

  const extraClause = extraConds.length ? `AND ${extraConds.join(" AND ")}` : "";

  // Liked-only branch
  if (opts.likedOnly) {
    const params = [userId, provider, ...extraParams, count];
    const limitIndex = params.length;
    const { rows } = await pool.query<AudioSourceRow>(
      `SELECT s.id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata
       FROM audio_sources s
       INNER JOIN likes l ON l.audio_source_id = s.id
       WHERE l.user_id = $1 AND (s.provider = $2 OR s.user_id = $1) ${extraClause ? extraClause + " AND " : " AND "}${usedFilter}
       ORDER BY RANDOM()
       LIMIT $${limitIndex}`,
      params
    );
    return rows;
  }

  // General library/playlist/top query
  const params = [provider, userId, ...extraParams, count];
  const limitIndex = params.length;
  const { rows } = await pool.query<AudioSourceRow>(
    `SELECT s.id, s.provider, s.external_id, s.title, s.artist, s.album_cover, s.audio_url, s.duration_ms, s.metadata
     FROM audio_sources s
     WHERE (s.user_id=$2 OR (s.provider=$1 AND s.user_id IS NULL)) ${extraClause ? extraClause + " AND " : " AND "}${usedFilter}
     ORDER BY RANDOM()
     LIMIT $${limitIndex}`,
    params
  );
  return rows;
}

// hydratePreviewUrl is imported from ../services/trackResolution (uses Deezer)

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function recentAudioSourceIds(userId: number, limit = 80): Promise<string[]> {
  const { rows } = await pool.query<{ audio_source_id: string | null }>(
    `SELECT gr.audio_source_id::text AS audio_source_id
     FROM game_rounds gr
     JOIN game_sessions gs ON gs.id = gr.session_id
     WHERE gs.host_user_id = $1
       AND gs.mode = 'solo'
      AND gr.audio_source_id IS NOT NULL
     ORDER BY gs.started_at DESC, gr.round_index DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows
    .map(row => row.audio_source_id)
    .filter((id): id is string => Boolean(id));
}

async function recentFirstAudioSourceIds(userId: number, limit = 30): Promise<string[]> {
  const { rows } = await pool.query<{ audio_source_id: string | null }>(
    `SELECT gr.audio_source_id::text AS audio_source_id
     FROM game_rounds gr
     JOIN game_sessions gs ON gs.id = gr.session_id
     WHERE gs.host_user_id = $1
       AND gs.mode = 'solo'
       AND gr.round_index = 1
       AND gr.audio_source_id IS NOT NULL
     ORDER BY gs.started_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows
    .map(row => row.audio_source_id)
    .filter((id): id is string => Boolean(id));
}

async function recentFirstExternalIds(userId: number, limit = 30): Promise<string[]> {
  const { rows } = await pool.query<{ external_id: string | null }>(
    `SELECT s.external_id
     FROM game_rounds gr
     JOIN game_sessions gs ON gs.id = gr.session_id
     JOIN audio_sources s ON s.id = gr.audio_source_id
     WHERE gs.host_user_id = $1
       AND gs.mode = 'solo'
       AND gr.round_index = 1
       AND s.external_id IS NOT NULL
     ORDER BY gs.started_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows
    .map(row => row.external_id)
    .filter((id): id is string => Boolean(id));
}

function prioritizeFreshFirstTrack(
  sources: AudioSourceRow[],
  avoidIds: string[],
  avoidExternalIds: string[]
): AudioSourceRow[] {
  if ((!avoidIds.length && !avoidExternalIds.length) || sources.length === 0) return sources;
  const freshIndex = sources.findIndex(src => {
    const id = String(src.id);
    const externalId = src.external_id ?? null;
    const avoidIdMatch = avoidIds.includes(id);
    const avoidExtMatch = externalId ? avoidExternalIds.includes(externalId) : false;
    return !(avoidIdMatch || avoidExtMatch);
  });
  if (freshIndex > 0) {
    const copy = [...sources];
    [copy[0], copy[freshIndex]] = [copy[freshIndex], copy[0]];
    return copy;
  }
  return sources;
}

async function persistSoloResult(userId: number, correct: number, rounds: number, bestStreak: number, xpDelta = 0) {
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
    [userId, correct, rounds, xpDelta, bestStreak]
  );
}

async function collectPlayableSources(
  userId: number,
  provider: MusicProvider,
  desiredCount: number,
  opts: {
    likedOnly?: boolean;
    playlistId?: string;
    timeRange?: string;
    excludeIds?: string[];
    excludeExternalIds?: string[];
  }
): Promise<AudioSourceRow[]> {
  const candidateLimit = Math.min(desiredCount * 8, 400);
  const candidates = await fetchAudioSources(userId, provider, candidateLimit, {
    likedOnly: opts.likedOnly,
    playlistId: opts.playlistId,
    timeRange: opts.timeRange,
    excludeIds: opts.excludeIds,
    excludeExternalIds: opts.excludeExternalIds,
  });

  // Split: already-playable vs needs-hydration
  const ready: AudioSourceRow[] = [];
  const needsHydration: AudioSourceRow[] = [];
  for (const source of candidates) {
    if (source.audio_url) ready.push(source);
    else needsHydration.push(source);
  }

  // Shuffle both pools so we pick randomly
  shuffle(ready);
  shuffle(needsHydration);

  // Collect unique playable tracks, hydrating only as many as needed
  const unique = new Map<string, AudioSourceRow>();
  for (const source of ready) {
    const key = source.external_id ?? String(source.id);
    if (!unique.has(key)) unique.set(key, source);
    if (unique.size >= desiredCount) break;
  }

  // Only hydrate if we still need more
  for (const source of needsHydration) {
    if (unique.size >= desiredCount) break;
    const preview = await hydratePreviewUrl(source);
    if (preview) {
      source.audio_url = preview;
      const key = source.external_id ?? String(source.id);
      if (!unique.has(key)) unique.set(key, source);
    }
  }

  return shuffle(Array.from(unique.values()));
}

async function syncPlaylistTracks(userId: number, playlistId: string, accessToken: string): Promise<void> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  let nextUrl: string | null = `${url}?limit=100`;
  while (nextUrl) {
    const response = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = response.data as {
      items?: Array<{
        track?: {
          id?: string;
          name?: string;
          artists?: { name?: string }[];
          album?: { images?: { url?: string }[]; name?: string; release_date?: string };
          duration_ms?: number;
        } | null;
      }>;
      next?: string | null;
    };
    const items = data.items ?? [];
    for (const item of items) {
      const track = item.track;
      if (!track?.id || !track?.name) continue;
      const artist = track.artists?.map(a => a?.name).filter(Boolean).join(", ") || "Artiste inconnu";
      const cover = track.album?.images?.[0]?.url ?? null;
      const metadata = {
        album: track.album?.name ?? null,
        release_date: track.album?.release_date ?? null,
        playlist_id: playlistId,
        provider: "spotify" as MusicProvider,
      };
      await pool.query<AudioSourceRow>(
        `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, duration_ms, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (provider, external_id)
         DO UPDATE SET
           title=EXCLUDED.title,
           artist=EXCLUDED.artist,
           album_cover=EXCLUDED.album_cover,
           duration_ms=EXCLUDED.duration_ms,
           metadata=EXCLUDED.metadata,
           user_id=EXCLUDED.user_id`,
        ["spotify", track.id, userId, track.name, artist, cover, track.duration_ms ?? null, metadata]
      );
    }
    nextUrl = data.next ?? null;
  }
}

async function syncTopTracks(
  userId: number,
  timeRange: "short_term" | "medium_term" | "long_term",
  accessToken: string
): Promise<void> {
  const url = `https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=${timeRange}`;
  const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const items: Array<{
    id?: string;
    name?: string;
    artists?: { name?: string }[];
    album?: { images?: { url?: string }[]; name?: string; release_date?: string };
    duration_ms?: number;
  }> = data?.items ?? [];

  for (const track of items) {
    if (!track?.id || !track?.name) continue;
    const artist = track.artists?.map(a => a?.name).filter(Boolean).join(", ") || "Artiste inconnu";
    const cover = track.album?.images?.[0]?.url ?? null;
    const metadata = {
      album: track.album?.name ?? null,
      release_date: track.album?.release_date ?? null,
      time_range: timeRange,
      provider: "spotify" as MusicProvider,
    };
    await pool.query<AudioSourceRow>(
      `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, duration_ms, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (provider, external_id)
       DO UPDATE SET
         title=EXCLUDED.title,
         artist=EXCLUDED.artist,
         album_cover=EXCLUDED.album_cover,
         duration_ms=EXCLUDED.duration_ms,
         metadata=EXCLUDED.metadata,
         user_id=EXCLUDED.user_id`,
      ["spotify", track.id, userId, track.name, artist, cover, track.duration_ms ?? null, metadata]
    );
  }
}

export const gamesController = {
  async startSoloGame(req: Request, res: Response): Promise<void> {
    const sourceParam = typeof req.body?.source === "string" ? req.body.source : "library";
    const preferredProvider = (req.body?.provider as MusicProvider | undefined) ?? undefined;
    const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "normal";
    const count = Number.isFinite(Number(req.body?.count)) ? Math.min(Math.max(Number(req.body.count), 5), 25) : 10;
    let likedOnly = sourceParam === "liked";
    let playlistId = typeof req.body?.playlistId === "string" ? req.body.playlistId.trim() : null;
    let topRange: "short_term" | "medium_term" | "long_term" | null =
      sourceParam === "top_week"
        ? "short_term"
        : sourceParam === "top_month"
          ? "medium_term"
          : sourceParam === "top_all"
            ? "long_term"
            : null;

    const context = await getSessionContext(req, res, {
      provider: preferredProvider,
      requireConnection: Boolean(preferredProvider && preferredProvider !== "guest"),
    });
    if (!context) return;

    let provider: MusicProvider =
      preferredProvider ?? context.connection?.provider ?? context.user.provider ?? "guest";

    // Si aucune connexion et provider non invité, on bascule en invité avec catalogue global.
    if (provider !== "guest" && !context.connection) {
      provider = "guest";
      likedOnly = false;
      playlistId = null;
      topRange = null;
    }

    // Pull a larger candidate set so we can filter out tracks without preview_url
    // If a playlist is requested, ensure Spotify connection (otherwise fallback to guest pool)
    if ((playlistId || topRange) && provider !== "spotify") {
      playlistId = null;
      topRange = null;
      likedOnly = false;
    }
    if (topRange && !context.connection?.access_token) {
      topRange = null;
    }

    // Load playlist tracks if requested
    if (playlistId && provider === "spotify" && context.connection?.access_token) {
      try {
        await syncPlaylistTracks(context.user.id, playlistId, context.connection.access_token);
      } catch (err) {
        console.error("sync_playlist_failed", { playlistId, err });
        // continue with fallback below
      }
    }

    if (topRange && provider === "spotify" && context.connection?.access_token) {
      try {
        await syncTopTracks(context.user.id, topRange, context.connection.access_token);
      } catch (err) {
        console.error("sync_top_tracks_failed", { timeRange: topRange, err });
      }
    }

    const isQuickGame = count === 10;
    const recentIds = isQuickGame ? await recentAudioSourceIds(context.user.id, 120) : [];
    const recentFirstIds = isQuickGame ? await recentFirstAudioSourceIds(context.user.id, 40) : [];
    const recentFirstExternalList = isQuickGame ? await recentFirstExternalIds(context.user.id, 40) : [];

    let sources = await collectPlayableSources(context.user.id, provider, count, {
      likedOnly,
      playlistId: playlistId ?? undefined,
      timeRange: topRange ?? undefined,
      excludeIds: isQuickGame ? recentIds : undefined,
      excludeExternalIds: isQuickGame ? recentFirstExternalList : undefined,
    });

    // If liked-only or playlist is too small, backfill with full library to avoid hard failure
    if ((likedOnly || playlistId) && sources.length < count) {
      const remaining = count - sources.length;
      const fallback = await collectPlayableSources(context.user.id, provider, remaining, {
        likedOnly: false,
        playlistId: undefined,
        timeRange: topRange ?? undefined,
          excludeIds: isQuickGame ? recentIds : undefined,
        excludeExternalIds: isQuickGame ? recentFirstExternalList : undefined,
      });
      sources = [...sources, ...fallback];
    }

    if (isQuickGame) {
      sources = prioritizeFreshFirstTrack(sources, recentFirstIds, recentFirstExternalList);
    }

    if (isQuickGame && sources.length < count) {
      const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
      const topUp = await collectPlayableSources(context.user.id, provider, count, {
        likedOnly,
        playlistId: playlistId ?? undefined,
        timeRange: topRange ?? undefined,
          excludeIds: undefined,
        excludeExternalIds: undefined,
      });
      for (const candidate of topUp) {
        const key = candidate.external_id ?? String(candidate.id);
        if (existingKeys.has(key)) continue;
        sources.push(candidate);
        existingKeys.add(key);
        if (sources.length >= count) break;
      }
    }

    if (isQuickGame) {
      sources = prioritizeFreshFirstTrack(sources, recentFirstIds, recentFirstExternalList);
    }

    if (sources.length < count) {
      const remaining = count - sources.length;
      const globalPool = await fetchGlobalRandomSources(remaining * 2);
      const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
      for (const candidate of globalPool) {
        const key = candidate.external_id ?? String(candidate.id);
        if (!candidate.audio_url || existingKeys.has(key)) continue;
        sources.push(candidate);
        existingKeys.add(key);
        if (sources.length >= count) break;
      }
    }

    // Fallback invité : puiser dans le top iTunes si on manque encore de pistes jouables
    if (provider === "guest" && sources.length < count) {
      const remaining = count - sources.length;
      const topTracks = await importItunesTopTracks(Math.max(10, remaining * 2));
      const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
      for (const track of topTracks) {
        const key = track.external_id ?? String(track.id);
        if (!track.audio_url || existingKeys.has(key)) continue;
        sources.push(track);
        existingKeys.add(key);
        if (sources.length >= count) break;
      }
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

    await markTracksAsUsed(normalizedTracks.map(t => t.audioSourceId));

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

  async recordSoloResult(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { sessionId, rounds, correct, bestStreak } = req.body ?? {};
    const sessionIdNum = Number(sessionId);
    const roundsNum = Number(rounds);
    const correctNum = Number(correct);
    const bestStreakNum = Number(bestStreak);

    if (!Number.isFinite(sessionIdNum)) {
      fail(res, "invalid_session", "Session manquante ou invalide", 400);
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, host_user_id, mode, total_rounds, state
       FROM game_sessions
       WHERE id=$1
       LIMIT 1`,
      [sessionIdNum]
    );
    const session = rows[0];
    if (!session || session.host_user_id !== context.user.id || session.mode !== "solo") {
      fail(res, "session_not_found", "Session inconnue", 404);
      return;
    }

    const totalRounds = Number.isFinite(roundsNum)
      ? Math.min(Math.max(roundsNum, 0), session.total_rounds ?? roundsNum)
      : session.total_rounds ?? 0;
    const safeCorrect = Number.isFinite(correctNum) ? Math.min(Math.max(correctNum, 0), totalRounds) : 0;
    const safeBestStreak = Number.isFinite(bestStreakNum) ? Math.max(bestStreakNum, 0) : 0;
    const xpDelta = Math.max(5, safeCorrect * 5 + safeBestStreak * 2);

    const result = await pool.query(
      `UPDATE game_sessions
       SET state='finished', ended_at=COALESCE(ended_at, NOW())
       WHERE id=$1 AND host_user_id=$2 AND mode='solo' AND state <> 'finished'`,
      [sessionIdNum, context.user.id]
    );
    const updated = result.rowCount ?? 0;

    if (updated > 0) {
      await persistSoloResult(context.user.id, safeCorrect, totalRounds, safeBestStreak, xpDelta);
    }

    ok(res, {
      status: "recorded",
      alreadyFinished: updated === 0,
      totals: { rounds: totalRounds, correct: safeCorrect, bestStreak: safeBestStreak, xpDelta },
    });
  },
};
