import { pool } from "../../config/db";
import { makeSpotify } from "../../config/spotify";
import type { AudioSourceRow } from "../../types/audio";
import type { MusicProvider, UserConnection } from "../../types/user";

type SpotifyLibraryTrack = {
  id?: string;
  name?: string;
  artists?: { name?: string }[];
  album?: {
    name?: string;
    images?: { url?: string }[];
    release_date?: string;
  };
  duration_ms?: number;
  popularity?: number;
};

type SpotifySavedTrack = {
  track?: SpotifyLibraryTrack | null;
};

function isExpired(connection: UserConnection | null): boolean {
  if (!connection?.expires_at) return false;
  return new Date(connection.expires_at).getTime() <= Date.now() + 60_000;
}

async function refreshSpotifyConnection(connection: UserConnection): Promise<UserConnection> {
  if (!connection.refresh_token) {
    return connection;
  }

  const spotify = makeSpotify(undefined, connection.refresh_token);
  const refreshed = await spotify.refreshAccessToken();
  const accessToken = refreshed.body.access_token;
  const refreshToken = refreshed.body.refresh_token || connection.refresh_token;
  const expiresAt = new Date(Date.now() + (refreshed.body.expires_in ?? 3600) * 1000).toISOString();

  const { rows } = await pool.query<UserConnection>(
    `UPDATE user_connections
     SET access_token=$2,
         refresh_token=$3,
         expires_at=$4,
         updated_at=NOW()
     WHERE id=$1
     RETURNING id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at`,
    [connection.id, accessToken, refreshToken, expiresAt]
  );

  return rows[0];
}

export async function ensureSpotifyConnection(connection: UserConnection): Promise<UserConnection> {
  if (!connection.access_token || isExpired(connection)) {
    return refreshSpotifyConnection(connection);
  }
  return connection;
}

export async function syncSpotifyLibrary(
  userId: number,
  connection: UserConnection,
  desiredCount: number
): Promise<{ sources: AudioSourceRow[]; connection: UserConnection }> {
  let working = connection;
  if (!working.access_token || isExpired(working)) {
    working = await refreshSpotifyConnection(connection);
  }

  if (!working.access_token) {
    return { sources: [], connection: working };
  }

  const api = makeSpotify(working.access_token, working.refresh_token ?? undefined);
  const target = Math.min(Math.max(desiredCount * 3, 30), 200);
  const collected: SpotifySavedTrack[] = [];

  for (let offset = 0; offset < 400 && collected.length < target; offset += 50) {
    const response = await api.getMySavedTracks({ limit: 50, offset });
    const items = (response.body.items as SpotifySavedTrack[]) ?? [];
    collected.push(...items);
    if (items.length < 50) break;
  }

  const tracks = collected
    .map(item => item.track)
    .filter((track): track is SpotifyLibraryTrack & { id: string; name: string } => Boolean(track?.id && track?.name));

  const inserted: AudioSourceRow[] = [];
  for (const track of tracks) {
    const metadata = {
      album: track.album?.name ?? null,
      release_date: track.album?.release_date ?? null,
      popularity: track.popularity ?? null,
      provider: "spotify" as MusicProvider,
    };

    const { rows } = await pool.query<AudioSourceRow>(
      `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, album_cover, duration_ms, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (provider, external_id)
       DO UPDATE SET
         title=EXCLUDED.title,
         artist=EXCLUDED.artist,
         album_cover=EXCLUDED.album_cover,
         duration_ms=EXCLUDED.duration_ms,
         metadata=EXCLUDED.metadata,
         user_id=EXCLUDED.user_id
       RETURNING id, provider, external_id, title, artist, album_cover, audio_url, duration_ms, metadata`,
      [
        "spotify",
        track.id,
        userId,
        track.name,
        track.artists?.map(artist => artist?.name).filter(Boolean).join(", ") ?? "Artiste inconnu",
        track.album?.images?.[0]?.url ?? null,
        track.duration_ms ?? null,
        metadata,
      ]
    );
    inserted.push(rows[0]);
  }

  return { sources: inserted, connection: working };
}
