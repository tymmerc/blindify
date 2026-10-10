/**
 * La page /discord/ : ce que voit le joueur selon la situation. Le SDK est
 * simule (DiscordSDKMock), l'API aussi ; le lobby lui-meme n'est pas teste ici
 * (ModeLobbyView a ses tests), seul compte d'y arriver avec les bons reglages :
 * jeton Bearer pose, socket vise l'API avec le jeton, extraits reecrits pour le
 * proxy, lobby en variante "discord" sur la salle du salon.
 */
import { DiscordSDKMock } from "@discord/embedded-app-sdk"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModeProvider } from "@/contexts/ModeContext"

const mocks = vi.hoisted(() => ({
  api: {
    discordConfig: vi.fn(),
    discordAuth: vi.fn(),
    discordRoom: vi.fn(),
  },
  setApiBearerToken: vi.fn(),
  configureSocket: vi.fn(),
  setSrcMapper: vi.fn(),
  installUrlMappings: vi.fn(() => [{ prefix: "/.proxy/blindz", target: "blindz.app" }]),
  lobbyProps: null as Record<string, unknown> | null,
}))

vi.mock("@/lib/api", () => ({ api: mocks.api }))
vi.mock("@/lib/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/apiClient")>("@/lib/apiClient")
  return { ...actual, setApiBearerToken: mocks.setApiBearerToken }
})
vi.mock("@/lib/socket", () => ({ configureSocket: mocks.configureSocket }))
vi.mock("@/lib/audioManager", () => ({ audioManager: { setSrcMapper: mocks.setSrcMapper } }))
vi.mock("@/lib/discord/urlMappings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/discord/urlMappings")>("@/lib/discord/urlMappings")
  return { ...actual, installUrlMappings: mocks.installUrlMappings }
})
vi.mock("@/app/multiplayer/ModeLobbyView", () => ({
  ModeLobbyView: (props: Record<string, unknown>) => {
    mocks.lobbyProps = props
    return <p>Lobby {String(props.initialJoinCode)} ({String(props.surface)})</p>
  },
}))

import { DiscordActivity } from "./DiscordActivity"

const CLIENT_ID = "123456789012345678"
const IN_DISCORD = "?frame_id=f-1&instance_id=i-4f2a&platform=desktop"
const USER = { id: 12, provider: "discord", provider_id: "987654321098765432", username: "Tym", email: null, avatar: null }
const ROOM = { id: 41, room_code: "ABC123", host_user_id: 12, status: "waiting", max_players: 12, question_count: 10, difficulty: "normal" }

function sdkFactory() {
  const sdk = new DiscordSDKMock(CLIENT_ID, null, null, null)
  sdk._updateCommandMocks({
    authorize: () => Promise.resolve({ code: "le-code" }),
    getInstanceConnectedParticipants: () => Promise.resolve({ participants: [
      { id: "1", username: "tym", global_name: "Tym", discriminator: "0", avatar: null, flags: 0, bot: false },
      { id: "2", username: "lea", discriminator: "0", avatar: null, flags: 0, bot: false },
    ] }),
  })
  return () => sdk
}

function renderActivity(search: string) {
  return render(
    <ModeProvider>
      <DiscordActivity search={search} createSdk={sdkFactory()} apiBaseUrl="https://blindz.app" />
    </ModeProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lobbyProps = null
  vi.spyOn(console, "info").mockImplementation(() => {})
  mocks.api.discordConfig.mockResolvedValue({ enabled: true, clientId: CLIENT_ID })
  mocks.api.discordAuth.mockResolvedValue({ discordAccessToken: "discord-tok", sessionToken: "sess-1", user: USER })
  mocks.api.discordRoom.mockResolvedValue({ room: ROOM })
})

describe("DiscordActivity", () => {
  it("hors Discord : explique ou se lance l'Activite, sans appeler l'API", () => {
    renderActivity("")
    expect(screen.getByText(/se lance depuis Discord/i)).toBeInTheDocument()
    expect(mocks.api.discordConfig).not.toHaveBeenCalled()
    expect(mocks.installUrlMappings).not.toHaveBeenCalled()
  })

  it("dans Discord : regle le proxy, la session et le socket, puis ouvre le lobby de la salle du salon", async () => {
    renderActivity(IN_DISCORD)
    expect(await screen.findByText(/Lobby ABC123 \(discord\)/)).toBeInTheDocument()

    expect(mocks.installUrlMappings).toHaveBeenCalledWith("https://blindz.app")
    expect(mocks.setSrcMapper).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.setApiBearerToken).toHaveBeenCalledWith("sess-1")
    // Le socket vise le proxy lui-meme (origine de la page, chemin de la
    // correspondance /blindz) : le client socket.io a capture window.WebSocket
    // avant que le SDK ne le remplace, aucune reecriture ne le rattraperait.
    expect(mocks.configureSocket).toHaveBeenCalledWith({ origin: window.location.origin, path: "/.proxy/blindz/socket.io", auth: { token: "sess-1" } })
    expect(mocks.api.discordRoom).toHaveBeenCalledWith("i-4f2a", "Tym")
    expect(mocks.lobbyProps).toMatchObject({ mode: "friends", surface: "discord", initialJoinCode: "ABC123", initialNickname: "Tym" })
    expect(typeof mocks.lobbyProps?.onLeave).toBe("function")
  })

  it("affiche qui est dans le salon vocal", async () => {
    renderActivity(IN_DISCORD)
    await screen.findByText(/Lobby ABC123/)
    await waitFor(() => expect(screen.getByText(/Tym/)).toBeInTheDocument())
    expect(screen.getByText(/lea/)).toBeInTheDocument()
  })

  it("Activite desactivee cote serveur : le dit, sans socket ni session", async () => {
    mocks.api.discordConfig.mockResolvedValue({ enabled: false, clientId: null })
    renderActivity(IN_DISCORD)
    expect(await screen.findByText(/pas encore activée/i)).toBeInTheDocument()
    expect(mocks.configureSocket).not.toHaveBeenCalled()
    expect(mocks.setApiBearerToken).not.toHaveBeenCalled()
  })

  it("salle refusee (pleine) : message de l'API et bouton pour reessayer", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/apiClient")>("@/lib/apiClient")
    mocks.api.discordRoom.mockRejectedValue(new ApiError(409, "La salle est pleine", "room_full"))
    renderActivity(IN_DISCORD)
    expect(await screen.findByText(/La salle est pleine/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument()
    expect(screen.queryByText(/Lobby/)).not.toBeInTheDocument()
  })
})

describe("socketSettings", () => {
  it("origine de la page, chemin du proxy sans le chemin de base de l'API, jeton dans le handshake", async () => {
    const { socketSettings } = await import("./DiscordActivity")
    expect(socketSettings("https://123456789012345678.discordsays.com", "sess-1"))
      .toEqual({ origin: "https://123456789012345678.discordsays.com", path: "/.proxy/blindz/socket.io", auth: { token: "sess-1" } })
  })
})
