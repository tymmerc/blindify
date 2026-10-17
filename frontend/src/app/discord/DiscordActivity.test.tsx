/**
 * La page /discord/ : ce que voit le joueur selon la situation. Parcours :
 * connexion, « Ta musique », lobby ; rien ne recharge la page (Discord ne
 * repond pas a une seconde poignee de main sur la meme iframe, 14/10/2026). Le SDK est
 * simule (DiscordSDKMock), l'API aussi ; le lobby lui-meme n'est pas teste ici
 * (ModeLobbyView a ses tests), seul compte d'y arriver avec les bons reglages :
 * jeton Bearer pose, socket vise l'API avec le jeton, extraits reecrits pour le
 * proxy, lobby en variante "discord" sur la salle du salon.
 */
import { DiscordSDKMock } from "@discord/embedded-app-sdk"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
vi.mock("./DiscordMenu", () => ({
  DiscordMenu: (props: { onDeleted: () => void }) => <button type="button" onClick={props.onDeleted}>Menu (supprimer)</button>,
}))
vi.mock("@/components/import/MusicLibrary", () => ({ MusicLibrary: () => <p>Bibliotheque</p> }))
vi.mock("@/components/import/ProfileImportBlock", () => ({ ProfileImportBlock: () => <p>Import par lien</p> }))
vi.mock("@/app/multiplayer/ModeLobbyView", () => ({
  ModeLobbyView: (props: Record<string, unknown>) => {
    mocks.lobbyProps = props
    return <p>Lobby {String(props.initialJoinCode)} ({String(props.surface)})</p>
  },
}))

import { DiscordActivity, resetDiscordActivityForTests } from "./DiscordActivity"
import { followExternalLink } from "@/lib/externalLink"

const CLIENT_ID = "123456789012345678"
const IN_DISCORD = "?frame_id=f-1&instance_id=i-4f2a&platform=desktop"
const USER = { id: 12, provider: "discord", provider_id: "987654321098765432", username: "Tym", email: null, avatar: null }
const ROOM = { id: 41, room_code: "ABC123", host_user_id: 12, status: "waiting", max_players: 12, question_count: 10, difficulty: "normal" }

function makeSdk() {
  const sdk = new DiscordSDKMock(CLIENT_ID, null, null, null)
  const authorize = vi.fn(() => Promise.resolve({ code: "le-code" }))
  const openExternalLink = vi.fn(() => Promise.resolve({ opened: true }))
  sdk._updateCommandMocks({
    authorize,
    openExternalLink,
    getInstanceConnectedParticipants: () => Promise.resolve({ participants: [
      { id: "1", username: "tym", global_name: "Tym", discriminator: "0", avatar: null, flags: 0, bot: false },
      { id: "2", username: "lea", discriminator: "0", avatar: null, flags: 0, bot: false },
    ] }),
  })
  return { sdk, authorize, openExternalLink }
}

function renderActivity(search: string, createSdk = vi.fn(() => makeSdk().sdk)) {
  const view = render(
    <ModeProvider>
      <DiscordActivity search={search} createSdk={createSdk} apiBaseUrl="https://blindz.app" />
    </ModeProvider>
  )
  return { ...view, createSdk }
}

async function enterRoom() {
  fireEvent.click(await screen.findByRole("button", { name: /entrer sans musique/i }))
  return screen.findByText(/Lobby ABC123 \(discord\)/)
}

beforeEach(() => {
  vi.clearAllMocks()
  resetDiscordActivityForTests()
  mocks.lobbyProps = null
  vi.spyOn(console, "info").mockImplementation(() => {})
  mocks.api.discordConfig.mockResolvedValue({ enabled: true, clientId: CLIENT_ID })
  mocks.api.discordAuth.mockResolvedValue({ discordAccessToken: "discord-tok", sessionToken: "sess-1", user: USER })
  mocks.api.discordRoom.mockResolvedValue({ room: ROOM })
})

describe("DiscordActivity", () => {
  it("hors Discord : explique ou se lance l'Activite, sans appeler l'API", async () => {
    renderActivity("")
    expect(await screen.findByText(/se lance depuis Discord/i)).toBeInTheDocument()
    expect(mocks.api.discordConfig).not.toHaveBeenCalled()
    expect(mocks.installUrlMappings).not.toHaveBeenCalled()
  })

  it("dans Discord : connexion, puis « Ta musique » avant toute salle", async () => {
    renderActivity(IN_DISCORD)
    expect(await screen.findByRole("heading", { name: /ta musique/i })).toBeInTheDocument()
    expect(mocks.api.discordRoom).not.toHaveBeenCalled()
    expect(mocks.installUrlMappings).toHaveBeenCalledWith("https://blindz.app")
    expect(mocks.setSrcMapper).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.setApiBearerToken).toHaveBeenCalledWith("sess-1")
    // Le socket vise le proxy lui-meme (origine de la page, chemin de la
    // correspondance /blindz) : le client socket.io a capture window.WebSocket
    // avant que le SDK ne le remplace, aucune reecriture ne le rattraperait.
    expect(mocks.configureSocket).toHaveBeenCalledWith({ origin: window.location.origin, path: "/.proxy/blindz/socket.io", auth: { token: "sess-1" } })
  })

  it("Entrer : le lobby de la salle du salon, en variante discord", async () => {
    renderActivity(IN_DISCORD)
    await enterRoom()
    expect(mocks.api.discordRoom).toHaveBeenCalledWith("i-4f2a", "Tym")
    expect(mocks.lobbyProps).toMatchObject({ mode: "friends", surface: "discord", initialJoinCode: "ABC123", initialNickname: "Tym" })
  })

  it("affiche qui est dans le salon vocal", async () => {
    renderActivity(IN_DISCORD)
    await screen.findByRole("heading", { name: /ta musique/i })
    await waitFor(() => expect(screen.getByText(/lea/)).toBeInTheDocument())
  })

  it("Quitter le lobby : retour a « Ta musique » sans recharger ni recreer le SDK, et on peut rentrer", async () => {
    const { createSdk } = renderActivity(IN_DISCORD)
    await enterRoom()
    act(() => (mocks.lobbyProps?.onLeave as () => void)())
    expect(await screen.findByRole("heading", { name: /ta musique/i })).toBeInTheDocument()
    await enterRoom()
    expect(mocks.api.discordRoom).toHaveBeenCalledTimes(2)
    expect(createSdk).toHaveBeenCalledTimes(1)
  })

  it("« Changer ma musique » depuis le lobby : l'ecran s'ouvre par-dessus, le lobby reste", async () => {
    renderActivity(IN_DISCORD)
    await enterRoom()
    act(() => (mocks.lobbyProps?.onEditMusic as () => void)())
    const dialog = screen.getByRole("dialog", { name: /ta musique/i })
    expect(screen.getByText(/Lobby ABC123/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: /retour au lobby/i }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(mocks.api.discordRoom).toHaveBeenCalledTimes(1)
  })

  it("un seul SDK et un seul demarrage par page, meme si le composant est remonte", async () => {
    const createSdk = vi.fn(() => makeSdk().sdk)
    const first = renderActivity(IN_DISCORD, createSdk)
    await screen.findByRole("heading", { name: /ta musique/i })
    first.unmount()
    renderActivity(IN_DISCORD, createSdk)
    expect(await screen.findByRole("heading", { name: /ta musique/i })).toBeInTheDocument()
    expect(createSdk).toHaveBeenCalledTimes(1)
    expect(mocks.installUrlMappings).toHaveBeenCalledTimes(1)
    expect(mocks.api.discordConfig).toHaveBeenCalledTimes(1)
  })

  it("autorisation refusee : Reessayer reprend avec le meme SDK, sans recharger", async () => {
    const { sdk, authorize } = makeSdk()
    authorize.mockRejectedValueOnce({ code: 5000, message: "Interaction required" })
    const createSdk = vi.fn(() => sdk)
    renderActivity(IN_DISCORD, createSdk)
    fireEvent.click(await screen.findByRole("button", { name: /réessayer/i }))
    expect(await screen.findByRole("heading", { name: /ta musique/i })).toBeInTheDocument()
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(createSdk).toHaveBeenCalledTimes(1)
  })

  it("salle refusee (pleine) : le message sur « Ta musique », Entrer reessaie", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/apiClient")>("@/lib/apiClient")
    mocks.api.discordRoom.mockRejectedValueOnce(new ApiError(409, "La salle est pleine", "room_full"))
    renderActivity(IN_DISCORD)
    fireEvent.click(await screen.findByRole("button", { name: /entrer sans musique/i }))
    expect(await screen.findByText(/La salle est pleine/)).toBeInTheDocument()
    expect(screen.queryByText(/Lobby/)).not.toBeInTheDocument()
    await enterRoom()
  })

  it("compte supprime depuis le menu : l'ecran le dit", async () => {
    renderActivity(IN_DISCORD)
    await enterRoom()
    fireEvent.click(screen.getByRole("button", { name: /menu \(supprimer\)/i }))
    expect(await screen.findByText(/compte supprimé/i)).toBeInTheDocument()
    expect(screen.queryByText(/Lobby ABC123/)).not.toBeInTheDocument()
  })

  it("Activite desactivee cote serveur : le dit, sans socket, session ni bouton", async () => {
    mocks.api.discordConfig.mockResolvedValue({ enabled: false, clientId: null })
    renderActivity(IN_DISCORD)
    expect(await screen.findByText(/pas encore activée/i)).toBeInTheDocument()
    expect(mocks.configureSocket).not.toHaveBeenCalled()
    expect(mocks.setApiBearerToken).not.toHaveBeenCalled()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("liens vers Spotify ou Deezer : ouverts par le SDK (un target=_blank est bloque dans l'iframe)", async () => {
    const { sdk, openExternalLink } = makeSdk()
    renderActivity(IN_DISCORD, vi.fn(() => sdk))
    await screen.findByRole("heading", { name: /ta musique/i })
    const event = { preventDefault: vi.fn() }
    followExternalLink(event, "https://open.spotify.com/track/x")
    expect(event.preventDefault).toHaveBeenCalled()
    expect(openExternalLink).toHaveBeenCalledWith({ url: "https://open.spotify.com/track/x" })
  })

  it("journalise le demarrage sous [blindz-discord]", async () => {
    renderActivity(IN_DISCORD)
    await enterRoom()
    const lines = vi.mocked(console.info).mock.calls.map(call => String(call[0]))
    expect(lines).toContain("[blindz-discord] montage")
    expect(lines).toContain("[blindz-discord] salle ok")
  })
})

describe("socketSettings", () => {
  it("origine de la page, chemin du proxy sans le chemin de base de l'API, jeton dans le handshake", async () => {
    const { socketSettings } = await import("./DiscordActivity")
    expect(socketSettings("https://123456789012345678.discordsays.com", "sess-1"))
      .toEqual({ origin: "https://123456789012345678.discordsays.com", path: "/.proxy/blindz/socket.io", auth: { token: "sess-1" } })
  })
})
