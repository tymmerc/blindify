// Lien d'installation de l'Activite Discord, pour le site (pas pour l'Activite
// elle-meme). Tant que Discord n'a pas verifie l'appli, Blindz n'apparait pas
// dans la fusee : il faut d'abord l'ajouter a un serveur ou a son compte.
//
// L'identifiant est public : le backend le sert aussi par /api/discord/config
// (DISCORD_CLIENT_ID). C'est la seule copie cote front, ne pas le recopier
// ailleurs. S'il change, changer les deux.

export const DISCORD_APP_ID = "1559906854111420416"

export const DISCORD_INSTALL_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_APP_ID}`

/** Les 3 etapes, partagees par le bouton, la ligne discrete et la FAQ. */
export const DISCORD_STEPS: readonly string[] = [
  "Ajoute Blindz à ton serveur ou à ton compte.",
  "Rejoins un salon vocal.",
  "Clique sur la fusée, puis sur Blindz.",
]

export const DISCORD_FRIENDS_NOTE =
  "Les potes qui sont dans l'appel cliquent sur l'Activité, sans rien installer."
