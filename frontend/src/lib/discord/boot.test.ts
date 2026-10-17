// Demarrage de l'Activite, avec le SDK simule de Discord (DiscordSDKMock), en
// deux temps : la connexion (configuration publique, READY, autorisation,
// session Blindz, authentification du SDK), puis la salle du salon, apres
// l'ecran « Ta musique ». Chaque etape est annoncee, chaque echec a un code.
// Une seule poignee de main par page : Discord ignore la seconde (vu le
// 14/10/2026), un echec apres le READY se reprend donc avec le meme SDK.
import { DiscordSDKMock } from "@discord/embedded-app-sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/apiClient"
import { DiscordBootError, connectDiscord, enterDiscordRoom } from "@/lib/discord/boot"

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

describe("connectDiscord", () => {
  it("enchaine les etapes dans l'ordre et rend le SDK, la session et l'utilisateur", async () => {
    const api = makeApi()
    const { sdk, authorize, authenticate } = makeSdk()
    const steps: string[] = []
    const setBearer = vi.fn()

    const session = await connectDiscord({ api, createSdk: () => sdk, setBearer, onStep: step => steps.push(step) })

    expect(steps).toEqual(["config", "sdk", "authorize", "session", "authenticate"])
    // Seul le pseudo est demande a Discord (identify) : pas d'e-mail, pas de serveurs.
    expect(authorize).toHaveBeenCalledWith({ client_id: CLIENT_ID, response_type: "code", state: "", prompt: "none", scope: ["identify"] })
    expect(api.discordAuth).toHaveBeenCalledWith("le-code")
    expect(setBearer).toHaveBeenCalledWith("sess-1")
    expect(authenticate).toHaveBeenCalledWith({ access_token: "discord-tok" })
    expect(api.discordRoom).not.toHaveBeenCalled()
    expect(session).toEqual({ sdk, clientId: CLIENT_ID, user: USER, sessionToken: "sess-1" })
  })

  it("Activite desactivee cote serveur : erreur disabled, sans toucher au SDK", async () => {
    const api = makeApi()
    api.discordConfig.mockResolvedValue({ enabled: false, clientId: null })
    const createSdk = vi.fn()

    await expect(connectDiscord({ api, createSdk, setBearer: vi.fn() }))
      .rejects.toMatchObject({ name: "DiscordBootError", code: "disabled" })
    expect(createSdk).not.toHaveBeenCalled()
  })

  it("le joueur refuse l'autorisation : authorize_refused, avec le SDK pret pour reprendre", async () => {
    const api = makeApi()
    const { sdk } = makeSdk()
    sdk._updateCommandMocks({ authorize: () => Promise.reject({ code: 4001, message: "cancelled" }) })

    const err = await connectDiscord({ api, createSdk: () => sdk, setBearer: vi.fn() }).catch(e => e)
    expect(err).toMatchObject({ code: "authorize_refused" })
    expect((err as DiscordBootError).sdk).toBe(sdk)
    expect(api.discordAuth).not.toHaveBeenCalled()
  })

  it("Discord ne repond pas au serveur (502) : discord_unavailable ; autre refus : session_failed", async () => {
    const api = makeApi()
    api.discordAuth.mockRejectedValueOnce(new ApiError(502, "Discord ne répond pas", "discord_unavailable"))
    await expect(connectDiscord({ api, createSdk: () => makeSdk().sdk, setBearer: vi.fn() }))
      .rejects.toMatchObject({ code: "discord_unavailable" })

    api.discordAuth.mockRejectedValueOnce(new ApiError(401, "refusé", "discord_code_rejected"))
    await expect(connectDiscord({ api, createSdk: () => makeSdk().sdk, setBearer: vi.fn() }))
      .rejects.toMatchObject({ code: "session_failed" })
  })

  it("reprise apres un echec : meme SDK, sans nouvelle config ni nouvelle poignee de main", async () => {
    const api = makeApi()
    const { sdk, authorize } = makeSdk()
    const createSdk = vi.fn()

    const session = await connectDiscord({ api, createSdk, setBearer: vi.fn(), resume: { sdk, clientId: CLIENT_ID } })

    expect(createSdk).not.toHaveBeenCalled()
    expect(api.discordConfig).not.toHaveBeenCalled()
    expect(authorize).toHaveBeenCalledTimes(1)
    expect(session.sdk).toBe(sdk)
  })

  it("le client Discord ne repond jamais au READY : discord_unavailable, sans SDK a reprendre", async () => {
    const api = makeApi()
    const { sdk } = makeSdk()
    sdk.ready = () => new Promise(() => {})

    const err = await connectDiscord({ api, createSdk: () => sdk, setBearer: vi.fn(), readyTimeoutMs: 20 }).catch(e => e)
    expect(err).toMatchObject({ code: "discord_unavailable" })
    // Sans READY, rien a reprendre : il faut fermer l'Activite et la relancer.
    expect((err as DiscordBootError).sdk).toBeUndefined()
    expect(api.discordAuth).not.toHaveBeenCalled()
  })

  it("journalise chaque etape, sans jamais ecrire le code, le jeton Discord ni la session", async () => {
    const api = makeApi()
    const { sdk } = makeSdk()
    const log = vi.fn()

    await connectDiscord({ api, createSdk: () => sdk, setBearer: vi.fn(), log })

    expect(log.mock.calls.map(call => call[0])).toEqual([
      "config", "config ok", "sdk cree", "ready ok", "authorize envoye", "authorize ok", "session ok", "authenticate ok",
    ])
    const written = JSON.stringify(log.mock.calls)
    expect(written).not.toContain("le-code")
    expect(written).not.toContain("discord-tok")
    expect(written).not.toContain("sess-1")
  })

  it("journalise l'echec avec son etape et la reponse de Discord", async () => {
    const api = makeApi()
    const { sdk, authorize } = makeSdk()
    authorize.mockRejectedValue({ code: 5000, message: "Interaction required" })
    const log = vi.fn()

    await expect(connectDiscord({ api, createSdk: () => sdk, setBearer: vi.fn(), log })).rejects.toMatchObject({ code: "authorize_refused" })
    expect(log).toHaveBeenCalledWith("authorize refuse", expect.objectContaining({ code: 5000, message: "Interaction required" }))
  })

  it("READY absent : le journal dit qu'il manque, avec le delai", async () => {
    const api = makeApi()
    const { sdk } = makeSdk()
    sdk.ready = () => new Promise(() => {})
    const log = vi.fn()

    await expect(connectDiscord({ api, createSdk: () => sdk, setBearer: vi.fn(), readyTimeoutMs: 20, log }))
      .rejects.toMatchObject({ code: "discord_unavailable" })
    expect(log).toHaveBeenCalledWith("ready absent", expect.objectContaining({ timeoutMs: 20 }))
  })

  it("DiscordBootError garde la cause", () => {
    const cause = new Error("x")
    const err = new DiscordBootError("room_failed", "m", cause)
    expect(err.cause).toBe(cause)
  })
})

describe("enterDiscordRoom", () => {
  it("la salle du salon, avec le pseudo", async () => {
    const api = makeApi()
    const log = vi.fn()
    await expect(enterDiscordRoom({ api, instanceId: "i-1", nickname: "Tym", log })).resolves.toEqual(ROOM)
    expect(api.discordRoom).toHaveBeenCalledWith("i-1", "Tym")
    expect(log).toHaveBeenCalledWith("salle ok", { roomCode: "ABC123" })
  })

  it("la salle ne peut pas etre rejointe : room_failed avec le message de l'API", async () => {
    const api = makeApi()
    api.discordRoom.mockRejectedValue(new ApiError(409, "La salle est pleine", "room_full"))
    await expect(enterDiscordRoom({ api, instanceId: "i-1" })).rejects.toMatchObject({ code: "room_failed", message: "La salle est pleine" })
  })
})
