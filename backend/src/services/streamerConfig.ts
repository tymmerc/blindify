/**
 * Reglages du mode streamer (T5), lus dans l'environnement a chaque appel :
 * Tym peut couper le mode sans toucher au code.
 *
 * - STREAMER_MODE=off (ou 0, false, no, non, disabled) : creation et lancement
 *   refuses, page /live et overlay fermes, carte « Avec ta communaute »
 *   repassee en « Bientot », et un live en cours finit a la prochaine action
 *   (manche suivante, connexion). C'est l'interrupteur a tirer si Deezer se
 *   plaint. Toute autre valeur (ou rien) laisse le mode ouvert.
 * - STREAMER_MAX_GAMES : parties streamer en meme temps sur le serveur (3).
 * - STREAMER_MAX_VIEWERS : viewers inscrits par partie (300).
 * - STREAMER_MAX_VIEWERS_PER_IP : viewers inscrits par adresse et par partie
 *   (8 : un foyer ou une classe derriere une seule box passe, un script non).
 */

export const DEFAULT_MAX_GAMES = 3;
export const DEFAULT_MAX_VIEWERS = 300;
export const DEFAULT_MAX_VIEWERS_PER_IP = 8;
const OFF_VALUES: ReadonlySet<string> = new Set(["off", "0", "false", "no", "non", "disabled"]);

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function streamerModeEnabled(env: Env = process.env): boolean {
  const value = env.STREAMER_MODE?.trim().toLowerCase() ?? "";
  return !OFF_VALUES.has(value);
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

export function maxStreamerViewersPerIp(env: Env = process.env): number {
  return positiveInt(env.STREAMER_MAX_VIEWERS_PER_IP, DEFAULT_MAX_VIEWERS_PER_IP, 1_000);
}
