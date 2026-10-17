import type { IDiscordSDK } from "@discord/embedded-app-sdk"
import { ApiError } from "@/lib/apiClient"
import type { MultiplayerRoom, UserSummary } from "@/lib/types"
import { describeError, type DiscordLog } from "./log"

/**
 * Demarrage de l'Activite Discord, en deux temps.
 *
 * connectDiscord, dans l'ordre impose par le SDK :
 *   1. config   : l'identifiant public de l'appli, lu sur notre serveur (pas de rebuild)
 *   2. sdk      : le SDK attend le READY du client Discord
 *   3. authorize: Discord demande son accord au joueur (scope identify seulement)
 *   4. session  : notre serveur echange le code contre une session Blindz
 *   5. authenticate : le SDK recoit le jeton d'acces (il en a besoin pour ses commandes)
 * Puis l'ecran « Ta musique », puis enterDiscordRoom :
 *   6. room     : la salle du salon, retrouvee ou creee par le serveur
 *
 * Une seule poignee de main par page : Discord ignore la seconde, y compris
 * apres un rechargement de l'iframe (vu le 14/10/2026, « Quitter » et
 * « Reessayer » rechargeaient). Un echec apres le READY garde donc le SDK
 * (DiscordBootError.sdk) pour reprendre sans recharger ; sans READY, il ne
 * reste qu'a fermer l'Activite et la relancer.
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
  /** Le SDK deja pret (READY recu) : un nouvel essai le reprend, sans nouvelle poignee de main. */
  sdk?: ActivitySdk
  clientId?: string

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

export type DiscordConnectDeps = {
  api: DiscordBootApi
  createSdk: (clientId: string) => ActivitySdk
  /** Pose la session pour les requetes suivantes (Authorization: Bearer). */
  setBearer: (token: string | null) => void
  onStep?: (step: DiscordBootStep) => void
  /** Delai accorde au READY du client Discord (tests). */
  readyTimeoutMs?: number
  /** Journal de chaque etape (console de la page) ; jamais de code ni de jeton. */
  log?: DiscordLog
  /** Nouvel essai apres un echec qui a suivi le READY : meme SDK, ni config ni poignee de main. */
  resume?: { sdk: ActivitySdk; clientId: string }
}

export type DiscordSession = {
  sdk: ActivitySdk
  clientId: string
  user: UserSummary
  sessionToken: string
}

// Seul le pseudo : pas d'e-mail, pas de liste de serveurs ni d'amis.
export const DISCORD_SCOPES = ["identify"] as const

// Le client Discord repond en moins d'une seconde a la poignee de main ; au
// dela, la page n'est pas dans un vrai client (ou il est plante) : mieux vaut
// le dire qu'un chargement sans fin.
export const SDK_READY_TIMEOUT_MS = 15_000

const RELAUNCH = "Discord ne répond pas. Ferme l'Activité et relance-la."
const CONFIG_UNREACHABLE = "Impossible de joindre le serveur de Blindz. Vérifie ta connexion et réessaie."

function readyWithin(sdk: ActivitySdk, ms: number, log: DiscordLog): Promise<void> {
  const started = Date.now()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      log("ready absent", { timeoutMs: ms })
      reject(new DiscordBootError("discord_unavailable", RELAUNCH))
    }, ms)
    sdk.ready().then(
      () => { clearTimeout(timer); log("ready ok", { ms: Date.now() - started }); resolve() },
      err => { clearTimeout(timer); log("ready en erreur", describeError(err)); reject(err) },
    )
  })
}

/** Pose le SDK pret sur l'erreur : l'ecran d'erreur peut reprendre sans recharger. */
function resumable(err: DiscordBootError, sdk: ActivitySdk, clientId: string): DiscordBootError {
  err.sdk = sdk
  err.clientId = clientId
  return err
}

async function readyClient(deps: DiscordConnectDeps, log: DiscordLog, step: (s: DiscordBootStep) => void) {
  if (deps.resume) {
    log("reprise", { clientId: deps.resume.clientId })
    return deps.resume
  }
  step("config")
  log("config")
  let config: { enabled: boolean; clientId: string | null }
  try {
    config = await deps.api.discordConfig()
  } catch (err) {
    log("config injoignable", describeError(err))
    throw new DiscordBootError("session_failed", CONFIG_UNREACHABLE, err)
  }
  log("config ok", { enabled: config.enabled, clientId: config.clientId })
  if (!config.enabled || !config.clientId) {
    throw new DiscordBootError("disabled", "L'Activité Discord n'est pas encore activée sur ce serveur.")
  }
  const clientId = config.clientId

  step("sdk")
  const sdk = deps.createSdk(clientId)
  log("sdk cree", { instanceId: sdk.instanceId, platform: sdk.platform, sdkVersion: (sdk as { sdkVersion?: string }).sdkVersion })
  await readyWithin(sdk, deps.readyTimeoutMs ?? SDK_READY_TIMEOUT_MS, log)
  return { sdk, clientId }
}

export async function connectDiscord(deps: DiscordConnectDeps): Promise<DiscordSession> {
  const log: DiscordLog = deps.log ?? (() => {})
  const step = (s: DiscordBootStep) => deps.onStep?.(s)
  const { sdk, clientId } = await readyClient(deps, log, step)

  step("authorize")
  let code: string
  log("authorize envoye")
  try {
    ;({ code } = await sdk.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [...DISCORD_SCOPES],
    }))
    log("authorize ok")
  } catch (err) {
    log("authorize refuse", describeError(err))
    throw resumable(new DiscordBootError(
      "authorize_refused",
      "Blindz a besoin de ton pseudo Discord pour te mettre dans la partie. Réessaie et accepte.",
      err,
    ), sdk, clientId)
  }

  step("session")
  let auth: DiscordAuthPayload
  try {
    auth = await deps.api.discordAuth(code)
    log("session ok", { userId: auth.user.id })
  } catch (err) {
    log("session refusee", describeError(err))
    if (err instanceof ApiError && err.status === 502) {
      throw resumable(new DiscordBootError("discord_unavailable", err.message, err), sdk, clientId)
    }
    const message = err instanceof ApiError && err.message ? err.message : "Impossible d'ouvrir ta session. Réessaie."
    throw resumable(new DiscordBootError("session_failed", message, err), sdk, clientId)
  }
  deps.setBearer(auth.sessionToken)

  step("authenticate")
  try {
    await sdk.commands.authenticate({ access_token: auth.discordAccessToken })
    log("authenticate ok")
  } catch (err) {
    log("authenticate refuse", describeError(err))
    throw resumable(new DiscordBootError("authenticate_failed", "Discord n'a pas accepté la connexion. Réessaie.", err), sdk, clientId)
  }

  return { sdk, clientId, user: auth.user, sessionToken: auth.sessionToken }
}

export type EnterRoomDeps = {
  api: Pick<DiscordBootApi, "discordRoom">
  instanceId: string
  /** Pseudo dans la salle ; par defaut le nom Discord du joueur. */
  nickname?: string
  log?: DiscordLog
}

export async function enterDiscordRoom(deps: EnterRoomDeps): Promise<MultiplayerRoom> {
  const log: DiscordLog = deps.log ?? (() => {})
  try {
    const { room } = await deps.api.discordRoom(deps.instanceId, deps.nickname)
    log("salle ok", { roomCode: room.room_code })
    return room
  } catch (err) {
    log("salle refusee", describeError(err))
    const message = err instanceof ApiError && err.message ? err.message : "Impossible de rejoindre la salle du salon. Réessaie."
    throw new DiscordBootError("room_failed", message, err)
  }
}
