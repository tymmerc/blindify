/**
 * Variante Discord du lobby entre amis : pas d'ecran d'entree du site (code a
 * taper, lien « Retour » qui sortirait de l'Activite), et la musique, choisie
 * au lancement, se change par l'ecran « Ta musique » rouvert par-dessus.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LobbyRendererProps } from "./lobbyTypes"

vi.mock("@/components/import/MusicLibrary", () => ({ MusicLibrary: () => <p>Bibliotheque</p> }))
vi.mock("@/components/import/ProfileImportBlock", () => ({ ProfileImportBlock: () => <p>Import par lien</p> }))
vi.mock("./LobbyDock", () => ({ LobbyDock: () => null }))
vi.mock("./RecentPlayers", () => ({ RecentPlayers: () => null }))

import { FriendsLobbyView } from "./FriendsLobbyView"

const ROOM = { id: 41, room_code: "ABC123", host_user_id: 12, status: "waiting", max_players: 12, question_count: 10, difficulty: "normal" }

function props(over: Partial<LobbyRendererProps>): LobbyRendererProps {
  return {
    mode: "friends", view: "landing", surface: "discord", lobbyStatus: "idle", joinCode: "", setJoinCode: vi.fn(), joining: false,
    onHost: vi.fn(), onJoinSubmit: vi.fn(), participants: [{ user_id: 12, username: "Tym" }], scores: {}, friends: [], friendsLoading: false,
    friendsError: null, activeFriends: [], onQuickJoin: vi.fn(), onInviteFriend: vi.fn(), onStart: vi.fn(), starting: false, invites: [],
    onAcceptInvite: vi.fn(), canStart: true, isHost: true, isGuest: false, room: ROOM, currentUserId: 12,
    ...over,
  } as unknown as LobbyRendererProps
}

describe("FriendsLobbyView, variante Discord", () => {
  it("avant d'etre dans la salle : une attente, sans code a taper ni lien qui sort de l'Activite", () => {
    render(<FriendsLobbyView {...props({ view: "landing" })} />)
    expect(screen.getByRole("status")).toHaveTextContent(/salle du salon/i)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/code de la salle/i)).not.toBeInTheDocument()
  })

  it("dans le lobby : « Changer ma musique » rouvre l'ecran Ta musique, sans import ici", () => {
    const onEditMusic = vi.fn()
    render(<FriendsLobbyView {...props({ view: "hosting", onEditMusic })} />)
    expect(screen.queryByText("Import par lien")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /changer ma musique/i }))
    expect(onEditMusic).toHaveBeenCalledTimes(1)
  })

  it("sur le site : le panneau musique reste complet", () => {
    render(<FriendsLobbyView {...props({ view: "hosting", surface: "web" })} />)
    expect(screen.getByText("Import par lien")).toBeInTheDocument()
  })

  it("dans l'Activite : aucun renvoi vers « Jouer sur Discord », on y est deja", () => {
    const { rerender } = render(<FriendsLobbyView {...props({ view: "hosting" })} />)
    expect(screen.queryByTestId("discord-hint")).not.toBeInTheDocument()
    rerender(<FriendsLobbyView {...props({ view: "landing" })} />)
    expect(screen.queryByTestId("discord-hint")).not.toBeInTheDocument()
  })
})

describe("FriendsLobbyView, renvoi vers l'Activite sur le site", () => {
  const INSTALL = "https://discord.com/oauth2/authorize?client_id=1559906854111420416"

  it("l'hote voit la ligne discrete sous le partage, le code reste la", () => {
    render(<FriendsLobbyView {...props({ view: "hosting", surface: "web" })} />)
    expect(screen.getByTestId("discord-hint")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /jouez directement dans l'appel/i })).toHaveAttribute("href", INSTALL)
  })

  it("un invite ne la voit pas", () => {
    render(<FriendsLobbyView {...props({ view: "waiting", surface: "web", isHost: false, currentUserId: 13 })} />)
    expect(screen.queryByTestId("discord-hint")).not.toBeInTheDocument()
  })

  it("l'ecran d'entree la propose sans bloquer Creer ni Rejoindre", () => {
    render(<FriendsLobbyView {...props({ view: "landing", surface: "web" })} />)
    expect(screen.getByTestId("discord-hint")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /créer une partie/i })).toBeEnabled()
    expect(screen.getByLabelText(/code de la salle/i)).toBeInTheDocument()
  })
})
