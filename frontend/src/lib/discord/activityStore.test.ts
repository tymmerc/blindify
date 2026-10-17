// Le parcours de l'Activite, hors de React : connexion, ecran « Ta musique »,
// salle du salon, depart, reprises. Une seule poignee de main par page :
// aucun chemin ne recree le SDK ni ne recharge la page (Discord ne repond pas
// a une seconde poignee de main, vu le 14/10/2026).
import { DiscordSDKMock } from "@discord/embedded-app-sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/apiClient"
import { createActivityStore, type ActivityState } from "@/lib/discord/activityStore"

const CLIENT_ID = "123456789012345678"
const USER = { id: 12, provider: "discord", provider_id: "987654321098765432", username: "Tym", email: null, avatar: null }
const ROOM = { id: 41, room_code: "ABC123", host_user_id: 12, status: "waiting", max_players: 12, question_count: 10, difficulty: "normal" }

function setup(over: { ready?: () => Promise<void> } = {}) {
  const sdk = new DiscordSDKMock(CLIENT_ID, null, null, null)
  const authorize = vi.fn(() => Promise.resolve({ code: "le-code" }))
  sdk._updateCommandMocks({ authorize })
  if (over.ready) sdk.ready = over.ready
  const close = vi.spyOn(sdk, "close")
  const api = {
    discordConfig: vi.fn().mockResolvedValue({ enabled: true, clientId: CLIENT_ID }),
    discordAuth: vi.fn().mockResolvedValue({ discordAccessToken: "discord-tok", sessionToken: "sess-1", user: USER }),
    discordRoom: vi.fn().mockResolvedValue({ room: ROOM }),
  }
  const deps = {
    api,
    createSdk: vi.fn(() => sdk),
    setBearer: vi.fn(),
    installMappings: vi.fn(),
    onSession: vi.fn(),
    instanceId: "i-4f2a",
    readyTimeoutMs: 30,
    log: vi.fn(),
  }
  const store = createActivityStore(deps)
  const states: ActivityState[] = []
  store.subscribe(() => states.push(store.getState()))
  return { sdk, authorize, close, api, deps, store, states }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
async function until(store: { getState(): ActivityState }, kind: ActivityState["kind"]) {
  for (let i = 0; i < 200 && store.getState().kind !== kind; i++) await new Promise(r => setTimeout(r, 2))
  expect(store.getState().kind).toBe(kind)
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {})
})

describe("createActivityStore", () => {
  it("connexion puis ecran « Ta musique » : la salle n'est pas encore demandee", async () => {
    const { store, api, deps } = setup()
    store.start()
    await until(store, "music")
    expect(api.discordRoom).not.toHaveBeenCalled()
    expect(deps.installMappings).toHaveBeenCalledTimes(1)
    expect(deps.setBearer).toHaveBeenCalledWith("sess-1")
    expect(deps.onSession).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: "sess-1", user: USER }))
  })

  it("start() rappele (composant remonte) : un seul SDK, une seule config", async () => {
    const { store, api, deps } = setup()
    store.start()
    store.start()
    await until(store, "music")
    store.start()
    expect(deps.createSdk).toHaveBeenCalledTimes(1)
    expect(api.discordConfig).toHaveBeenCalledTimes(1)
  })

  it("Entrer : la salle du salon avec le pseudo Discord, puis le lobby", async () => {
    const { store, api } = setup()
    store.start()
    await until(store, "music")
    store.enter()
    await until(store, "lobby")
    expect(api.discordRoom).toHaveBeenCalledWith("i-4f2a", "Tym")
    expect(store.getState()).toMatchObject({ kind: "lobby", room: ROOM })
  })

  it("salle refusee : on reste sur « Ta musique » avec le message, Entrer reessaie", async () => {
    const { store, api } = setup()
    api.discordRoom.mockRejectedValueOnce(new ApiError(409, "La salle est pleine", "room_full"))
    store.start()
    await until(store, "music")
    store.enter()
    await settle(); await settle()
    expect(store.getState()).toMatchObject({ kind: "music", entering: false, error: "La salle est pleine" })
    store.enter()
    await until(store, "lobby")
  })

  it("Quitter le lobby : retour a « Ta musique » sans SDK neuf, puis on peut rentrer", async () => {
    const { store, api, deps } = setup()
    store.start()
    await until(store, "music")
    store.enter()
    await until(store, "lobby")
    store.leave()
    expect(store.getState()).toMatchObject({ kind: "music", entering: false, error: null })
    store.enter()
    await until(store, "lobby")
    expect(api.discordRoom).toHaveBeenCalledTimes(2)
    expect(deps.createSdk).toHaveBeenCalledTimes(1)
  })

  it("autorisation refusee : Reessayer reprend avec le meme SDK, sans nouvelle poignee de main", async () => {
    const { store, authorize, api, deps } = setup()
    authorize.mockRejectedValueOnce({ code: 5000, message: "Interaction required" })
    store.start()
    await until(store, "error")
    expect(store.getState()).toMatchObject({ kind: "error", code: "authorize_refused", action: "retry" })
    store.retry()
    await until(store, "music")
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(deps.createSdk).toHaveBeenCalledTimes(1)
    expect(api.discordConfig).toHaveBeenCalledTimes(1)
  })

  it("serveur injoignable avant tout SDK : Reessayer refait tout, sans risque", async () => {
    const { store, api, deps } = setup()
    api.discordConfig.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    store.start()
    await until(store, "error")
    expect(store.getState()).toMatchObject({ action: "retry" })
    store.retry()
    await until(store, "music")
    expect(deps.createSdk).toHaveBeenCalledTimes(1)
  })

  it("READY absent : pas de Reessayer, on propose de fermer l'Activite, qui la ferme", async () => {
    const { store, close, deps } = setup({ ready: () => new Promise(() => {}) })
    store.start()
    await until(store, "error")
    expect(store.getState()).toMatchObject({ kind: "error", code: "discord_unavailable", action: "relaunch" })
    store.retry()
    expect(deps.createSdk).toHaveBeenCalledTimes(1)
    store.close()
    expect(close).toHaveBeenCalledWith(1000, expect.any(String))
  })

  it("Activite desactivee : rien a reessayer", async () => {
    const { store, api } = setup()
    api.discordConfig.mockResolvedValue({ enabled: false, clientId: null })
    store.start()
    await until(store, "error")
    expect(store.getState()).toMatchObject({ code: "disabled", action: "none" })
  })

  it("compte supprime : ecran final", async () => {
    const { store } = setup()
    store.start()
    await until(store, "music")
    store.markDeleted()
    expect(store.getState().kind).toBe("deleted")
  })
})
