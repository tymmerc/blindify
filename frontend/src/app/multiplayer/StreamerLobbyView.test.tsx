/**
 * Lobby du streamer (T5) : la mise en place en 3 etapes avec le lien
 * d'overlay a copier, le format qui colle au serveur, et le lancement.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LobbyRendererProps } from "./lobbyTypes"

vi.mock("@/components/import/MusicLibrary", () => ({ MusicLibrary: () => <p>Bibliotheque</p> }))
vi.mock("@/components/import/ProfileImportBlock", () => ({ ProfileImportBlock: () => <p>Import par lien</p> }))
const streamerOverlay = vi.fn()
vi.mock("@/lib/api", () => ({ api: { streamerOverlay: (code: string) => streamerOverlay(code), updateRoomConfig: vi.fn(() => Promise.resolve({})) } }))

import { StreamerLobbyView } from "./StreamerLobbyView"

const ROOM = { id: 41, room_code: "ABC123", host_user_id: 12, status: "waiting", max_players: 12, question_count: 10, difficulty: "normal", mode: "streamer" }

function props(over: Partial<LobbyRendererProps> = {}): LobbyRendererProps {
  return {
    mode: "streamer", view: "hosting", lobbyStatus: "hosting", joinCode: "", setJoinCode: vi.fn(), joining: false,
    onHost: vi.fn(), onJoinSubmit: vi.fn(), participants: [], scores: {}, friends: [], friendsLoading: false,
    friendsError: null, activeFriends: [], onQuickJoin: vi.fn(), onInviteFriend: vi.fn(), onStart: vi.fn(), starting: false, invites: [],
    onAcceptInvite: vi.fn(), canStart: true, isHost: true, isGuest: false, room: ROOM, currentUserId: 12, importing: false,
    onImportingChange: vi.fn(),
    streamer: { subMode: "viewers_only", setSubMode: vi.fn(), viewerCount: 0 },
    ...over,
  } as unknown as LobbyRendererProps
}

beforeEach(() => {
  streamerOverlay.mockReset()
  streamerOverlay.mockResolvedValue({ url: "https://blindz.app/streamer/overlay/?salle=ABC123&jeton=1.x", expiresAt: 1 })
})

describe("lobby du streamer", () => {
  it("copie le lien d'overlay signe", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    render(<StreamerLobbyView {...props()} />)
    expect(streamerOverlay).toHaveBeenCalledWith("ABC123")
    const button = await screen.findByTestId("copy-overlay")
    await act(async () => { fireEvent.click(button) })
    expect(writeText).toHaveBeenCalledWith("https://blindz.app/streamer/overlay/?salle=ABC123&jeton=1.x")
    expect(screen.getByTestId("copy-overlay")).toHaveTextContent("Lien copié")
  })

  it("le jeton n'est jamais a l'ecran sans le demander, meme si la copie echoue", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.reject(new Error("refus"))) } })
    const { container } = render(<StreamerLobbyView {...props()} />)
    const button = await screen.findByTestId("copy-overlay")
    expect(container.innerHTML).not.toContain("jeton=")
    await act(async () => { fireEvent.click(button) })
    expect(container.innerHTML).not.toContain("jeton=")
    fireEvent.click(screen.getByRole("button", { name: "Afficher le lien" }))
    expect(screen.getByLabelText("Lien de l'overlay")).toHaveValue("https://blindz.app/streamer/overlay/?salle=ABC123&jeton=1.x")
  })

  it("lien d'overlay indisponible : le message du serveur", async () => {
    const { ApiError } = await import("@/lib/apiClient")
    streamerOverlay.mockRejectedValue(new ApiError(503, "Le lien d'overlay n'est pas configuré sur le serveur.", "overlay_desactive"))
    render(<StreamerLobbyView {...props()} />)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("pas configuré"))
  })

  it("3 etapes, dont la piste hors VOD et le code pour le chat", () => {
    render(<StreamerLobbyView {...props()} />)
    const setup = screen.getByTestId("streamer-setup")
    expect(setup).toHaveTextContent("Ajoute l'overlay dans OBS")
    expect(setup).toHaveTextContent("Garde la musique hors de ta VOD")
    expect(setup).toHaveTextContent("Donne le code à ton chat")
    expect(setup).toHaveTextContent("ABC123")
  })

  it("les formats envoient les valeurs du serveur", () => {
    const setSubMode = vi.fn()
    render(<StreamerLobbyView {...props({ streamer: { subMode: "viewers_only", setSubMode, viewerCount: 4 } })} />)
    fireEvent.click(screen.getByRole("radio", { name: /Ton chat, puis toi/ }))
    expect(setSubMode).toHaveBeenLastCalledWith("duo")
    fireEvent.click(screen.getByRole("radio", { name: /Toi tout seul/ }))
    expect(setSubMode).toHaveBeenLastCalledWith("solo")
    expect(screen.getByTestId("streamer-viewers")).toHaveTextContent("4 viewers prêts")
  })

  it("le bouton Lancer lance", () => {
    const onStart = vi.fn()
    render(<StreamerLobbyView {...props({ onStart })} />)
    fireEvent.click(screen.getByRole("button", { name: "Lancer la partie" }))
    expect(onStart).toHaveBeenCalled()
  })
})
