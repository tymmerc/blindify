import { beforeEach, describe, expect, it, vi } from "vitest"

const mockDisconnect = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()

function createMockSocket() {
  return {
    connected: false,
    disconnect: mockDisconnect,
    on: mockOn,
    off: mockOff,
    emit: vi.fn(),
  }
}

const mockIo = vi.fn(() => createMockSocket())

vi.mock("socket.io-client", () => ({
  io: mockIo,
}))

describe("socket", () => {
  beforeEach(() => {
    vi.resetModules()
    mockIo.mockClear()
    mockDisconnect.mockClear()
    mockOn.mockClear()
    mockOff.mockClear()
    mockIo.mockImplementation(() => createMockSocket())
  })

  async function loadSocket() {
    const mod = await import("@/lib/socket")
    return mod
  }

  it("getSocket() returns a socket instance", async () => {
    const { getSocket } = await loadSocket()
    const socket = getSocket()
    expect(socket).toBeDefined()
    expect(socket).toHaveProperty("disconnect")
    expect(socket).toHaveProperty("on")
    expect(mockIo).toHaveBeenCalledTimes(1)
  })

  it("getSocket() returns same instance on second call (singleton)", async () => {
    const { getSocket } = await loadSocket()
    const socket1 = getSocket()
    const socket2 = getSocket()
    expect(socket1).toBe(socket2)
    expect(mockIo).toHaveBeenCalledTimes(1)
  })

  it("disconnectSocket() disconnects and clears singleton", async () => {
    const { getSocket, disconnectSocket } = await loadSocket()

    const socket = getSocket()
    expect(socket).toBeDefined()

    disconnectSocket()
    expect(mockDisconnect).toHaveBeenCalledTimes(1)

    // After disconnect, getSocket() should create a new instance
    const newSocket = getSocket()
    expect(mockIo).toHaveBeenCalledTimes(2)
    expect(newSocket).not.toBe(socket)
  })

  it("disconnectSocket() does nothing if no socket exists", async () => {
    const { disconnectSocket } = await loadSocket()
    disconnectSocket()
    expect(mockDisconnect).not.toHaveBeenCalled()
  })

  it("getSocket() registers a connect_error handler", async () => {
    const { getSocket } = await loadSocket()
    getSocket()
    expect(mockOn).toHaveBeenCalledWith("connect_error", expect.any(Function))
  })
})

// Etats d'un socket socket.io-client tels que les voit connectIfIdle :
// au repos (jamais connecte, ou deconnecte a la main / par le serveur), en
// poignee de main ou en reconnexion automatique (active, pas encore connected),
// connecte.
function fakeSocket(state: { connected: boolean; active: boolean }) {
  return { ...state, connect: vi.fn() }
}

describe("connectIfIdle", () => {
  it("connecte un socket au repos", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    const s = fakeSocket({ connected: false, active: false })
    expect(connectIfIdle(s)).toBe(true)
    expect(s.connect).toHaveBeenCalledTimes(1)
  })

  it("ne relance rien pendant la poignee de main (second CONNECT : le serveur fermait tout)", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    // Transport ouvert, CONNECT envoye, reponse du serveur pas encore arrivee :
    // un second connect() enverrait un second CONNECT et le serveur fermerait tout.
    const s = fakeSocket({ connected: false, active: true })
    expect(connectIfIdle(s)).toBe(false)
    expect(s.connect).not.toHaveBeenCalled()
  })

  it("laisse socket.io gerer sa reconnexion automatique", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    const s = fakeSocket({ connected: false, active: true })
    // Plusieurs rendus pendant la coupure : aucun connect() en plus.
    connectIfIdle(s)
    connectIfIdle(s)
    connectIfIdle(s)
    expect(s.connect).not.toHaveBeenCalled()
  })

  it("ne touche pas un socket deja connecte", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    const s = fakeSocket({ connected: true, active: true })
    expect(connectIfIdle(s)).toBe(false)
    expect(s.connect).not.toHaveBeenCalled()
  })

  it("suit le cycle de vie : un seul connect() par connexion, puis de nouveau apres un disconnect()", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    // Comme socket.io-client : connect() rend le socket actif, disconnect() le remet au repos.
    const s = { connected: false, active: false, connect: vi.fn(() => { s.active = true }) }
    connectIfIdle(s) // premier rendu
    connectIfIdle(s) // nouvel utilisateur pendant la poignee de main
    connectIfIdle(s) // entree en salle, toujours avant la reponse du serveur
    expect(s.connect).toHaveBeenCalledTimes(1)
    s.connected = true
    connectIfIdle(s)
    expect(s.connect).toHaveBeenCalledTimes(1)
    s.connected = false
    s.active = false // disconnect() volontaire
    expect(connectIfIdle(s)).toBe(true)
    expect(s.connect).toHaveBeenCalledTimes(2)
  })
})
