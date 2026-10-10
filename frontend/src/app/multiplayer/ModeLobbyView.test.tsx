/**
 * Entree d'un invite dans un salon "Autour d'une table" par le lien du QR
 * (/multiplayer/?mode=event&code=...), avec l'API et le socket simules.
 *
 * Bug WebKit du lobby : a l'arrivee, ModeLobbyView relisait la session une
 * seconde fois (le premier setGuest(true) relancait l'effet d'amorcage) et
 * rappelait socket.connect() pendant la poignee de main. Le second CONNECT
 * faisait fermer la connexion par le serveur : room:join perdu, websocket
 * coupe, reconnexion apres une a cinq secondes.
 *
 * Filet de securite en plus : un join reste sans reponse est abandonne au bout
 * de 8 s et relance (trois essais), au lieu de laisser "Preparation du lobby"
 * pour toujours. Ces relances s'arretent des que le joueur repart (page quittee,
 * "Retour au menu"). La lecture de la session et la creation de l'invite ont
 * aussi leur delai, pour ne jamais laisser un spinner nu.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
    /** Un evenement envoye par le serveur. */
    emitServer(event: string, payload: unknown) {
      handlers.get(event)?.forEach(fn => fn(payload))
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
    // Comme le vrai : le socket est coupe (et redevient inactif) au depart.
    disconnectSocket: vi.fn(() => { mocks.socket?.disconnect() }),
  }
})
vi.mock("@/lib/audioManager", () => ({ audioManager: { warmup: vi.fn() } }))
vi.mock("./hooks/useRoomChat", () => ({ useRoomChat: () => ({ messages: [], sendChat: vi.fn() }) }))
vi.mock("./hooks/useLobbyRps", () => ({ useLobbyRps: () => ({}) }))
vi.mock("@/hooks/useServerTime", () => ({ useServerTime: () => Date.now() }))
// Les vues du salon ne sont pas testees ici : seul compte d'y arriver.
vi.mock("./EventLobbyView", () => ({
  EventLobbyView: (props: { room: { room_code: string } | null; isHost: boolean }) =>
    props.room ? <p>Tu es dans la partie {props.room.room_code} ({props.isHost ? "hôte" : "invité"})</p> : <p>Formulaire du code</p>,
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

// Requete qui ne repond jamais, sauf pour signaler son abandon (comme fetch).
function hanging(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
  })
}

function hangingJoin(_code: string, _nickname: string | undefined, opts: { signal: AbortSignal }) {
  return hanging(opts.signal)
}

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
    expect(mocks.api.joinRoom.mock.calls[0].slice(0, 2)).toEqual(["ABC123", "Lea"])
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

  // Relais de l'hote (salon Discord, decision de Tym du 10/10/2026) : le serveur
  // envoie room:host quand l'hote part. Le lobby met la salle a jour et le dit
  // au nouvel hote, sans recharger ni rejoindre.
  it("room:host me nomme hote : la vue le sait et me le dit", async () => {
    mocks.api.joinRoom.mockResolvedValue({ room: ROOM })
    renderLobby()
    expect(await screen.findByText(/Tu es dans la partie ABC123 \(invité\)/)).toBeInTheDocument()
    await act(async () => { mocks.socket!.accept("sock-1") })

    // Comme le vrai serveur : une fois le relais fait, relire la salle donne le nouvel hote.
    mocks.api.roomDetails.mockResolvedValue({ room: { ...ROOM, host_user_id: 7 }, participants: [{ user_id: 7, username: "Lea" }], selfPreference: null })
    await act(async () => { mocks.socket!.emitServer("room:host", { roomCode: "ABC123", hostUserId: 7, serverTimestamp: Date.now() }) })

    expect(await screen.findByText(/Tu es dans la partie ABC123 \(hôte\)/)).toBeInTheDocument()
    expect(screen.getByText(/c'est toi qui lances/i)).toBeInTheDocument()
  })

  it("room:host pour une autre salle ou un autre joueur : rien ne change pour moi", async () => {
    mocks.api.joinRoom.mockResolvedValue({ room: ROOM })
    renderLobby()
    await screen.findByText(/Tu es dans la partie ABC123 \(invité\)/)
    await act(async () => { mocks.socket!.accept("sock-1") })

    await act(async () => {
      mocks.socket!.emitServer("room:host", { roomCode: "AUTRE1", hostUserId: 7, serverTimestamp: Date.now() })
      mocks.socket!.emitServer("room:host", { roomCode: "ABC123", hostUserId: 3, serverTimestamp: Date.now() })
    })

    expect(screen.getByText(/Tu es dans la partie ABC123 \(invité\)/)).toBeInTheDocument()
    expect(screen.queryByText(/c'est toi qui lances/i)).not.toBeInTheDocument()
  })

  describe("filet de securite : join sans reponse", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("relance le join, le dit au joueur, puis l'emmene dans le salon", async () => {
      const second = deferred<{ room: typeof ROOM }>()
      mocks.api.joinRoom.mockImplementationOnce(hangingJoin).mockReturnValueOnce(second.promise)
      renderLobby()
      await waitFor(() => expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1))
      expect(screen.getByText(/Si l’attente dure/)).toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(mocks.api.joinRoom).toHaveBeenCalledTimes(2)
      expect(mocks.api.joinRoom.mock.calls[0][2].signal.aborted).toBe(true)
      expect(screen.getByText(/Le réseau traîne, on réessaie tout seul/)).toBeInTheDocument()

      await act(async () => { second.resolve({ room: ROOM }) })
      expect(await screen.findByText(/Tu es dans la partie ABC123/)).toBeInTheDocument()
    })

    it("apres trois essais sans reponse, rend la main avec un message clair", async () => {
      mocks.api.joinRoom.mockImplementation(hangingJoin)
      renderLobby()
      await waitFor(() => expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1))

      await act(async () => { await vi.advanceTimersByTimeAsync(3 * 8000) })
      expect(mocks.api.joinRoom).toHaveBeenCalledTimes(3)
      expect(await screen.findByText(/Le serveur ne répond pas/)).toBeInTheDocument()
      expect(screen.getByText("Formulaire du code")).toBeInTheDocument()
      expect(screen.queryByText(/Préparation du lobby/)).not.toBeInTheDocument()
    })
  })

  describe("le joueur repart pendant l'entree", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("page quittee pendant le premier essai : plus aucun join, plus aucun connect()", async () => {
      mocks.api.joinRoom.mockImplementation(hangingJoin)
      const view = renderLobby()
      await waitFor(() => expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1))
      const connects = mocks.socket!.connect.mock.calls.length

      view.unmount()
      expect(mocks.api.joinRoom.mock.calls[0][2].signal.aborted).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(24000) })

      expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1)
      expect(mocks.socket!.connect).toHaveBeenCalledTimes(connects)
    })

    it("une reponse du join arrivee apres le depart est ignoree (ni salon, ni socket)", async () => {
      const late = deferred<{ room: typeof ROOM }>()
      mocks.api.joinRoom.mockReturnValue(late.promise)
      const view = renderLobby()
      await waitFor(() => expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1))
      const connects = mocks.socket!.connect.mock.calls.length

      view.unmount()
      await act(async () => { late.resolve({ room: ROOM }) })

      expect(mocks.api.roomDetails).not.toHaveBeenCalled()
      expect(mocks.socket!.connect).toHaveBeenCalledTimes(connects)
    })

    it("« Retour au menu » sur l'ecran d'attente ramene aux modes et arrete les relances", async () => {
      mocks.api.joinRoom.mockImplementation(hangingJoin)
      renderLobby()
      await waitFor(() => expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1))

      fireEvent.click(screen.getByRole("button", { name: "Retour au menu" }))
      expect(mocks.router.replace).toHaveBeenCalledWith("/modes")
      expect(mocks.api.joinRoom.mock.calls[0][2].signal.aborted).toBe(true)

      await act(async () => { await vi.advanceTimersByTimeAsync(24000) })
      expect(mocks.api.joinRoom).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(/Le serveur ne répond pas/)).not.toBeInTheDocument()
    })
  })

  describe("filet de securite : session sans reponse", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("relit la session trois fois au plus, puis propose de reessayer", async () => {
      mocks.api.checkAuth.mockImplementation((opts: { signal: AbortSignal }) => hanging(opts.signal))
      renderLobby()
      await waitFor(() => expect(mocks.api.checkAuth).toHaveBeenCalledTimes(1))

      await act(async () => { await vi.advanceTimersByTimeAsync(3 * 8000) })
      expect(mocks.api.checkAuth).toHaveBeenCalledTimes(3)
      expect(await screen.findByText(/Connexion impossible/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument()
      expect(mocks.api.ensureUserSession).not.toHaveBeenCalled()
      expect(mocks.api.joinRoom).not.toHaveBeenCalled()
    })

    it("ne recree pas un invite a l'aveugle : un seul essai, puis le bouton Réessayer", async () => {
      mocks.api.checkAuth.mockResolvedValue(null)
      mocks.api.ensureUserSession.mockImplementation((_nickname: string | undefined, opts: { signal: AbortSignal }) => hanging(opts.signal))
      renderLobby()
      await waitFor(() => expect(mocks.api.ensureUserSession).toHaveBeenCalledTimes(1))

      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
      expect(await screen.findByText(/Connexion impossible/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument()
      expect(mocks.api.ensureUserSession.mock.calls[0][1].signal.aborted).toBe(true)

      await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
      expect(mocks.api.ensureUserSession).toHaveBeenCalledTimes(1)
      expect(mocks.api.joinRoom).not.toHaveBeenCalled()
    })
  })
})
