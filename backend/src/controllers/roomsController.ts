import type { Request, Response } from "express";
import axios from "axios";
import { pool } from "../config/db";
import { io } from "../socket";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";
import type { MusicProvider } from "../types/user";
import type { AudioSourceRow } from "../types/audio";
import { bootstrapGameState, getGameState, clearGame } from "../services/realtimeGame";
import { startRoundAndBroadcast } from "../services/realtimeOrchestrator";
import { GameMode, type RoundTrack } from "../types/game";
import { initStreamerGame } from "../services/streamerOrchestrator";
import {
  hydratePreviewUrl,
  collectPlayableSources,
  shuffle,
  type ProviderFilter,
} from "../services/trackResolution";

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

type SourceChoice = "library" | "liked" | "playlist" | "top_week" | "top_month" | "top_all";

async function ensureRoomParticipantPrefs(): Promise<void> {
  await pool.query(`ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS source_pref TEXT`);
  await pool.query(`ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS playlist_pref TEXT`);
}

async function ensureRoomFlags(): Promise<void> {
  await pool.query(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'friends'`);
  // Mode event : l'hote choisit de jouer (host_plays=true) ou de presenter seulement.
  await pool.query(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS host_plays BOOLEAN DEFAULT FALSE`);
  // Config de partie reglable par l'hote depuis le lobby (NULL = defaut du mode).
  await pool.query(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS round_duration_ms INTEGER`);
}

const EVENT_ROUND_DURATION_MS = 15_000;
// Decompte 3-2-1 avant la toute premiere manche (audio + chrono demarrent apres).
const FIRST_ROUND_PREROLL_MS = 3_000;

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

export const roomsController = {
  async createRoom(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureRoomFlags();

    const { user } = context;
    const name = typeof req.body?.name === "string" ? req.body.name : null;
    const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "normal";
    const modeInput = typeof req.body?.mode === "string" ? req.body.mode.toLowerCase() : null;
    const mode: GameMode =
      modeInput === GameMode.EVENT ? GameMode.EVENT : modeInput === GameMode.STREAMER ? GameMode.STREAMER : GameMode.FRIENDS;
    const autoAdvance = Boolean(req.body?.autoAdvance);
    const maxPlayers = Number.isFinite(Number(req.body?.maxPlayers))
      ? Math.min(Math.max(Number(req.body.maxPlayers), 2), 16)
      : 12;
    const questionCount = Number.isFinite(Number(req.body?.questionCount))
      ? Math.min(Math.max(Number(req.body.questionCount), 5), 25)
      : 10;

    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim().slice(0, 30) || null : null;
    // Event uniquement : l'hote joue-t-il (true) ou presente-t-il seulement (false) ?
    const hostPlays = mode === GameMode.EVENT ? Boolean(req.body?.hostPlays) : false;

    const code = generateRoomCode();
    const { rows } = await pool.query(
      `INSERT INTO multiplayer_rooms (room_code, host_user_id, name, status, max_players, question_count, difficulty, mode, host_plays)
       VALUES ($1,$2,$3,'waiting',$4,$5,$6,$7,$8)
      RETURNING id, room_code, host_user_id, name, status, max_players, question_count, difficulty, mode, host_plays`,
      [code, user.id, name, maxPlayers, questionCount, difficulty, mode, hostPlays]
    );

    const room = rows[0];

    await pool.query(`UPDATE multiplayer_rooms SET auto_advance=$1 WHERE id=$2`, [autoAdvance, room.id]);
    room.auto_advance = autoAdvance;

    // Update user.username if nickname provided and user is a guest
    if (nickname && user.provider === "guest") {
      await pool.query(`UPDATE users SET username=$1 WHERE id=$2`, [nickname, user.id]);
    }

    await pool.query(
      `INSERT INTO room_participants (room_id, user_id, is_ready, nickname)
       VALUES ($1,$2,TRUE,$3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET nickname=EXCLUDED.nickname`,
      [room.id, user.id, nickname]
    );

    ok(res, { room });
  },

  async joinRoom(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const { user } = context;
    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";

    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, room_code, max_players, status FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = rows[0];

    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    // Partie en cours : on laisse revenir ceux qui en font DEJA partie (rechargement
    // de page, tunnel, appli fermee...). Avant, un simple F5 ejectait le joueur pour
    // toute la soiree. Les nouveaux venus, eux, attendent la prochaine partie.
    if (room.status !== "waiting") {
      const context = await getSessionContext(req, res, { requireConnection: false });
      if (!context) return;
      const { rows: already } = await pool.query(
        `SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`,
        [room.id, context.user.id]
      );
      if (!already.length) {
        // La room reste "in_progress" en base entre deux parties (elle ne repasse
        // a "waiting" qu'au rejouer). Sans ce test, un retardataire ne pouvait
        // JAMAIS rejoindre une soiree, meme pendant l'ecran des resultats.
        const live = getGameState(room.room_code);
        const betweenGames = !live || live.phase === "FINISHED";
        if (!betweenGames) {
          fail(res, "room_in_progress", "La partie est en cours. Tu pourras rejoindre la prochaine.", 409);
          return;
        }
        // Manche finie : accueil normal (flux de join classique plus bas),
        // il sera dans la prochaine partie.
      } else {
        const { rows: fullRoom } = await pool.query(
          `SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty,
                  session_id, auto_advance, mode, host_plays, round_duration_ms
           FROM multiplayer_rooms WHERE id=$1 LIMIT 1`,
          [room.id]
        );
        ok(res, { room: fullRoom[0], rejoined: true });
        return;
      }
    }

    const participants = await pool.query(
      `SELECT COUNT(*)::INT AS total FROM room_participants WHERE room_id=$1`,
      [room.id]
    );
    if (participants.rows[0]?.total >= room.max_players) {
      fail(res, "room_full", "La salle est pleine", 409);
      return;
    }

    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim().slice(0, 30) || null : null;

    // Update user.username if nickname provided and user is a guest
    if (nickname && user.provider === "guest") {
      await pool.query(`UPDATE users SET username=$1 WHERE id=$2`, [nickname, user.id]);
    }

    await pool.query(
      `INSERT INTO room_participants (room_id, user_id, nickname)
       VALUES ($1,$2,$3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET nickname=EXCLUDED.nickname`,
      [room.id, user.id, nickname]
    );

    const displayName = nickname || user.username;
    io.to(room.room_code).emit("player-joined", {
      userId: user.id,
      username: displayName,
      roomCode: room.room_code,
    });

    ok(res, { room });
  },

  async details(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureRoomParticipantPrefs();

    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const { rows: roomRows } = await pool.query(
      `SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty, session_id, auto_advance, mode, host_plays, round_duration_ms
       FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = roomRows[0];
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    const { rows: participantRows } = await pool.query(
      `SELECT rp.user_id, COALESCE(rp.nickname, u.username) AS username
       FROM room_participants rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.room_id=$1
       ORDER BY rp.joined_at ASC`,
      [room.id]
    );

    const { rows: prefRows } = await pool.query<{ source_pref: string | null; playlist_pref: string | null }>(
      `SELECT source_pref, playlist_pref FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`,
      [room.id, context.user.id]
    );

    ok(res, { room, participants: participantRows, selfPreference: prefRows[0] ?? null });
  },

  async preferences(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    await ensureRoomParticipantPrefs();

    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const source = typeof req.body?.source === "string" ? req.body.source : null;
    const playlistId = typeof req.body?.playlistId === "string" ? req.body.playlistId.trim() : null;

    const allowedSources = new Set(["library", "liked", "playlist", "top_week", "top_month", "top_all"]);
    if (!source || !allowedSources.has(source)) {
      fail(res, "invalid_source", "Source invalide", 400);
      return;
    }

    const { rows: roomRows } = await pool.query(
      `SELECT id FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = roomRows[0];
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    const membership = await pool.query(`SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2`, [room.id, context.user.id]);
    if (!membership.rows.length) {
      fail(res, "room_forbidden", "Tu n'es pas dans cette salle", 403);
      return;
    }

    await pool.query(
      `UPDATE room_participants
       SET source_pref=$3, playlist_pref=$4
       WHERE room_id=$1 AND user_id=$2`,
      [room.id, context.user.id, source, playlistId]
    );

    ok(res, { source, playlistId });
  },

  async state(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;

    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const { rows: roomRows } = await pool.query(
      `SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty, session_id, auto_advance, mode, host_plays, round_duration_ms
       FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = roomRows[0];
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    const participant = await pool.query(
      `SELECT 1 FROM room_participants WHERE room_id=$1 AND user_id=$2 LIMIT 1`,
      [room.id, context.user.id]
    );
    if (!participant.rows.length) {
      fail(res, "room_forbidden", "Tu n'es pas dans cette salle", 403);
      return;
    }

    if (room.status !== "in_progress" || !room.session_id) {
      ok(res, { room, session: null, tracks: [] });
      return;
    }

    const { rows: sessions } = await pool.query(
      `SELECT id, mode, difficulty, source_provider, total_rounds, started_at
       FROM game_sessions WHERE id=$1 LIMIT 1`,
      [room.session_id]
    );
    const session = sessions[0];
    if (!session) {
      ok(res, { room, session: null, tracks: [] });
      return;
    }

    const { rows: trackRowsRaw } = await pool.query(
      `SELECT gr.round_index AS round,
              s.id AS "audioSourceId",
              s.provider AS type,
              COALESCE(s.external_id, s.id::text) AS track_id,
              s.title,
              s.artist,
              s.album_cover,
              s.audio_url,
              s.metadata,
              s.user_id AS owner_user_id,
              u.username AS owner_username
       FROM game_rounds gr
       LEFT JOIN audio_sources s ON s.id = gr.audio_source_id
       LEFT JOIN users u ON u.id = s.user_id
       WHERE gr.session_id=$1
       ORDER BY gr.round_index ASC`,
      [session.id]
    );
    // Re-injecte l'attribution "qui a ajoute" dans le metadata (perdue sinon : owner_* n'est
    // calcule qu'au lancement en memoire, jamais persiste dans audio_sources.metadata).
    const trackRows = trackRowsRaw.map((row: Record<string, unknown>) => ({
      ...row,
      metadata: {
        ...((row.metadata as Record<string, unknown> | null) ?? {}),
        owner_user_id: row.owner_user_id ?? null,
        owner_username: row.owner_username ?? null,
      },
    }));

    const gameState = getGameState(room.room_code) ?? null;

    ok(res, {
      room,
      session: {
        id: session.id,
        mode: session.mode,
        difficulty: session.difficulty,
        provider: session.source_provider,
        totalRounds: session.total_rounds,
        startedAt: session.started_at,
        roomCode: room.room_code,
        currentRound: gameState?.currentRound ?? null,
        autoAdvance: room.auto_advance ?? false,
      },
      tracks: trackRows,
      gameState,
    });
  },

  /**
   * Bilan manche par manche de la derniere partie de la salle : qui a trouve quoi.
   * Sert a l'ecran de fin ("le piege de la soiree" = le titre que personne n'a eu).
   */
  async roundsSummary(req: Request, res: Response): Promise<void> {
    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }
    const context = await getSessionContext(req, res, { requireConnection: false });
    if (!context) return;

    const { rows: roomRows } = await pool.query<{ session_id: number | null }>(
      `SELECT session_id FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const sessionId = roomRows[0]?.session_id ?? null;
    if (!sessionId) {
      ok(res, { rounds: [] });
      return;
    }

    // ATTENTION : une ligne round_responses est creee meme pour un joueur qui n'a
    // rien tape (revealRound marque tout le monde "hasAnswered"). On ne compte donc
    // comme "reponse" que celles avec un texte, et comme "trouve" celles qui ont
    // rapporte au moins 1 point (is_correct exige titre ET artiste : trop strict
    // pour dire "personne ne l'a trouve").
    const { rows } = await pool.query<{
      round_index: number;
      correct_title: string | null;
      correct_artist: string | null;
      answers: string;
      correct: string;
    }>(
      `SELECT gr.round_index,
              gr.correct_title,
              gr.correct_artist,
              COUNT(rr.id) FILTER (
                WHERE COALESCE(rr.guess_title, '') <> '' OR COALESCE(rr.guess_artist, '') <> ''
              )                                                   AS answers,
              COUNT(rr.id) FILTER (WHERE COALESCE(rr.score_delta, 0) > 0) AS correct
       FROM game_rounds gr
       LEFT JOIN round_responses rr ON rr.round_id = gr.id
       WHERE gr.session_id = $1
       GROUP BY gr.round_index, gr.correct_title, gr.correct_artist
       ORDER BY gr.round_index`,
      [sessionId]
    );

    // Temps de reponse REEL par joueur : moyenne sur les manches ou il a
    // vraiment repondu (avant, on divisait le temps total, penalites de
    // non-reponse comprises, par le nombre de reponses parfaites -> 40s
    // affiches sur une manche de 20s).
    const { rows: playerRows } = await pool.query<{
      user_id: number;
      answered: string;
      avg_ms: string | null;
    }>(
      `SELECT rr.user_id,
              COUNT(*)                  AS answered,
              AVG(rr.response_time_ms)  AS avg_ms
       FROM round_responses rr
       JOIN game_rounds gr ON gr.id = rr.round_id
       WHERE gr.session_id = $1
         AND (COALESCE(rr.guess_title, '') <> '' OR COALESCE(rr.guess_artist, '') <> '')
         AND rr.response_time_ms IS NOT NULL
       GROUP BY rr.user_id`,
      [sessionId]
    );

    ok(res, {
      players: playerRows.map(p => ({
        userId: p.user_id,
        answered: Number(p.answered),
        avgMs: p.avg_ms === null ? null : Math.round(Number(p.avg_ms)),
      })),
      rounds: rows.map(r => ({
        round: r.round_index,
        title: r.correct_title,
        artist: r.correct_artist,
        answers: Number(r.answers),
        correct: Number(r.correct),
      })),
    });
  },

  // Config de partie reglable par l'hote depuis le lobby (manches + duree de round).
  async updateConfig(req: Request, res: Response): Promise<void> {
    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }
    const context = await getSessionContext(req, res, { requireConnection: false });
    if (!context) return;

    const { rows } = await pool.query(
      `SELECT id, host_user_id, status FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = rows[0];
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }
    if (room.host_user_id !== context.user.id) {
      fail(res, "room_forbidden", "Seul l'hôte peut régler la partie", 403);
      return;
    }
    if (room.status !== "waiting") {
      fail(res, "room_locked", "Impossible de régler une partie déjà lancée", 409);
      return;
    }

    const questionCountRaw = Number(req.body?.questionCount);
    const roundSecondsRaw = Number(req.body?.roundSeconds);
    const questionCount = Number.isInteger(questionCountRaw) ? Math.min(30, Math.max(3, questionCountRaw)) : null;
    const roundSeconds = Number.isInteger(roundSecondsRaw) ? Math.min(60, Math.max(5, roundSecondsRaw)) : null;
    if (questionCount === null && roundSeconds === null) {
      fail(res, "invalid_config", "Aucun réglage valide fourni", 400);
      return;
    }

    if (questionCount !== null) {
      await pool.query(`UPDATE multiplayer_rooms SET question_count=$1 WHERE id=$2`, [questionCount, room.id]);
    }
    if (roundSeconds !== null) {
      await pool.query(`UPDATE multiplayer_rooms SET round_duration_ms=$1 WHERE id=$2`, [roundSeconds * 1000, room.id]);
    }
    ok(res, { questionCount, roundSeconds });
  },

  async startGame(req: Request, res: Response): Promise<void> {
    const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }

    const sourceParam = typeof req.body?.source === "string" ? req.body.source : "library";
    const preferredProvider = req.body?.provider as MusicProvider | undefined;
    const playlistId = typeof req.body?.playlistId === "string" ? req.body.playlistId.trim() : null;
    const topRange =
      sourceParam === "top_week"
        ? "short_term"
        : sourceParam === "top_month"
          ? "medium_term"
          : sourceParam === "top_all"
            ? "long_term"
            : null;

    const { rows: roomRows } = await pool.query(
      `SELECT id, room_code, host_user_id, status, max_players, question_count, difficulty, mode, host_plays, auto_advance, session_id, round_duration_ms
       FROM multiplayer_rooms
       WHERE room_code=$1 LIMIT 1`,
      [code]
    );
    const room = roomRows[0];
    if (!room) {
      fail(res, "room_not_found", "Salle introuvable", 404);
      return;
    }

    const context = await getSessionContext(req, res, {
      provider: preferredProvider,
      // Do not force a connection for friends/event: only enforce a minimum connection later.
      requireConnection: false,
    });
    if (!context) return;

    if (room.host_user_id !== context.user.id) {
      fail(res, "room_forbidden", "Seul l'hôte peut démarrer la partie", 403);
      return;
    }

    if (room.status !== "waiting") {
      // Allow restart if the game is finished
      const existingState = getGameState(room.room_code);
      if (!existingState || existingState.phase === "FINISHED") {
        // Atomic reset: only succeeds if status hasn't changed since our read
        clearGame(room.room_code);
        const { rowCount } = await pool.query(
          `UPDATE multiplayer_rooms SET status='waiting', session_id=NULL, started_at=NULL
           WHERE id=$1 AND status=$2`,
          [room.id, room.status]
        );
        if (!rowCount) {
          fail(res, "room_conflict", "La salle a été modifiée par un autre joueur. Réessaie.", 409);
          return;
        }
        room.status = "waiting";
        room.session_id = null;
      } else {
      // If a game is already running, return its state so the client can sync instead of failing hard
      const sessionId = room.session_id ?? null;
      if (!sessionId) {
        fail(res, "room_locked", "La partie a déjà démarré", 409);
        return;
      }

      const { rows: sessions } = await pool.query(
        `SELECT id, mode, difficulty, source_provider, total_rounds, started_at
         FROM game_sessions WHERE id=$1 LIMIT 1`,
        [sessionId]
      );
      const session = sessions[0];
      if (!session) {
        fail(res, "room_locked", "La partie a déjà démarré", 409);
        return;
      }

      const { rows: trackRowsRaw } = await pool.query(
        `SELECT gr.round_index AS round,
                s.id AS "audioSourceId",
                s.provider AS type,
                COALESCE(s.external_id, s.id::text) AS track_id,
                s.title,
                s.artist,
                s.album_cover,
                s.audio_url,
                s.metadata,
                s.user_id AS owner_user_id,
                u.username AS owner_username
         FROM game_rounds gr
         LEFT JOIN audio_sources s ON s.id = gr.audio_source_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE gr.session_id=$1
         ORDER BY gr.round_index ASC`,
        [session.id]
      );
      const trackRows = trackRowsRaw.map((row: Record<string, unknown>) => ({
        ...row,
        metadata: {
          ...((row.metadata as Record<string, unknown> | null) ?? {}),
          owner_user_id: row.owner_user_id ?? null,
          owner_username: row.owner_username ?? null,
        },
      }));

      const gameState = getGameState(room.room_code) ?? null;

      ok(res, {
        session: {
          id: session.id,
          mode: session.mode,
          difficulty: session.difficulty,
          provider: session.source_provider,
          totalRounds: session.total_rounds,
          startedAt: session.started_at,
          roomCode: room.room_code,
          autoAdvance: room.auto_advance ?? false,
        },
        tracks: trackRows,
        gameState,
      });
      return;
      } // end else (game in progress)
    }

    let provider: MusicProvider =
      preferredProvider ?? context.connection?.provider ?? context.user.provider ?? "guest";
    if ((room.mode === GameMode.EVENT || room.mode === GameMode.STREAMER) && provider !== "guest" && !context.connection) {
      // Host may be guest; fall back to pooled provider
      provider = "any" as MusicProvider;
    }
    const autoAdvanceFlag =
      typeof req.body?.autoAdvance === "boolean" ? req.body.autoAdvance : room.auto_advance ?? false;

    if (room.auto_advance !== autoAdvanceFlag) {
      await pool.query(`UPDATE multiplayer_rooms SET auto_advance=$1 WHERE id=$2`, [autoAdvanceFlag, room.id]);
      room.auto_advance = autoAdvanceFlag;
    }

    // Pour mélanger les bibliothèques de tous les joueurs, on ne filtre pas sur un provider spécifique
    const poolProvider: ProviderFilter = "any";

    await ensureRoomParticipantPrefs();

    if ((playlistId || topRange) && provider !== "spotify") {
      fail(res, "playlist_provider_invalid", "Les playlists ou tops nécessitent Spotify.", 400);
      return;
    }

    if (topRange && !context.connection?.access_token) {
      fail(res, "provider_connection_missing", "Connexion Spotify requise pour ce mode", 400);
      return;
    }

    if (playlistId && provider === "spotify" && context.connection?.access_token) {
      try {
        await syncPlaylistTracks(context.user.id, playlistId, context.connection.access_token);
      } catch (err) {
        logger.error("sync_playlist_failed_multi", { playlistId, error: err });
      }
    }

    if (topRange && provider === "spotify" && context.connection?.access_token) {
      try {
        await syncTopTracks(context.user.id, topRange, context.connection.access_token);
      } catch (err) {
        logger.error("sync_top_tracks_failed_multi", { timeRange: topRange, error: err });
      }
    }

    const { rows: participantRows } = await pool.query<{ user_id: number; source_pref: string | null; playlist_pref: string | null }>(
      `SELECT user_id, source_pref, playlist_pref FROM room_participants WHERE room_id=$1`,
      [room.id]
    );
    // Joueurs qui REPONDENT : le presentateur (event sans host_plays) et l'hote streamer sont exclus.
    const participantIds = participantRows
      .map(p => p.user_id)
      .filter(id => !((((room.mode === GameMode.EVENT && !room.host_plays) || room.mode === GameMode.STREAMER)) && id === room.host_user_id));

    // Contributeurs MUSIQUE : qui peut ramener la playlist. Autour d'une table, l'hote
    // presentateur est le DJ : sa musique DOIT alimenter le pool meme s'il ne joue pas.
    // Tout le monde present dans la room peut contribuer.
    const musicContributorIds = room.mode === GameMode.EVENT
      ? Array.from(new Set(participantRows.map(p => p.user_id)))
      : participantIds;

    if (!participantIds.length) {
      fail(res, "no_participants", "Aucun joueur connecté pour lancer en mode événement", 400);
      return;
    }

    // Regle : au moins 1 playlist importee (par un joueur OU l'hote presentateur).
    const { rows: musicRows } = await pool.query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id) AS n FROM audio_sources WHERE user_id = ANY($1::int[])`,
      [musicContributorIds]
    );
    const playersWithMusic = Number(musicRows[0]?.n ?? 0);
    // Assoupli : 2 joueurs minimum + au moins 1 playlist importee. Une seule personne
    // peut ramener la musique (pratique pour une partie autour d'une table).
    if (participantIds.length < 2) {
      fail(res, "need_more_players", "Il faut au moins 2 joueurs pour lancer la partie.", 400);
      return;
    }
    if (playersWithMusic < 1) {
      fail(res, "need_more_music", "Il faut au moins une playlist importée (par un joueur ou l'hôte) pour lancer.", 400, { playersWithMusic });
      return;
    }
    const singleContributor = playersWithMusic <= 1;

    const collected: AudioSourceRow[] = [];
    const seen = new Set<string>();

    const pushUnique = (list: AudioSourceRow[]) => {
      for (const src of list) {
        const key = src.external_id ?? String(src.id);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(src);
        if (collected.length >= room.question_count) break;
      }
    };

    // Préférences par joueur
    const prefMap = new Map<number, { source?: string | null; playlist?: string | null }>();
    for (const row of participantRows) {
      prefMap.set(row.user_id, { source: row.source_pref, playlist: row.playlist_pref });
    }

    const allowedSources: SourceChoice[] = ["library", "liked", "playlist", "top_week", "top_month", "top_all"];
    const normalizeSource = (val?: string | null): SourceChoice => {
      if (!val) return sourceParam;
      const lower = val.toLowerCase();
      if (allowedSources.includes(lower as SourceChoice)) return lower as SourceChoice;
      return sourceParam;
    };

    // Charger les connexions Spotify des joueurs (hors hôte streamer/événement) pour synchroniser au besoin
    const connectionUserIds = Array.from(new Set(musicContributorIds)) as number[];
    const { rows: connRows } = await pool.query<{
      id: number;
      user_id: number;
      provider: string;
      access_token: string | null;
      refresh_token: string | null;
      expires_at: string | null;
      scope: string[] | null;
      created_at: string | null;
      updated_at: string | null;
    }>(
      `SELECT id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at
       FROM user_connections
       WHERE user_id = ANY($1::int[])`,
      [connectionUserIds]
    );
    const connectionMap = new Map<number, {
      id: number;
      user_id: number;
      provider: MusicProvider;
      access_token: string | null;
      refresh_token: string | null;
      expires_at: string | null;
      scope: string[] | null;
      created_at: string;
      updated_at: string;
    }>();
    for (const row of connRows) {
      connectionMap.set(row.user_id, {
        id: row.id,
        user_id: row.user_id,
        provider: row.provider as MusicProvider,
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at,
        scope: row.scope,
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? new Date().toISOString(),
      });
    }

    // Prélever un quota par joueur pour garantir la diversité
    const perUserCount = Math.max(1, Math.ceil(room.question_count / Math.max(1, musicContributorIds.length)));
    const contribution = new Map<number, number>();
    for (const pid of musicContributorIds) {
      const pref = prefMap.get(pid);
      const choice = normalizeSource(pref?.source ?? sourceParam);
      const likedChoice = choice === "liked";
      const playlistChoice = choice === "playlist" ? pref?.playlist ?? playlistId ?? undefined : undefined;
      const timeChoice = choice === "top_week" ? "short_term" : choice === "top_month" ? "medium_term" : choice === "top_all" ? "long_term" : undefined;

      // Si la source nécessite Spotify mais que le joueur n'a pas de connexion, on saute
      const userConn = connectionMap.get(pid);
      const needsSpotify = likedChoice || choice === "playlist" || Boolean(timeChoice);
      if (needsSpotify && !(userConn?.provider === "spotify" && userConn.access_token)) {
        continue;
      }

      // 1) D'abord les titres que CE joueur possede vraiment -> attribution "qui a ajoute" fiable.
      // On passe par collectPlayableSources pour HYDRATER les previews Deezer : les titres
      // importes ont audio_url NULL au depart et seraient sinon jetes par le filtre playable.
      const owned = await collectPlayableSources(pid, perUserCount, {
        likedOnly: likedChoice,
        playlistId: playlistChoice,
        timeRange: timeChoice,
        provider: poolProvider,
        ownedOnly: true,
      });
      for (const s of owned) s.user_id = pid; // revendique la contribution pour cette partie
      pushUnique(owned);

      // 2) Complement, toujours dans la bibliotheque de CE joueur. On passe par
      // collectPlayableSources pour hydrater les extraits et ecarter les titres
      // sans audio (fetchAudioSources brut en laissait passer : manche muette).
      const need = perUserCount - owned.length;
      let extra = 0;
      if (need > 0) {
        const slice = await collectPlayableSources(pid, need, {
          provider: poolProvider,
          ownedOnly: true,
          likedOnly: likedChoice,
          playlistId: playlistChoice,
          timeRange: timeChoice,
        });
        extra = slice.length;
        pushUnique(slice);
      }
      contribution.set(pid, (contribution.get(pid) ?? 0) + owned.length + extra);
    }

    // Compléter avec le pool commun si besoin
    if (collected.length < room.question_count) {
      const fill = await collectPlayableSources(musicContributorIds, room.question_count, {
        likedOnly: false,
        provider: poolProvider,
      });
      pushUnique(fill);
    }

    let sources = collected;


    // Si toujours insuffisant, compléter avec le pool global (provider "any")
    if (sources.length < room.question_count) {
      const remaining = room.question_count - sources.length;
      const fallback = await collectPlayableSources(musicContributorIds, remaining, {
        likedOnly: false,
        provider: "any",
      });
      const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
      for (const candidate of fallback) {
        const key = candidate.external_id ?? String(candidate.id);
        if (existingKeys.has(key)) continue;
        sources.push(candidate);
        existingKeys.add(key);
        if (sources.length >= room.question_count) break;
      }
    }

    // Garantir au moins une piste par contributeur, uniquement depuis SA bibliotheque.
    for (const pid of musicContributorIds) {
      const hasOne = sources.some(src => src.user_id === pid);
      if (hasOne) continue;
      const existingKeys = new Set(sources.map(src => src.external_id ?? String(src.id)));
      // collectPlayableSources (et pas fetchAudioSources brut) : il rafraichit les
      // extraits et jette ceux sans audio. Sinon on pouvait injecter ici un titre
      // muet et la table restait 10 secondes dans le silence.
      const personalPool = await collectPlayableSources(pid, 3, { provider: poolProvider, ownedOnly: true });
      for (const candidate of personalPool) {
        const key = candidate.external_id ?? String(candidate.id);
        if (existingKeys.has(key)) continue;
        sources.push(candidate);
        existingKeys.add(key);
        break;
      }
      // On NE complete PLUS avec la musique d'inconnus : on joue uniquement les
      // titres des joueurs presents, quitte a faire moins de manches.
      if (sources.length >= room.question_count) break;
    }

    // Plus de repli sur le fonds commun : la promesse produit, c'est "VOS musiques".
    // S'il manque des titres, la partie aura simplement moins de manches
    // (effectiveRounds s'ajuste plus bas sur sources.length).

    // Dernier filet : si rien du tout, on s'arrête avec un message explicite
    if (sources.length === 0) {
      fail(res, "insufficient_tracks", "Pas assez de titres pour lancer la partie", 400, {
        needed: room.question_count,
        available: 0,
      });
      return;
    }

    // Mélange final pour intercaler les sources entre joueurs (et accepter un nombre réduit si besoin)
    sources = shuffle(sources);

    // Hydrate/rafraichit les previews via Deezer. On passe TOUS les titres (pas seulement ceux
    // sans URL) : une URL Deezer en cache peut etre EXPIREE (signature `exp=`) -> 403 -> pas de son.
    // hydratePreviewUrl renvoie l'URL cache si fraiche, re-fetch si manquante/expiree, null si injouable.
    await Promise.all(
      sources.map(async source => {
        source.audio_url = await hydratePreviewUrl(source);
      })
    );

    // Keep only tracks with a playable audio URL
    sources = sources.filter(s => Boolean(s.audio_url));

    const cappedCount = Math.max(1, Math.min(sources.length, room.question_count));
    sources = sources.slice(0, cappedCount);

    // Ajuster le nombre de rounds à ce qui est réellement disponible (borné par la demande)
    const effectiveRounds = Math.max(1, sources.length);

    const { rows: participantUsers } = await pool.query<{ id: number; username: string | null; avatar: string | null }>(
      `SELECT id, username, avatar FROM users WHERE id = ANY($1::int[])`,
      [musicContributorIds]
    );
    const usernameMap = new Map<number, string | null>();
    const avatarMap = new Map<number, string | null>();
    participantUsers.forEach(u => {
      usernameMap.set(u.id, u.username);
      avatarMap.set(u.id, u.avatar);
    });

    // Wrap game creation in a transaction to ensure atomicity
    const client = await pool.connect();
    let session: any;
    let normalizedTracks: Array<{
      round: number; audioSourceId: string; type: string; track_id: string;
      title: string; artist: string; album: string | null; album_cover: string | null;
      audio_url: string | null; metadata: Record<string, any>;
    }>;
    try {
      await client.query("BEGIN");

      const { rows: sessionRows } = await client.query(
        `INSERT INTO game_sessions (host_user_id, mode, difficulty, source_provider, total_rounds, state, room_code)
         VALUES ($1,$2,$3,$4,$5,'in_progress',$6)
         RETURNING id, mode, difficulty, source_provider, total_rounds, started_at`,
        [context.user.id, room.mode, room.difficulty, provider, effectiveRounds, room.room_code]
      );
      session = sessionRows[0];

      await client.query(
        `UPDATE multiplayer_rooms
         SET status='in_progress', session_id=$2, started_at=NOW()
         WHERE id=$1`,
        [room.id, session.id]
      );

      for (const pid of participantIds) {
        await client.query(
          `INSERT INTO game_participants (session_id, user_id, score)
           VALUES ($1,$2,0)
           ON CONFLICT (session_id, user_id) DO NOTHING`,
          [session.id, pid]
        );
      }

    normalizedTracks = sources.map((source, index) => ({
      round: index + 1,
      audioSourceId: source.id,
      type: source.provider,
      track_id: source.external_id ?? source.id,
      title: source.title,
      artist: source.artist,
      album: (source.metadata as any)?.album ?? (source.metadata as any)?.album_name ?? null,
      album_cover: source.album_cover,
      audio_url: source.audio_url,
      metadata: {
        ...(source.metadata ?? {}),
        owner_user_id: (source as { user_id?: number | null }).user_id ?? null,
        owner_username: (source as { user_id?: number | null }).user_id
          ? usernameMap.get((source as { user_id?: number | null }).user_id ?? 0) ?? null
          : null,
        owner_avatar: (source as { user_id?: number | null }).user_id
          ? avatarMap.get((source as { user_id?: number | null }).user_id ?? 0) ?? null
          : null,
      },
    }));

    for (const track of normalizedTracks) {
      await client.query(
        `INSERT INTO game_rounds (session_id, round_index, audio_source_id, correct_title, correct_artist)
         VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (session_id, round_index) DO NOTHING`,
        [session.id, track.round, track.audioSourceId, track.title, track.artist]
      );
    }

    await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // Duree configuree par l'hote dans le lobby, sinon defaut du mode.
    const configuredMs = Number(room.round_duration_ms);
    const roundDurationMs =
      Number.isFinite(configuredMs) && configuredMs >= 5_000 && configuredMs <= 60_000
        ? configuredMs
        : room.mode === GameMode.EVENT ? EVENT_ROUND_DURATION_MS : 20_000;

    const roundTracks: RoundTrack[] = normalizedTracks.map(t => ({
      round: t.round,
      trackId: String(t.track_id),
      audioSourceId: t.audioSourceId,
      title: t.title,
      artist: t.artist,
      album: t.album ?? null,
      previewUrl: t.audio_url,
      albumCover: t.album_cover,
      metadata: t.metadata ?? {},
    }));

    if (room.mode === GameMode.STREAMER) {
      const subModeRaw = typeof req.body?.subMode === "string" ? req.body.subMode.toLowerCase() : "duo";
      const soloSourceRaw = typeof req.body?.soloSource === "string" ? req.body.soloSource.toLowerCase() : "streamer";
      const subMode =
        subModeRaw === "viewers_only" || subModeRaw === "chat_only" || subModeRaw === "streamer_only"
          ? ("viewers_only" as const)
          : subModeRaw === "solo" || subModeRaw === "just_stream"
            ? ("solo" as const)
            : ("duo" as const);
      const soloTrackSource = soloSourceRaw === "chat" || soloSourceRaw === "audience" ? ("chat" as const) : ("streamer" as const);

      const streamerRounds = normalizedTracks.map((t, index) => {
        let trackSource: "streamer" | "chat" = "streamer";
        if (subMode === "viewers_only") {
          trackSource = "chat";
        } else if (subMode === "solo") {
          trackSource = soloTrackSource;
        } else {
          // duo: alternate between streamer and chat for variety
          trackSource = index % 2 === 0 ? "streamer" : "chat";
        }
        return {
        round: t.round,
        trackId: String(t.track_id),
        audioSourceId: t.audioSourceId,
        title: t.title,
        artist: t.artist,
        album: t.album ?? null,
        previewUrl: t.audio_url,
        albumCover: t.album_cover,
        metadata: t.metadata ?? {},
        trackSource,
      };
      });
      const state = initStreamerGame(io, {
        roomCode: room.room_code,
        hostUserId: room.host_user_id,
        rounds: streamerRounds,
        subMode,
      });
      ok(res, {
        session: {
          id: session.id,
          mode: session.mode,
          difficulty: session.difficulty,
          provider: session.source_provider,
          totalRounds: session.total_rounds,
          startedAt: session.started_at,
          roomCode: room.room_code,
        },
        tracks: normalizedTracks,
        gameState: state,
      });
      return;
    }

    bootstrapGameState({
      roomCode: room.room_code,
      hostUserId: room.host_user_id,
      hostPlays: room.mode === GameMode.EVENT && room.host_plays === true,
      singleContributor,
      mode: session.mode as GameMode,
      tracks: roundTracks,
      participants: participantIds.map(id => ({
        userId: id,
        username: usernameMap.get(id) ?? null,
        avatar: avatarMap.get(id) ?? null,
      })),
      config: {
        autoAdvance: room.auto_advance ?? false,
        roundDurationMs,
      },
      sessionId: session.id,
    });

    // Start round 1 immediately in a server-authoritative way
    // Pre-roll : la 1re manche demarre 3s plus tard pour laisser passer le
    // decompte 3-2-1 (avant, la musique jouait PENDANT le decompte). Le chrono
    // et l'audio partent donc ensemble, a la fin du decompte.
    const snapshot = startRoundAndBroadcast(io, room.room_code, {
      startAt: Date.now() + FIRST_ROUND_PREROLL_MS,
    });

    ok(res, {
      session: {
        id: session.id,
        mode: session.mode,
        difficulty: session.difficulty,
        provider: session.source_provider,
        totalRounds: session.total_rounds,
        startedAt: session.started_at,
        roomCode: room.room_code,
      },
      tracks: normalizedTracks,
      gameState: snapshot,
    });
  },
};
