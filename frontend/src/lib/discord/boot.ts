import type { IDiscordSDK } from "@discord/embedded-app-sdk"
import { ApiError } from "@/lib/apiClient"
import type { MultiplayerRoom, UserSummary } from "@/lib/types"

/**
 * Demarrage de l'Activite Discord, dans l'ordre impose par le SDK :
 *   1. config   : l'identifiant public de l'appli, lu sur notre serveur (pas de rebuild)
 *   2. sdk      : le SDK attend le READY du client Discord
 *   3. authorize: Discord demande son accord au joueur (scope identify seulement)
 *   4. session  : notre serveur echange le code contre une session Blindz
 *   5. authenticate : le SDK recoit le jeton d'acces (il en a besoin pour ses commandes)
 *   6. room     : la salle du salon, retrouvee ou creee par le serveur
 * Pure : tout vient par les dependances, le composant n'a qu'a afficher.
 */
export type ActivitySdk = IDiscordSDK

export type DiscordBootStep = "config" | "sdk" | "authorize" | "session" | "authenticate" | "room"

export type DiscordBootErrorCode =
  | "disabled"
  | "authorize_refused"
  | "session_failed"
  | "discord_unavailable"
  | "authenticate_failed"
  | "room_failed"

export class DiscordBootError extends Error {
  cause?: unknown

  constructor(
    readonly code: DiscordBootErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = "DiscordBootError"
    if (cause !== undefined) this.cause = cause
  }
}

export type DiscordAuthPayload = { discordAccessToken: string; sessionToken: string; user: UserSummary }

export type DiscordBootApi = {
  discordConfig(): Promise<{ enabled: boolean; clientId: string | null }>
  discordAuth(code: string): Promise<DiscordAuthPayload>
  discordRoom(instanceId: string, nickname?: string): Promise<{ room: MultiplayerRoom }>
}

export type DiscordBootDeps = {
  api: DiscordBootApi
  createSdk: (clientId: string) => ActivitySdk
  instanceId: string
  /** Pseudo dans la salle ; par defaut le nom Discord du joueur. */
  nickname?: string
  /** Pose la session pour les requetes suivantes (Authorization: Bearer). */
  setBearer: (token: string | null) => void
  onStep?: (step: DiscordBootStep) => void
}

export type DiscordBootResult = {
  sdk: ActivitySdk
  clientId: string
  user: UserSummary
  sessionToken: string
  room: MultiplayerRoom
}

// Seul le pseudo : pas d'e-mail, pas de liste de serveurs ni d'amis.
export const DISCORD_SCOPES = ["identify"] as const

const CONFIG_UNREACHABLE = "Impossible de joindre le serveur de Blindz. Vérifie ta connexion et réessaie."

export async function bootDiscordActivity(deps: DiscordBootDeps): Promise<DiscordBootResult> {
  const step = (s: DiscordBootStep) => deps.onStep?.(s)

  step("config")
  let config: { enabled: boolean; clientId: string | null }
  try {
    config = await deps.api.discordConfig()
  } catch (err) {
    throw new DiscordBootError("session_failed", CONFIG_UNREACHABLE, err)
  }
  if (!config.enabled || !config.clientId) {
    throw new DiscordBootError("disabled", "L'Activité Discord n'est pas encore activée sur ce serveur.")
  }
  const clientId = config.clientId

  step("sdk")
  const sdk = deps.createSdk(clientId)
  await sdk.ready()

  step("authorize")
  let code: string
  try {
    ;({ code } = await sdk.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [...DISCORD_SCOPES],
    }))
  } catch (err) {
    throw new DiscordBootError(
      "authorize_refused",
      "Blindz a besoin de ton pseudo Discord pour te mettre dans la partie. Relance l'Activité et accepte.",
      err,
    )
  }

  step("session")
  let auth: DiscordAuthPayload
  try {
    auth = await deps.api.discordAuth(code)
  } catch (err) {
    if (err instanceof ApiError && err.status === 502) {
      throw new DiscordBootError("discord_unavailable", err.message, err)
    }
    const message = err instanceof ApiError && err.message ? err.message : "Impossible d'ouvrir ta session. Réessaie."
    throw new DiscordBootError("session_failed", message, err)
  }
  deps.setBearer(auth.sessionToken)

  step("authenticate")
  try {
    await sdk.commands.authenticate({ access_token: auth.discordAccessToken })
  } catch (err) {
    throw new DiscordBootError("authenticate_failed", "Discord n'a pas accepté la connexion. Relance l'Activité.", err)
  }

  step("room")
  try {
    const { room } = await deps.api.discordRoom(deps.instanceId, deps.nickname ?? auth.user.username ?? undefined)
    return { sdk, clientId, user: auth.user, sessionToken: auth.sessionToken, room }
  } catch (err) {
    const message = err instanceof ApiError && err.message ? err.message : "Impossible de rejoindre la salle du salon. Réessaie."
    throw new DiscordBootError("room_failed", message, err)
  }
}
