/**
 * Les invites que le janitor supprime (index.ts, toutes les 6 heures) : les
 * coquilles vides, crees il y a plus de 30 jours et jamais utilises. Un invite
 * qui a joue, ou qui a importe un lien ou de la musique, est garde pour
 * toujours (voir le commentaire du janitor dans index.ts).
 *
 * « A importe de la musique » se lit dans user_audio_sources : depuis la
 * migration 005, un invite peut avoir des morceaux sans en etre le premier
 * importeur (audio_sources.user_id). Les deux sont regardes.
 */
export const DEAD_GUEST_FILTER = `
      SELECT u.id FROM users u
      WHERE u.provider = 'guest'
        AND u.created_at < NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM user_sessions s
          WHERE s.user_id = u.id AND s.expires_at > NOW())
        AND NOT EXISTS (
          SELECT 1 FROM room_participants rp
          JOIN multiplayer_rooms r ON r.id = rp.room_id
          WHERE rp.user_id = u.id AND r.created_at > NOW() - INTERVAL '30 days')
        AND NOT EXISTS (
          SELECT 1 FROM multiplayer_rooms mr
          WHERE mr.host_user_id = u.id AND mr.created_at > NOW() - INTERVAL '30 days')
        AND NOT EXISTS (
          SELECT 1 FROM game_participants gp WHERE gp.user_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM game_sessions gs WHERE gs.host_user_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM imported_links il WHERE il.user_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM user_audio_sources ua WHERE ua.user_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM audio_sources a WHERE a.user_id = u.id)
      LIMIT 500`;
