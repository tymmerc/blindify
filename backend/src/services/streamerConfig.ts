/**
 * Reglages du mode streamer (T5), lus dans l'environnement a chaque appel :
 * Tym peut couper le mode sans toucher au code.
 *
 * - STREAMER_MODE=off : creation et lancement refuses, page /live et overlay
 *   fermes, carte « Avec ta communaute » repassee en « Bientot ». C'est
 *   l'interrupteur a tirer si Deezer se plaint. Toute autre valeur (ou rien)
 *   laisse le mode ouvert.
 * - STREAMER_MAX_GAMES : parties streamer en meme temps sur le serveur (3).
 * - STREAMER_MAX_VIEWERS : viewers inscrits par partie (300).
 */

export const DEFAULT_MAX_GAMES = 3;
export const DEFAULT_MAX_VIEWERS = 300;

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function streamerModeEnabled(env: Env = process.env): boolean {
  const value = env.STREAMER_MODE?.trim().toLowerCase();
  return value !== "off" && value !== "0" && value !== "false";
}

function positiveInt(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.trunc(n), max);
}

export function maxStreamerGames(env: Env = process.env): number {
  return positiveInt(env.STREAMER_MAX_GAMES, DEFAULT_MAX_GAMES, 50);
}

export function maxStreamerViewers(env: Env = process.env): number {
  return positiveInt(env.STREAMER_MAX_VIEWERS, DEFAULT_MAX_VIEWERS, 5_000);
}
