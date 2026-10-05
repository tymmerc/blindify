/**
 * Adresse d'ecoute du serveur HTTP.
 *
 * Defaut 0.0.0.0 : en prod le backend tourne dans un conteneur et docker ne
 * publie le port que sur 127.0.0.1 de l'hote, il faut donc ecouter sur toutes
 * les interfaces DU CONTENEUR. Le backend de DEV, lui, tourne directement sur
 * l'hote : avec LISTEN_HOST=127.0.0.1 il n'est joignable que par nginx, meme si
 * le pare-feu changeait un jour (infra/menage-2026-10-05).
 */
export function listenHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.LISTEN_HOST?.trim() || "0.0.0.0";
}
