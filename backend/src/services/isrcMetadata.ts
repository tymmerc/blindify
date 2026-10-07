/**
 * Pour les upserts qui remplacent metadata a chaque synchro (compte Spotify
 * connecte : playlists, tops, titres likes) : la nouvelle metadata, mais un
 * ISRC deja connu reste si Spotify n'en renvoie pas cette fois. A placer dans
 * un `ON CONFLICT (provider, external_id) DO UPDATE SET ...`.
 */
export const METADATA_KEEPING_ISRC =
  "metadata=EXCLUDED.metadata || jsonb_strip_nulls(jsonb_build_object('isrc', COALESCE(EXCLUDED.metadata->>'isrc', audio_sources.metadata->>'isrc')))";
