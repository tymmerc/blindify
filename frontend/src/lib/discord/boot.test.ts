// Demarrage de l'Activite, avec le SDK simule de Discord (DiscordSDKMock) :
// configuration publique, autorisation, session Blindz, authentification du
// SDK, salle du salon. Chaque etape est annoncee, chaque echec a un code.
import { DiscordSDKMock } from "@discord/embedded-app-sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/apiClient"
import { DiscordBootError, bootDiscordActivity } from "@/lib/discord/boot"

const CLIENT_ID = "123456789012345678"
const USER = { id: 12, provider: "discord", provider_id: "987654321098765432", username: "Tym", email: null, avatar: null }
const ROOM = { id: 41, room_code: "ABC123", host_user_id: 12, status: "waiting", max_players: 12, question_count: 10, difficulty: "normal" }

function makeApi() {
  return {
    discordConfig: vi.fn().mockResolvedValue({ enabled: true, clientId: CLIENT_ID }),
    discordAuth: vi.fn().mockResolvedValue({ discordAccessToken: "discord-tok", sessionToken: "sess-1", user: USER }),
    discordRoom: vi.fn().mockResolvedValue({ room: ROOM }),
  }
}

function makeSdk() {
  const sdk = new DiscordSDKMock(CLIENT_ID, null, null, null)
  const authorize = vi.fn().mockResolvedValue({ code: "le-code" })
  const authenticate = vi.fn().mockResolvedValue({
    access_token: "discord-tok",
    user: { id: "987654321098765432", username: "tym", discriminator: "0", avatar: null, public_flags: 0, global_name: "Tym" },
    scopes: ["identify"],
    expires: new Date(2121, 1, 1).toString(),
    application: { id: CLIENT_ID, name: "Blindz", description: "", icon: null },
  })
  sdk._updateCommandMocks({ authorize, authenticate })
  return { sdk, authorize, authenticate }
}

beforeEach(() => {
  // Le SDK simule journalise chaque commande en console.info.
  vi.spyOn(console, "info").mockImplementation(() => {})
})

describe("bootDiscordActivity", () => {
  it("enchaine les etapes dans l'ordre et rend la session, l'utilisateur et la salle", async () => {
    const api = makeApi()
    const { sdk, authorize, authenticate } = makeSdk()
    const steps: string[] = []
    const setBearer = vi.fn()

    const result = await bootDiscordActivity({
      api,
      createSdk: () => sdk,
      instanceId: "i-1",
      nickname: "Tym",
      setBearer,
      onStep: step => steps.push(step),
    })

    expect(steps).toEqual(["config", "sdk", "authorize", "session", "authenticate", "room"])
    // Seul le pseudo est demande a Discord (identify) : pas d'e-mail, pas de serveurs.
    expect(authorize).toHaveBeenCalledWith({ client_id: CLIENT_ID, response_type: "code", state: "", prompt: "none", scope: ["identify"] })
    expect(api.discordAuth).toHaveBeenCalledWith("le-code")
    // La session est posee AVANT la salle : la requete de la salle en a besoin.
    expect(setBearer).toHaveBeenCalledWith("sess-1")
    expect(setBearer.mock.invocationCallOrder[0]).toBeLessThan(api.discordRoom.mock.invocationCallOrder[0])
    expect(authenticate).toHaveBeenCalledWith({ access_token: "discord-tok" })
    expect(api.discordRoom).toHaveBeenCalledWith("i-1", "Tym")
    expect(result).toEqual({ sdk, clientId: CLIENT_ID, user: USER, sessionToken: "sess-1", room: ROOM })
  })

  it("Activite desactivee cote serveur : erreur disabled, sans toucher au SDK", async () => {
    const api = makeApi()
    api.discordConfig.mockResolvedValue({ enabled: false, clientId: null })
    const createSdk = vi.fn()

    await expect(bootDiscordActivity({ api, createSdk, instanceId: "i-1", setBearer: vi.fn() }))
      .rejects.toMatchObject({ name: "DiscordBootError", code: "disabled" })
    expect(createSdk).not.toHaveBeenCalled()
  })

  it("le joueur refuse l'autorisation : authorize_refused", async () => {
    const api = makeApi()
    const { sdk } = makeSdk()
    sdk._updateCommandMocks({ authorize: () => Promise.reject({ code: 4001, message: "cancelled" }) })

    await expect(bootDiscordActivity({ api, createSdk: () => sdk, instanceId: "i-1", setBearer: vi.fn() }))
      .rejects.toMatchObject({ code: "authorize_refused" })
    expect(api.discordAuth).not.toHaveBeenCalled()
  })

  it("Discord ne repond pas au serveur (502) : discord_unavailable ; autre refus : session_failed", async () => {
    const api = makeApi()
    api.discordAuth.mockRejectedValueOnce(new ApiError(502, "Discord ne répond pas", "discord_unavailable"))
    await expect(bootDiscordActivity({ api, createSdk: () => makeSdk().sdk, instanceId: "i-1", setBearer: vi.fn() }))
      .rejects.toMatchObject({ code: "discord_unavailable" })

    api.discordAuth.mockRejectedValueOnce(new ApiError(401, "refusé", "discord_code_rejected"))
    await expect(bootDiscordActivity({ api, createSdk: () => makeSdk().sdk, instanceId: "i-1", setBearer: vi.fn() }))
      .rejects.toMatchObject({ code: "session_failed" })
  })

  it("la salle ne peut pas etre rejointe : room_failed, la session reste posee pour un nouvel essai", async () => {
    const api = makeApi()
    api.discordRoom.mockRejectedValue(new ApiError(409, "La salle est pleine", "room_full"))
    const setBearer = vi.fn()

    await expect(bootDiscordActivity({ api, createSdk: () => makeSdk().sdk, instanceId: "i-1", setBearer }))
      .rejects.toMatchObject({ code: "room_failed", message: "La salle est pleine" })
    expect(setBearer).toHaveBeenCalledWith("sess-1")
    expect(setBearer).not.toHaveBeenCalledWith(null)
  })

  it("le client Discord ne repond jamais au READY : discord_unavailable au lieu d'un chargement sans fin", async () => {
    const api = makeApi()
    const { sdk } = makeSdk()
    sdk.ready = () => new Promise(() => {})

    await expect(bootDiscordActivity({ api, createSdk: () => sdk, instanceId: "i-1", setBearer: vi.fn(), readyTimeoutMs: 20 }))
      .rejects.toMatchObject({ code: "discord_unavailable" })
    expect(api.discordAuth).not.toHaveBeenCalled()
  })

  it("DiscordBootError garde la cause", () => {
    const cause = new Error("x")
    const err = new DiscordBootError("session_failed", "message", cause)
    expect(err.cause).toBe(cause)
    expect(err.name).toBe("DiscordBootError")
  })
})
