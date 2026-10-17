// Configuration de l'Activite Discord : Blindz lance dans un salon vocal, dans
// une iframe servie par le proxy de Discord (https://<id>.discordsays.com).
//
// DISCORD_CLIENT_ID     identifiant public de l'appli (portail developpeur).
//                       Il ouvre l'origine du proxy (utils/origins.ts) et il
//                       est donne au front par GET /api/discord/config.
// DISCORD_CLIENT_SECRET secret de l'appli. Lu ici seulement, pour l'echange du
//                       code OAuth2 (services/discordAuth.ts). Il ne sort
//                       jamais du serveur : ni reponse, ni journal.
// DISCORD_API_BASE      surcharge pour la pile de test (faux Discord local),
//                       comme DEEZER_API_BASE. Sans la variable : le vrai Discord.
//
// Sans identifiant ni secret, l'Activite est desactivee proprement : le front
// l'apprend par /api/discord/config et aucune origine Discord n'est ouverte.

export type DiscordCredentials = { clientId: string; clientSecret: string };

export type DiscordCredentialsResult =
  | { ok: true; credentials: DiscordCredentials }
  | { ok: false; reason: "absent" | "client_id_invalide" | "secret_absent" };

// Un identifiant d'appli Discord est un "snowflake" : une suite de chiffres.
// Rien d'autre ne doit pouvoir fabriquer une origine ou une adresse.
export const DISCORD_CLIENT_ID_PATTERN = /^\d{15,22}$/;

export function readDiscordCredentials(env: NodeJS.ProcessEnv = process.env): DiscordCredentialsResult {
  const clientId = (env.DISCORD_CLIENT_ID ?? "").trim();
  const clientSecret = (env.DISCORD_CLIENT_SECRET ?? "").trim();
  if (!clientId && !clientSecret) return { ok: false, reason: "absent" };
  if (!DISCORD_CLIENT_ID_PATTERN.test(clientId)) return { ok: false, reason: "client_id_invalide" };
  if (!clientSecret) return { ok: false, reason: "secret_absent" };
  return { ok: true, credentials: { clientId, clientSecret } };
}

export function discordApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.DISCORD_API_BASE || "https://discord.com/api/v10").replace(/\/+$/, "");
}

/** Origine de la page de l'Activite, telle que le navigateur la presente. */
export function discordActivityOrigin(clientId: string): string {
  return `https://${clientId}.discordsays.com`;
}
