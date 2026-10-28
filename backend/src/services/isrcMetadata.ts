/**
 * Pour un upsert qui remplace metadata a chaque passage : la nouvelle
 * metadata, mais un ISRC deja connu reste si la source n'en renvoie pas cette
 * fois. A placer dans un `ON CONFLICT (provider, external_id) DO UPDATE SET ...`.
 * Ses utilisateurs (la synchro du compte Spotify connecte) sont partis avec la
 * connexion (T15) ; garde pour le prochain upsert de ce genre.
 */
export const METADATA_KEEPING_ISRC =
  "metadata=EXCLUDED.metadata || jsonb_strip_nulls(jsonb_build_object('isrc', COALESCE(EXCLUDED.metadata->>'isrc', audio_sources.metadata->>'isrc')))";
