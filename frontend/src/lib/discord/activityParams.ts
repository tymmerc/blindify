/**
 * Parametres poses par Discord dans l'adresse de l'iframe d'une Activite :
 * frame_id, instance_id (le salon : tous ceux qui lancent l'Activite dans le
 * meme salon le partagent) et platform. Sans eux, la page n'est pas ouverte
 * dans Discord ; on le dit au joueur au lieu de laisser le SDK lever une
 * exception. L'identifiant d'instance part au serveur, qui applique la meme
 * forme (backend, DISCORD_INSTANCE_ID_PATTERN).
 */
export type ActivityPlatform = "desktop" | "mobile"

export type ActivityParams = {
  frameId: string
  instanceId: string
  platform: ActivityPlatform
  channelId: string | null
  guildId: string | null
}

export const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/

export function readActivityParams(search: string): ActivityParams | null {
  const params = new URLSearchParams(search)
  const frameId = params.get("frame_id")
  const instanceId = params.get("instance_id")
  const platform = params.get("platform")
  if (!frameId || !instanceId) return null
  if (platform !== "desktop" && platform !== "mobile") return null
  if (!INSTANCE_ID_PATTERN.test(instanceId)) return null
  return {
    frameId,
    instanceId,
    platform,
    channelId: params.get("channel_id"),
    guildId: params.get("guild_id"),
  }
}
