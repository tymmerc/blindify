/**
 * Entree d'un invite dans un salon "Autour d'une table" par le lien du QR
 * (/multiplayer/?mode=event&code=...), avec l'API et le socket simules.
 *
 * Bug WebKit du lobby : a l'arrivee, ModeLobbyView relisait la session une
 * seconde fois (le premier setGuest(true) relancait l'effet d'amorcage) et
 * rappelait socket.connect() pendant la poignee de main. Le second CONNECT
 * faisait fermer la connexion par le serveur : room:join perdu, websocket
 * coupe, reconnexion apres une a cinq secondes.
 */
import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModeProvider } from "@/contexts/ModeContext"
import { GAME_MODES } from "@/lib/gameModes"

type Handler = (...args: unknown[]) => void

// Socket simule : connect() le rend actif (poignee de main en cours), et le
// test decide quand le serveur accepte la connexion.
function makeSocket() {
  const handlers = new Map<string, Set<Handler>>()
  const socket = {
    connected: false,
    active: false,
    id: undefined as string | undefined,
    connect: vi.fn(() => {
      socket.active = true
      return socket
    }),
    disconnect: vi.fn(() => {
      socket.active = false
      socket.connected = false
      return socket
    }),
    on: vi.fn((event: string, fn: Handler) => {
      const set = handlers.get(event) ?? new Set<Handler>()
      set.add(fn)
      handlers.set(event, set)
      return socket
    }),
    off: vi.fn((event: string, fn: Handler) => {
      handlers.get(event)?.delete(fn)
      return socket
    }),
    emit: vi.fn(() => socket),
    timeout: vi.fn(() => socket),
    accept(id: string) {
      socket.connected = true
      socket.id = id
      handlers.get("connect")?.forEach(fn => fn())
    },
  }
  return socket
}

const mocks = vi.hoisted(() => ({
  socket: null as ReturnType<typeof makeSocket> | null,
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  api: {
    checkAuth: vi.fn(),
    ensureUserSession: vi.fn(),
    joinRoom: vi.fn(),
    roomDetails: vi.fn(),
    roomState: vi.fn(),
    createRoom: vi.fn(),
    startMultiplayerGame: vi.fn(),
  },
}))

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }))
vi.mock("@/lib/api", () => ({ api: mocks.api }))
vi.mock("@/lib/socket", async () => {
  const actual = await vi.importActual<typeof import("@/lib/socket")>("@/lib/socket")
  return {
    ...actual,
    getSocket: () => mocks.socket,
    disconnectSocket: vi.fn(),
  }
})
vi.mock("@/lib/audioManager", () => ({ audioManager: { warmup: vi.fn() } }))
vi.mock("./hooks/useRoomChat", () => ({ useRoomChat: () => ({ messages: [], sendChat: vi.fn() }) }))
vi.mock("./hooks/useLobbyRps", () => ({ useLobbyRps: () => ({}) }))
vi.mock("@/hooks/useServerTime", () => ({ useServerTime: () => Date.now() }))
// Les vues du salon ne sont pas testees ici : seul compte d'y arriver.
vi.mock("./EventLobbyView", () => ({
  EventLobbyView: (props: { room: { room_code: string } | null }) =>
    props.room ? <p>Tu es dans la partie {props.room.room_code}</p> : null,
}))
vi.mock("./FriendsLobbyView", () => ({ FriendsLobbyView: () => null }))
vi.mock("./StreamerLobbyView", () => ({ StreamerLobbyView: () => null }))
vi.mock("./LobbyViews", () => ({ ResultsView: () => null }))
vi.mock("@/components/game/MultiplayerGameClient", () => ({ MultiplayerGameClient: () => null }))
vi.mock("@/components/game/StreamerGameClient", () => ({ StreamerGameClient: () => null }))
vi.mock("@/components/import/ProfileImportBlock", () => ({ ProfileImportBlock: () => null }))

import { ModeLobbyView } from "./ModeLobbyView"

const ROOM = { room_code: "ABC123", host_user_id: 1, status: "waiting", mode: "event", host_plays: false }

// Chaque lecture de session renvoie un NOUVEL objet, comme le vrai client.
const guestSession = () => ({
  user: { id: 7, username: "Lea", provider: "guest" },
  providerConnection: null,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

function renderLobby() {
  return render(
    <ModeProvider>
      <ModeLobbyView
        mode="event"
        modeConfig={GAME_MODES.event}
        intent={null}
        initialJoinCode="ABC123"
        autojoin={null}
        initialNickname="Lea"
      />
    </ModeProvider>
  )
}

describe("ModeLobbyView : un invite entre par le lien du QR", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.socket = makeSocket()
    mocks.api.checkAuth.mockImplementation(async () => guestSession())
    mocks.api.roomDetails.mockResolvedValue({ room: ROOM, participants: [{ user_id: 7, username: "Lea" }], selfPreference: null })
    mocks.api.roomState.mockResolvedValue({ room: ROOM, tracks: [], gameState: null })
  })

  it("lit la session une seule fois et n'appelle connect() qu'une fois pendant la poignee de main", async () => {
    const join = deferred<{ room: typeof ROOM }>()
    mocks.api.joinRoom.mockReturnValue(join.promise)
    renderLobby()

    await waitFor(() => expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1))
    expect(mocks.api.joinRoom).toHaveBeenCalledWith("ABC123", "Lea")
    expect(screen.getByText(/Préparation du lobby/)).toBeInTheDocument()

    // Le serveur n'a pas encore accepte le socket quand la reponse du join arrive.
    await act(async () => { join.resolve({ room: ROOM }) })
    expect(await screen.findByText(/Tu es dans la partie ABC123/)).toBeInTheDocument()

    expect(mocks.api.checkAuth).toHaveBeenCalledTimes(1)
    expect(mocks.socket!.connect).toHaveBeenCalledTimes(1)
    expect(mocks.socket!.emit).not.toHaveBeenCalledWith("room:leave", expect.anything())
  })

  it("rejoint la salle du socket une fois la connexion acceptee", async () => {
    mocks.api.joinRoom.mockResolvedValue({ room: ROOM })
    renderLobby()
    expect(await screen.findByText(/Tu es dans la partie ABC123/)).toBeInTheDocument()

    await act(async () => { mocks.socket!.accept("sock-1") })

    expect(mocks.socket!.emit).toHaveBeenCalledWith(
      "room:join",
      expect.objectContaining({ roomCode: "ABC123", user: expect.objectContaining({ id: 7 }) })
    )
    expect(mocks.socket!.connect).toHaveBeenCalledTimes(1)
  })
})
