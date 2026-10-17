import type { MultiplayerRoom } from "@/lib/types"
import {
  DiscordBootError,
  connectDiscord,
  enterDiscordRoom,
  type ActivitySdk,
  type DiscordBootApi,
  type DiscordBootErrorCode,
  type DiscordBootStep,
  type DiscordSession,
} from "./boot"
import { describeError, type DiscordLog } from "./log"

/**
 * Le parcours de l'Activite, hors de React : un seul par page, quoi que
 * fassent les composants (remontage, arbre regenere).
 *
 *   boot -> music (« Ta musique ») -> lobby -> (Quitter) -> music -> ...
 *
 * Aucun chemin ne recharge la page ni ne recree le SDK : Discord ne repond pas
 * a une seconde poignee de main sur la meme iframe (vu le 14/10/2026 avec
 * « Quitter » et « Reessayer », qui rechargeaient). Un echec apres le READY se
 * reprend avec le meme SDK ; sans READY, on propose de fermer l'Activite.
 */
export type ErrorAction = "retry" | "relaunch" | "none"

export type ActivityState =
  | { kind: "boot"; step: DiscordBootStep }
  | { kind: "music"; session: DiscordSession; entering: boolean; error: string | null }
  | { kind: "lobby"; session: DiscordSession; room: MultiplayerRoom }
  | { kind: "error"; code: DiscordBootErrorCode | "unexpected"; message: string; action: ErrorAction }
  | { kind: "deleted" }

export type ActivityStoreDeps = {
  api: DiscordBootApi
  createSdk: (clientId: string) => ActivitySdk
  setBearer: (token: string | null) => void
  /** Reecriture des adresses vers le proxy : une fois par page. */
  installMappings: () => void
  /** Session ouverte : le socket peut etre regle. */
  onSession: (session: DiscordSession) => void
  instanceId: string
  readyTimeoutMs?: number
  log: DiscordLog
}

export type ActivityStore = {
  getState(): ActivityState
  subscribe(listener: () => void): () => void
  start(): void
  retry(): void
  enter(): void
  leave(): void
  close(): void
  markDeleted(): void
}

const CLOSE_NORMAL = 1000

export function createActivityStore(deps: ActivityStoreDeps): ActivityStore {
  let state: ActivityState = { kind: "boot", step: "config" }
  const listeners = new Set<() => void>()
  let started = false
  // Le SDK cree (READY recu ou non) : pour le fermer ; et de quoi reprendre apres un echec.
  let createdSdk: ActivitySdk | null = null
  let resume: { sdk: ActivitySdk; clientId: string } | null = null
  let lastError: unknown = null

  const set = (next: ActivityState) => {
    state = next
    listeners.forEach(listener => listener())
  }

  const actionFor = (err: unknown): ErrorAction => {
    if (err instanceof DiscordBootError && err.code === "disabled") return "none"
    if (err instanceof DiscordBootError && err.sdk) return "retry"
    // Pas encore de SDK : rien n'a ete envoye a Discord, tout refaire est sans risque.
    if (!createdSdk) return "retry"
    return "relaunch"
  }

  const connect = () => {
    const attempt = resume
    connectDiscord({
      api: deps.api,
      createSdk: clientId => (createdSdk = deps.createSdk(clientId)),
      setBearer: deps.setBearer,
      readyTimeoutMs: deps.readyTimeoutMs,
      log: deps.log,
      onStep: step => set({ kind: "boot", step }),
      ...(attempt ? { resume: attempt } : {}),
    }).then(
      session => {
        resume = null
        deps.onSession(session)
        set({ kind: "music", session, entering: false, error: null })
      },
      (err: unknown) => {
        lastError = err
        resume = err instanceof DiscordBootError && err.sdk && err.clientId ? { sdk: err.sdk, clientId: err.clientId } : null
        const action = actionFor(err)
        deps.log("demarrage en echec", { action, ...(err instanceof DiscordBootError ? { code: err.code, cause: describeError(err.cause) } : describeError(err)) })
        if (err instanceof DiscordBootError) {
          const message = action === "relaunch" ? "Discord ne répond pas. Ferme l'Activité et relance-la depuis le salon vocal." : err.message
          set({ kind: "error", code: err.code, message, action })
        } else {
          set({ kind: "error", code: "unexpected", message: "Un imprévu a coupé le démarrage.", action })
        }
      },
    )
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      if (started) return
      started = true
      deps.installMappings()
      connect()
    },
    retry() {
      if (state.kind !== "error" || state.action !== "retry") return
      deps.log("nouvel essai", { avecLeMemeSdk: Boolean(resume) })
      set({ kind: "boot", step: resume ? "authorize" : "config" })
      connect()
    },
    enter() {
      if (state.kind !== "music" || state.entering) return
      const { session } = state
      set({ kind: "music", session, entering: true, error: null })
      enterDiscordRoom({ api: deps.api, instanceId: deps.instanceId, nickname: session.user.username ?? undefined, log: deps.log }).then(
        room => set({ kind: "lobby", session, room }),
        (err: unknown) => set({ kind: "music", session, entering: false, error: err instanceof Error ? err.message : "Impossible de rejoindre la salle du salon." }),
      )
    },
    leave() {
      if (state.kind !== "lobby") return
      deps.log("retour a ta musique", { roomCode: state.room.room_code })
      set({ kind: "music", session: state.session, entering: false, error: null })
    },
    close() {
      const sdk = createdSdk
      deps.log("fermeture demandee", { sdk: Boolean(sdk), cause: lastError ? describeError(lastError) : null })
      sdk?.close(CLOSE_NORMAL, "Fermée depuis Blindz")
    },
    markDeleted() {
      set({ kind: "deleted" })
    },
  }
}
