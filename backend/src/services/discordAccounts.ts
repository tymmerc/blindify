import { pool } from "../config/db";
import { PHOTO_PATH_PREFIX } from "./userPhotos";
import type { AuthenticatedUser } from "../types/user";
import { discordAvatarUrl, discordDisplayName, type DiscordUser } from "./discordAuth";

/**
 * Compte Blindz d'un joueur Discord : fournisseur "discord", identifiant Discord
 * en provider_id (UNIQUE (provider, provider_id) dans users). Le meme joueur
 * retrouve son compte, donc sa bibliotheque et son historique, d'un salon a
 * l'autre. Nom et avatar sont rafraichis a chaque connexion : ce sont ceux de
 * Discord, le joueur ne les choisit pas dans Blindz. Seule exception : une
 * photo de profil mise sur Blindz (T39) reste, l'avatar Discord ne l'ecrase pas.
 */
export async function upsertDiscordUser(user: DiscordUser): Promise<AuthenticatedUser> {
  const { rows } = await pool.query<AuthenticatedUser>(
    `INSERT INTO users (provider, provider_id, username, email, avatar)
     VALUES ('discord', $1, $2, NULL, $3)
     ON CONFLICT (provider, provider_id)
     DO UPDATE SET username = EXCLUDED.username,
       avatar = CASE WHEN users.avatar LIKE $4 THEN users.avatar ELSE EXCLUDED.avatar END
     RETURNING id, provider, provider_id, username, email, avatar, created_at`,
    [user.id, discordDisplayName(user), discordAvatarUrl(user), `${PHOTO_PATH_PREFIX}%`],
  );
  return rows[0];
}
