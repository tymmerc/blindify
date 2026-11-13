import type { PoolClient } from "pg";
import { moveGuestPhoto } from "./userPhotos";

/**
 * T26 : un joueur se connecte a son compte depuis un navigateur ou il jouait
 * en invite. Tenir les deux sessions dans le meme navigateur, et connaitre le
 * mot de passe du compte, prouve que c'est la meme personne : le compte
 * reprend alors tout ce qu'a fait l'invite (parties, scores, badges, musique).
 *
 * Jamais par pseudo : deux « Miguel » ne sont pas le meme joueur. Cette
 * fonction n'est appelee qu'avec l'invite de la session en cours.
 *
 * Une ligne qui entrerait en conflit avec une ligne du compte (meme partie,
 * meme manche, meme lien, meme badge) reste sur l'invite : le compte garde la
 * sienne. L'invite vide reste en base sans session ; le janitor le retire a
 * 30 jours comme toute coquille vide (deadGuests.ts). On ne le supprime pas
 * ici : une salle encore ouverte dont il est l'hote partirait avec lui.
 *
 * A appeler dans une transaction ouverte par l'appelant.
 */
export async function absorbGuest(client: PoolClient, guestId: number, accountId: number): Promise<void> {
  if (guestId === accountId) return;
  const ids = [guestId, accountId];

  // Lignes uniques par (cle, joueur) : on ne deplace que ce qui ne heurte rien.
  const moveUnlessTaken = async (table: string, key: string) => {
    await client.query(
      `UPDATE ${table} t SET user_id=$2
       WHERE t.user_id=$1
         AND NOT EXISTS (SELECT 1 FROM ${table} x WHERE x.user_id=$2 AND x.${key} = t.${key})`,
      ids
    );
  };
  await moveUnlessTaken("game_participants", "session_id");
  await moveUnlessTaken("round_responses", "round_id");
  await moveUnlessTaken("imported_links", "normalized_url");
  await moveUnlessTaken("user_badges", "badge_id");
  await moveUnlessTaken("likes", "audio_source_id");

  // Bibliotheque : cle primaire (user_id, audio_source_id).
  await client.query(
    `INSERT INTO user_audio_sources (user_id, audio_source_id, link_id, created_at)
     SELECT $2, audio_source_id, link_id, created_at FROM user_audio_sources WHERE user_id=$1
     ON CONFLICT (user_id, audio_source_id) DO NOTHING`,
    ids
  );
  await client.query(`DELETE FROM user_audio_sources WHERE user_id=$1`, [guestId]);

  // Simples references, sans contrainte d'unicite.
  await client.query(`UPDATE audio_sources SET user_id=$2 WHERE user_id=$1`, ids);
  await client.query(`UPDATE game_sessions SET host_user_id=$2 WHERE host_user_id=$1`, ids);
  await client.query(`UPDATE game_rounds SET owner_user_id=$2 WHERE owner_user_id=$1`, ids);

  // Statistiques : des totaux, donc on additionne (les records gardent le max).
  await client.query(
    `INSERT INTO user_stats (user_id, total_games, total_correct, total_guesses, total_reaction_ms,
                             best_streak, total_xp, longest_game, last_played_at, updated_at)
     SELECT $2, total_games, total_correct, total_guesses, total_reaction_ms,
            best_streak, total_xp, longest_game, last_played_at, NOW()
     FROM user_stats WHERE user_id=$1
     ON CONFLICT (user_id) DO UPDATE SET
       total_games = COALESCE(user_stats.total_games, 0) + COALESCE(EXCLUDED.total_games, 0),
       total_correct = COALESCE(user_stats.total_correct, 0) + COALESCE(EXCLUDED.total_correct, 0),
       total_guesses = COALESCE(user_stats.total_guesses, 0) + COALESCE(EXCLUDED.total_guesses, 0),
       total_reaction_ms = COALESCE(user_stats.total_reaction_ms, 0) + COALESCE(EXCLUDED.total_reaction_ms, 0),
       best_streak = GREATEST(user_stats.best_streak, EXCLUDED.best_streak),
       total_xp = COALESCE(user_stats.total_xp, 0) + COALESCE(EXCLUDED.total_xp, 0),
       longest_game = GREATEST(user_stats.longest_game, EXCLUDED.longest_game),
       last_played_at = GREATEST(user_stats.last_played_at, EXCLUDED.last_played_at),
       updated_at = NOW()`,
    ids
  );
  await client.query(`DELETE FROM user_stats WHERE user_id=$1`, [guestId]);

  // Photo de profil (T39) : le compte la prend s'il n'en a pas.
  await moveGuestPhoto(client, guestId, accountId);

  // L'invite n'a plus de session : son ancien jeton ne rouvre plus rien.
  await client.query(`DELETE FROM user_sessions WHERE user_id=$1`, [guestId]);
}
