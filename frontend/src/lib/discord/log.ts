/**
 * Journal du demarrage de l'Activite, dans la console de la page (et, apres le
 * READY, dans celle du client Discord : le SDK y renvoie les console.*).
 * Le premier essai reel (14/10/2026) n'a rien dit de l'endroit ou ca bloquait.
 * Jamais de code OAuth2, de jeton Discord ni de session dans ces lignes.
 */
export const DISCORD_LOG_PREFIX = "[blindz-discord]"

export type DiscordLog = (event: string, details?: Record<string, unknown>) => void

export const discordLog: DiscordLog = (event, details) => {
  try {
    if (details) console.info(`${DISCORD_LOG_PREFIX} ${event}`, details)
    else console.info(`${DISCORD_LOG_PREFIX} ${event}`)
  } catch {
    // une console absente ou cassee ne doit pas couper le demarrage
  }
}

/** Ce qu'une erreur dit d'utile : nom, message, code, statut HTTP. */
export function describeError(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as { name?: unknown; message?: unknown; code?: unknown; status?: unknown }
    const out: Record<string, unknown> = {}
    if (typeof e.name === "string") out.name = e.name
    if (typeof e.message === "string") out.message = e.message
    if (typeof e.code === "string" || typeof e.code === "number") out.code = e.code
    if (typeof e.status === "number") out.status = e.status
    return out
  }
  return { message: String(err) }
}
